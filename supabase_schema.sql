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
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP VIEW  IF EXISTS public.merchant_order_metrics CASCADE;
DROP VIEW  IF EXISTS public.merchant_signin_stats CASCADE;
DROP TABLE IF EXISTS public.suppliers CASCADE;
DROP TABLE IF EXISTS public.device_sessions CASCADE;
DROP TABLE IF EXISTS public.merchant_preferences CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.business_profiles CASCADE;
DROP FUNCTION IF EXISTS public.seed_user_role() CASCADE;

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

    -- Supplier / distributor contact details for stock replenishments
    supplier_name              TEXT,
    supplier_whatsapp          TEXT,

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
EXCEPTION WHEN OTHERS THEN
    -- Never abort auth.users signup if user_roles insert encounters an issue
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_seed_role ON auth.users;
CREATE TRIGGER on_auth_user_created_seed_role
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.seed_user_role();

-- ==============================================================================
-- 7. SUPPLIERS — owner-scoped supplier / distributor details
-- ==============================================================================
-- Stores supplier contact information per store owner for upstocking and low-stock replenishment.
CREATE TABLE public.suppliers (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    supplier_name     TEXT NOT NULL,
    supplier_whatsapp TEXT NOT NULL,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT suppliers_user_id_key UNIQUE (user_id)
);

-- ==============================================================================
-- 8. INDEXES FOR PERFORMANCE
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
CREATE INDEX idx_suppliers_user_id ON public.suppliers(user_id);

-- ==============================================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES — owner only
-- ==============================================================================
-- Deliberately NO anon access and NO `user_id IS NULL` escape hatch. Those are
-- what let any holder of the public anon key read every store's orders (customer
-- phone numbers included) and let the first sign-in absorb every unowned row.
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- Suppliers:
CREATE POLICY "owner selects own suppliers" ON public.suppliers
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner inserts own suppliers" ON public.suppliers
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner updates own suppliers" ON public.suppliers
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner deletes own suppliers" ON public.suppliers
    FOR DELETE USING (auth.uid() = user_id);

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

-- user_roles: NO POLICY ON PURPOSE. RLS is enabled with nothing attached, so
-- every client role is denied and only the service role can read or write it.

-- ==============================================================================
-- 10. DERIVED METRICS — computed by Postgres, impossible to forge
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

-- ==============================================================================
-- 11. STORE LOCATION GUARD
-- ==============================================================================
-- The catalog gate is enforced in the app, but an owner-writable table cannot
-- enforce it, so this is a CONVENIENCE for reporting: shops that have not set a
-- location yet. It is deliberately a plain query, not a constraint.
CREATE VIEW public.shops_missing_location
WITH (security_invoker = true) AS
SELECT user_id, store_name, category, created_at
FROM public.business_profiles
WHERE store_lat IS NULL OR store_lng IS NULL;
