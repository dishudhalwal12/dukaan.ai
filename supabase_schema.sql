-- ==============================================================================
-- DUKAN.AI – Supabase Backend Database Schema & Security Policies
-- ==============================================================================
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor -> New Query).
--
-- Tenancy model: ONE ACCOUNT = ONE STORE. Every row is owned by the `user_id`
-- that created it and is reachable only by that owner (see RLS below).
--
-- Client ids are NOT globally unique — each store's WhatsApp engine numbers its
-- own orders starting from DKN-1001, and every store using the same preset
-- shares product ids like `product_parle_g`. They are therefore stored as
-- `external_id` and scoped by `user_id`, never used as a primary key.
--
-- TRUST MODEL — read this before adding a column.
-- `business_profiles`, `products`, `orders`, `device_sessions` and
-- `merchant_preferences` are writable by their owner, so a value in them is a
-- CLAIM, not a fact. Anything a business decision would rest on is therefore
-- either DERIVED by Postgres (the two views at the bottom) or kept in a table
-- with no client policy at all (`user_roles`). Never put a number you intend to
-- act on in an owner-writable column.
--
-- !! THIS SCRIPT DROPS AND RECREATES THE TABLES !!
-- It is the bootstrap for the grocery-only build and the previous contents were
-- test output; re-running it wipes all store data.
-- ==============================================================================

-- ==============================================================================
-- 0. RESET (destructive)
-- ==============================================================================
DROP VIEW  IF EXISTS public.v_user_360 CASCADE;
DROP VIEW  IF EXISTS public.merchant_engagement_metrics CASCADE;
DROP VIEW  IF EXISTS public.merchant_order_metrics CASCADE;
DROP VIEW  IF EXISTS public.merchant_signin_stats CASCADE;
DROP VIEW  IF EXISTS public.shops_missing_location CASCADE;
DROP TABLE IF EXISTS public.user_identities CASCADE;
DROP TABLE IF EXISTS public.device_sessions CASCADE;
DROP TABLE IF EXISTS public.merchant_preferences CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.business_profiles CASCADE;
DROP TRIGGER  IF EXISTS on_auth_user_created_identity ON auth.users;
DROP FUNCTION IF EXISTS public.seed_user_role() CASCADE;
DROP FUNCTION IF EXISTS public.seed_user_identity() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_overview(uuid) CASCADE;

-- ==============================================================================
-- 1. BUSINESS PROFILES — exactly one row per store owner
-- ==============================================================================
CREATE TABLE public.business_profiles (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    store_name   TEXT NOT NULL,
    category     TEXT,
    profile_data JSONB NOT NULL DEFAULT '{}'::jsonb,  -- storeDetails + raw answers
    onboarding   JSONB NOT NULL DEFAULT '{}'::jsonb,  -- dynamic Q&A: [{question,intent,type,answer}]

    -- Owner identity, mirrored from the auth session so the shop is readable in
    -- the dashboard without joining auth.users.
    owner_first_name   TEXT,
    owner_last_name    TEXT,
    owner_email        TEXT,
    google_picture_url TEXT,
    auth_provider      TEXT,          -- google | email | ...
    preferred_language TEXT,          -- en-IN, hi-IN, ...

    -- Store location. Captured during onboarding (or at first product add) and
    -- required before the catalog can be filled. source records HOW it was
    -- obtained so approximate values are never mistaken for measured ones.
    store_lat                  DOUBLE PRECISION,
    store_lng                  DOUBLE PRECISION,
    store_location_accuracy_m  DOUBLE PRECISION,
    store_location_source      TEXT CHECK (
        store_location_source IS NULL
        OR store_location_source IN ('gps', 'manual', 'ip_approximate')
    ),
    store_location_captured_at TIMESTAMPTZ,

    created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 2. PRODUCTS / CATALOG — owner-scoped
-- ==============================================================================
CREATE TABLE public.products (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,                       -- client-side id, e.g. product_parle_g
    name        TEXT NOT NULL,
    price       TEXT NOT NULL,
    stock       INTEGER NOT NULL DEFAULT 0,
    stock_unit  TEXT NOT NULL DEFAULT 'pcs',
    image_url   TEXT,
    attributes  JSONB NOT NULL DEFAULT '{}'::jsonb,  -- business-type-specific fields
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT products_owner_external_id_key UNIQUE (user_id, external_id)
);

-- ==============================================================================
-- 3. ORDERS — owner-scoped
-- ==============================================================================
CREATE TABLE public.orders (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    external_id    TEXT NOT NULL,                    -- this store's own engine id, e.g. DKN-1001
    customer       JSONB NOT NULL DEFAULT '{}'::jsonb,
    items          JSONB NOT NULL DEFAULT '[]'::jsonb,
    total          NUMERIC NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('COD', 'UPI')),

    -- Flat copies of the customer fields, for a dashboard that reads a column
    -- instead of digging into the JSONB. Both writers (the WhatsApp bot and the
    -- POS app) fill customer/customer_* together, so the two never disagree.
    customer_phone   TEXT,
    customer_name    TEXT,
    delivery_address TEXT,
    notes            TEXT,

    status         TEXT NOT NULL CHECK (status IN ('NEW', 'PREPARING', 'READY_FOR_PICKUP', 'COMPLETED', 'REJECTED', 'CANCELLED')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT orders_owner_external_id_key UNIQUE (user_id, external_id)
);

-- ==============================================================================
-- 4. DEVICE SESSIONS — one row per app load, append-only telemetry
-- ==============================================================================
-- The browser can report everything below except the `ip_derived_*` block and
-- `client_ip_hash`, which only a server can observe (a browser cannot see its
-- own public IP, and would lie if asked). Those are written by the
-- `capture-session` Edge Function; `captured_by` records which path wrote the row.
--
-- Columns reported by APIs that not every browser implements (device memory,
-- battery, the Network Information API) are expected to be NULL on iOS Safari.
-- A NULL there means "not reported", never "zero".
CREATE TABLE public.device_sessions (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id           UUID NOT NULL,            -- per app load; makes the write idempotent
    install_id           UUID,                     -- stable per device across logins
    app_version          TEXT,
    is_returning_device  BOOLEAN,

    started_at           TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_active_at       TIMESTAMPTZ,
    session_duration_sec INTEGER,
    current_page_url     TEXT,
    referrer_url         TEXT,

    -- device
    device_category        TEXT,                   -- Mobile | Tablet | Desktop
    operating_system       TEXT,                   -- iOS | Android | Windows | macOS | Linux
    os_version             TEXT,
    browser_name           TEXT,
    browser_version        TEXT,
    user_agent_string      TEXT,
    device_memory_gb       NUMERIC,                -- navigator.deviceMemory, coarse, Chromium only
    hardware_concurrency   INTEGER,
    device_pixel_ratio     NUMERIC,
    screen_width_css       INTEGER,                -- CSS pixels
    screen_height_css      INTEGER,
    screen_width_physical  INTEGER,                -- CSS pixels x device pixel ratio
    screen_height_physical INTEGER,
    device_orientation     TEXT,                   -- portrait | landscape

    -- locale
    browser_language         TEXT,
    current_timezone         TEXT,
    timezone_offset_minutes  INTEGER,              -- minutes EAST of UTC (+330 for IST)

    -- network (Network Information API: Chromium only)
    is_online              BOOLEAN,
    network_effective_type TEXT,                   -- 4g | 3g | 2g | slow-2g
    downlink_speed_mbps    NUMERIC,
    round_trip_time_ms     INTEGER,
    is_data_saver_mode     BOOLEAN,
    is_cookies_enabled     BOOLEAN,

    -- battery (Chromium only)
    battery_level_percentage INTEGER,
    is_device_charging       BOOLEAN,

    -- performance
    app_performance_load_time_ms INTEGER,
    dom_interactive_time_ms      INTEGER,
    ssl_handshake_duration_ms    INTEGER,          -- TLS only: secureConnectionStart -> connectEnd

    -- session health, measured in the app
    session_timeout_count INTEGER,
    sync_error_count      INTEGER,

    -- deep signals, all cheap scalar reads; null when the browser cannot report.
    ua_ch_platform         TEXT,                   -- UA-CH platform, better than UA parsing
    ua_ch_model            TEXT,                   -- hardware model (Android)
    gpu_renderer           TEXT,                   -- WebGL renderer: device-tier signal
    storage_quota_bytes    BIGINT,
    storage_usage_bytes    BIGINT,
    display_mode           TEXT,                   -- browser | standalone (installed PWA)
    color_scheme           TEXT,                   -- light | dark
    prefers_reduced_motion BOOLEAN,
    prefers_reduced_data   BOOLEAN,
    max_touch_points       INTEGER,
    viewport_width_css     INTEGER,
    viewport_height_css    INTEGER,
    color_depth            INTEGER,
    active_time_sec        INTEGER,                -- foreground seconds this session
    page_view_count        INTEGER,
    cpu_pressure           TEXT,                   -- nominal|fair|serious|critical; desktop Chromium only

    -- Location: the store's ALREADY-captured position is REUSED (never re-prompted)
    -- and the coarse IP city is the fallback. geo_source says which.
    geo_lat                DOUBLE PRECISION,
    geo_lng                DOUBLE PRECISION,
    geo_accuracy_m         DOUBLE PRECISION,
    geo_altitude_m         DOUBLE PRECISION,
    geo_speed_mps          DOUBLE PRECISION,
    geo_heading_deg        DOUBLE PRECISION,
    geo_source             TEXT CHECK (
        geo_source IS NULL
        OR geo_source IN ('store_location', 'ip_approximate', 'device_gps')
    ),
    geo_city               TEXT,
    geo_region             TEXT,
    geo_country            TEXT,

    -- NOT obtainable by a web app: Compute Pressure is desktop-Chromium only and
    -- no browser exposes device temperature. Kept NULL-able for a future native
    -- shell to report; the web app never fakes it.
    temperature_celsius    NUMERIC,
    -- forward-compat bucket for a signal added before it earns a column.
    extra                  JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- observed by the server ONLY. The raw address is never stored.
    client_ip_hash        TEXT,
    ip_derived_country    TEXT,
    ip_derived_region_state TEXT,
    ip_derived_city       TEXT,
    ip_derived_postal_code TEXT,
    captured_by           TEXT NOT NULL DEFAULT 'client'
        CHECK (captured_by IN ('client', 'edge_function')),

    created_at           TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT device_sessions_owner_session_key UNIQUE (user_id, session_id)
);

-- ==============================================================================
-- 5. MERCHANT PREFERENCES — one small row per owner
-- ==============================================================================
CREATE TABLE public.merchant_preferences (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    preferred_language   TEXT,
    ui_theme_preference  TEXT,
    push_token_web       TEXT,
    is_push_subscribed   BOOLEAN NOT NULL DEFAULT false,
    feature_flags_enabled JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 6. USER ROLES — service role ONLY. No client policy, by design.
-- ==============================================================================
-- A role is an access level. If the owner could write it, the owner could grant
-- themselves anything, so this table has RLS on and ZERO policies: the anon and
-- authenticated roles can neither read nor write it. Only the service role (the
-- dashboard, and server-side functions) can touch it.
CREATE TABLE public.user_roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    user_role       TEXT NOT NULL DEFAULT 'owner'
        CHECK (user_role IN ('owner', 'staff', 'support', 'admin')),
    role_changed_at TIMESTAMPTZ,
    role_changed_by UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Every new auth user gets exactly one owner role. SECURITY DEFINER so the
-- function (not the signing-up user) performs the insert, since no client role
-- may write this table.
CREATE OR REPLACE FUNCTION public.seed_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_roles (user_id, user_role)
    VALUES (NEW.id, 'owner')
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_seed_role ON auth.users;
CREATE TRIGGER on_auth_user_created_seed_role
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.seed_user_role();

-- ==============================================================================
-- 6b. USER IDENTITIES — one durable row per ACCOUNT, seeded at signup
-- ==============================================================================
-- Written the moment the account is created, by a trigger on auth.users, so the
-- email/name/picture exist for EVERY provider (Google and email/password alike)
-- BEFORE onboarding and regardless of the client. Without this, a Google user
-- kept only a name (the email was never mapped) and an email/password user kept
-- nothing at all (empty user_metadata). The client also upserts this row on sign
-- in to refresh last_sign_in_at.
--
-- Owner-writable by RLS: it holds identity CLAIMS. Anything a business decision
-- rests on is DERIVED in a view, never read from a raw column here.
CREATE TABLE public.user_identities (
    user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email              TEXT,
    email_verified     BOOLEAN,
    owner_first_name   TEXT,
    owner_last_name    TEXT,
    display_name       TEXT,
    avatar_url         TEXT,
    auth_provider      TEXT,          -- google | email | ...
    preferred_language TEXT,
    phone              TEXT,
    signup_at          TIMESTAMPTZ,
    last_sign_in_at    TIMESTAMPTZ,
    -- Wealth/engagement profiling is opt-in; nothing is offered on it until this
    -- is true. consent_at records when it was given.
    consent_profiling  BOOLEAN NOT NULL DEFAULT false,
    consent_at         TIMESTAMPTZ,
    signals            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Every new auth user gets an identity row, at the database, for every provider.
-- SECURITY DEFINER so the insert succeeds regardless of the caller's rights.
CREATE OR REPLACE FUNCTION public.seed_user_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    meta      jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
    app       jsonb := coalesce(NEW.raw_app_meta_data, '{}'::jsonb);
    full_name text  := coalesce(nullif(meta->>'full_name', ''), nullif(meta->>'name', ''));
    first     text  := nullif(split_part(full_name, ' ', 1), '');
BEGIN
    INSERT INTO public.user_identities (
        user_id, email, email_verified, owner_first_name, owner_last_name,
        display_name, avatar_url, auth_provider, preferred_language, phone,
        signup_at, last_sign_in_at
    ) VALUES (
        NEW.id,
        NEW.email,
        (NEW.email_confirmed_at IS NOT NULL),
        first,
        nullif(substr(full_name, length(coalesce(first, '')) + 2), ''),
        nullif(full_name, ''),
        coalesce(nullif(meta->>'picture', ''), nullif(meta->>'avatar_url', '')),
        nullif(app->>'provider', ''),
        nullif(meta->>'locale', ''),
        NEW.phone,
        NEW.created_at,
        NEW.last_sign_in_at
    )
    ON CONFLICT (user_id) DO NOTHING;   -- idempotent: a re-run never duplicates
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_identity ON auth.users;
CREATE TRIGGER on_auth_user_created_identity
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.seed_user_identity();

-- Backfill every account that already exists (auth.users is not ours to wipe).
INSERT INTO public.user_identities (
    user_id, email, email_verified, display_name, avatar_url, auth_provider, signup_at
)
SELECT
    u.id,
    u.email,
    (u.email_confirmed_at IS NOT NULL),
    nullif(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'), ''),
    nullif(coalesce(u.raw_user_meta_data->>'picture', u.raw_user_meta_data->>'avatar_url'), ''),
    nullif(u.raw_app_meta_data->>'provider', ''),
    u.created_at
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

-- ==============================================================================
-- 7. INDEXES FOR PERFORMANCE
-- ==============================================================================
CREATE INDEX idx_business_profiles_user_id ON public.business_profiles(user_id);
CREATE INDEX idx_products_user_id ON public.products(user_id);
CREATE INDEX idx_products_owner_external ON public.products(user_id, external_id);
CREATE INDEX idx_orders_user_id ON public.orders(user_id);
CREATE INDEX idx_orders_owner_external ON public.orders(user_id, external_id);
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX idx_device_sessions_user_id ON public.device_sessions(user_id);
CREATE INDEX idx_device_sessions_user_started ON public.device_sessions(user_id, started_at DESC);
CREATE INDEX idx_device_sessions_install_id ON public.device_sessions(install_id);
CREATE INDEX idx_merchant_preferences_user_id ON public.merchant_preferences(user_id);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);

-- ==============================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES — owner only
-- ==============================================================================
-- Deliberately NO anon access and NO `user_id IS NULL` escape hatch. Those are
-- what let any holder of the public anon key read every store's orders (customer
-- phone numbers included) and let the first sign-in absorb every unowned row.
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Business Profiles:
CREATE POLICY "owner selects own profile" ON public.business_profiles
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner inserts own profile" ON public.business_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner updates own profile" ON public.business_profiles
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner deletes own profile" ON public.business_profiles
    FOR DELETE USING (auth.uid() = user_id);

-- Products:
CREATE POLICY "owner selects own products" ON public.products
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner inserts own products" ON public.products
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner updates own products" ON public.products
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner deletes own products" ON public.products
    FOR DELETE USING (auth.uid() = user_id);

-- Orders:
CREATE POLICY "owner selects own orders" ON public.orders
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner inserts own orders" ON public.orders
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner updates own orders" ON public.orders
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner deletes own orders" ON public.orders
    FOR DELETE USING (auth.uid() = user_id);

-- Device Sessions:
CREATE POLICY "owner selects own sessions" ON public.device_sessions
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner inserts own sessions" ON public.device_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner updates own sessions" ON public.device_sessions
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner deletes own sessions" ON public.device_sessions
    FOR DELETE USING (auth.uid() = user_id);

-- Merchant Preferences:
CREATE POLICY "owner selects own preferences" ON public.merchant_preferences
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner inserts own preferences" ON public.merchant_preferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner updates own preferences" ON public.merchant_preferences
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner deletes own preferences" ON public.merchant_preferences
    FOR DELETE USING (auth.uid() = user_id);

-- User Identities:
CREATE POLICY "owner selects own identity" ON public.user_identities
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner inserts own identity" ON public.user_identities
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner updates own identity" ON public.user_identities
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner deletes own identity" ON public.user_identities
    FOR DELETE USING (auth.uid() = user_id);

-- user_roles: NO POLICY ON PURPOSE. RLS is enabled with nothing attached, so
-- every client role is denied and only the service role can read or write it.

-- ==============================================================================
-- 9. DERIVED METRICS — computed by Postgres, impossible to forge
-- ==============================================================================
-- security_invoker = true is NOT optional here. A view defaults to running with
-- its DEFINER's rights, which would let any signed-in shopkeeper read every
-- other shop's money straight through these views, bypassing RLS entirely.
-- Money metrics exclude REJECTED and CANCELLED orders. Counting them as revenue
-- while the same view counts them as refunds made the two columns contradict
-- each other: a shop that cancels most orders showed inflated GMV.
CREATE VIEW public.merchant_order_metrics
WITH (security_invoker = true) AS
SELECT
    o.user_id,
    count(*)                                                                AS total_orders,
    coalesce(sum(o.total) FILTER (WHERE o.status NOT IN ('REJECTED', 'CANCELLED')), 0)
                                                                            AS total_gross_merchandise_value,
    coalesce(round(avg(o.total) FILTER (WHERE o.status NOT IN ('REJECTED', 'CANCELLED')), 2), 0)
                                                                            AS average_order_value_aov,
    coalesce(round(avg(jsonb_array_length(o.items))
        FILTER (WHERE o.status NOT IN ('REJECTED', 'CANCELLED')), 2), 0)    AS average_items_per_order,
    max(o.created_at)                                                       AS last_ordered_at,
    -- Elapsed weeks from the epoch, not date_part('week', interval): that unit
    -- is rejected for intervals before PG 18, and the whole script would fail to
    -- apply. Everything is numeric so round(numeric, 2) resolves — a numeric
    -- divided by a double becomes a double, and round(double, 2) does not exist.
    coalesce(round
        (count(*)::numeric
         / greatest(
             EXTRACT(EPOCH FROM (now() - min(o.created_at)))::numeric / 604800.0,
             1), 2), 0)                                                     AS order_frequency_per_week,
    coalesce(round
        (100.0 * count(*) FILTER (WHERE o.status IN ('REJECTED', 'CANCELLED'))
         / greatest(count(*), 1), 2), 0)                                     AS refund_rate_percentage,
    count(*) FILTER (WHERE o.payment_method = 'UPI')                        AS upi_orders,
    count(*) FILTER (WHERE o.payment_method = 'COD')                        AS cod_orders,
    coalesce(round
        (100.0 * count(*) FILTER (WHERE o.payment_method = 'UPI')
         / greatest(count(*), 1), 2), 0)                                     AS upi_share_percentage
FROM public.orders o
GROUP BY o.user_id;

CREATE VIEW public.merchant_signin_stats
WITH (security_invoker = true) AS
SELECT
    s.user_id,
    count(*)                     AS total_sign_in_count,
    max(s.started_at)            AS last_sign_in_at,
    min(s.started_at)            AS first_seen_at,
    count(DISTINCT s.install_id) AS device_count
FROM public.device_sessions s
GROUP BY s.user_id;

-- Engagement, derived from the append-only session log: how often the owner
-- actually opens the app, over how many devices, for how long. A number a
-- decision could rest on, so it is DERIVED here, never a client-written column.
CREATE VIEW public.merchant_engagement_metrics
WITH (security_invoker = true) AS
SELECT
    s.user_id,
    count(DISTINCT date_trunc('day', s.started_at))            AS active_days,
    count(DISTINCT s.install_id)                               AS device_count,
    round(count(*)::numeric
        / greatest(
            EXTRACT(EPOCH FROM (now() - min(s.started_at)))::numeric / 604800.0,
            1), 2)                                                 AS sessions_per_week,
    coalesce(round(avg(s.session_duration_sec)::numeric, 1), 0) AS avg_session_seconds,
    max(s.started_at)                                          AS last_seen_at
FROM public.device_sessions s
GROUP BY s.user_id;

-- ONE ROW PER USER, everything about them. This is the "click one thing and all
-- of it comes" surface. Every joined view is itself security_invoker, so it does
-- not widen what a caller can see.
CREATE VIEW public.v_user_360
WITH (security_invoker = true) AS
SELECT
    i.user_id,
    i.email,
    i.email_verified,
    i.display_name,
    i.owner_first_name,
    i.owner_last_name,
    i.avatar_url,
    i.auth_provider,
    i.preferred_language,
    i.phone,
    i.signup_at,
    i.last_sign_in_at,
    i.consent_profiling,
    b.store_name,
    b.category,
    m.total_orders,
    m.total_gross_merchandise_value,
    m.average_order_value_aov,
    m.refund_rate_percentage,
    m.upi_share_percentage,
    s.total_sign_in_count,
    s.device_count,
    s.last_sign_in_at AS last_session_at,
    e.active_days,
    e.sessions_per_week,
    e.avg_session_seconds,
    d.device_category   AS latest_device_category,
    d.operating_system  AS latest_operating_system,
    d.browser_name      AS latest_browser_name,
    d.display_mode      AS latest_display_mode,
    d.gpu_renderer      AS latest_gpu_renderer,
    d.cpu_pressure      AS latest_cpu_pressure,
    d.battery_level_percentage AS latest_battery_level,
    d.geo_city,
    d.geo_region,
    d.geo_country
FROM public.user_identities i
LEFT JOIN public.business_profiles        b ON b.user_id = i.user_id
LEFT JOIN public.merchant_order_metrics   m ON m.user_id = i.user_id
LEFT JOIN public.merchant_signin_stats    s ON s.user_id = i.user_id
LEFT JOIN public.merchant_engagement_metrics e ON e.user_id = i.user_id
LEFT JOIN LATERAL (
    SELECT * FROM public.device_sessions ds
    WHERE ds.user_id = i.user_id
    ORDER BY ds.started_at DESC
    LIMIT 1
) d ON true;

-- The whole user in ONE call, as a single jsonb. SERVICE-ROLE ONLY: a signed-in
-- shopkeeper must never read another shop's identity, devices, or orders, so
-- EXECUTE is revoked from every client role below.
CREATE OR REPLACE FUNCTION public.get_user_overview(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'identity',   (SELECT to_jsonb(i) FROM public.user_identities i WHERE i.user_id = p_user_id),
        'profile',    (SELECT to_jsonb(b) FROM public.business_profiles b WHERE b.user_id = p_user_id),
        'overview',   (SELECT to_jsonb(v) FROM public.v_user_360 v WHERE v.user_id = p_user_id),
        'engagement', (SELECT to_jsonb(e) FROM public.merchant_engagement_metrics e WHERE e.user_id = p_user_id),
        'devices',    (SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.started_at DESC), '[]'::jsonb)
                       FROM public.device_sessions d WHERE d.user_id = p_user_id),
        'orders',     (SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC), '[]'::jsonb)
                       FROM public.orders o WHERE o.user_id = p_user_id)
    );
$$;

REVOKE ALL ON FUNCTION public.get_user_overview(uuid) FROM PUBLIC, anon, authenticated;

-- ==============================================================================
-- 10. STORE LOCATION GUARD
-- ==============================================================================
-- The catalog gate is enforced in the app, but an owner-writable table cannot
-- enforce it, so this is a CONVENIENCE for reporting: shops that have not set a
-- location yet. It is deliberately a plain query, not a constraint.
CREATE VIEW public.shops_missing_location
WITH (security_invoker = true) AS
SELECT user_id, store_name, category, created_at
FROM public.business_profiles
WHERE store_lat IS NULL OR store_lng IS NULL;
