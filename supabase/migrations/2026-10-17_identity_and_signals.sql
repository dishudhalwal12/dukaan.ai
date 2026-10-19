-- ============================================================================
-- Migration: user identity + deep device signals + the 360 view
-- Project: glkzpygjodhnmtlxejzg
--
-- NON-DESTRUCTIVE and IDEMPOTENT. It drops nothing and rewrites no existing
-- row, so it is safe to run on the live database that already holds beta data.
-- Run it in the Supabase SQL Editor. It can be re-run without harm.
--
-- Why it is needed: the app (already deployed from main) writes
--   * business_profiles.owner_email
--   * the new device_sessions columns
--   * the user_identities table
-- and until those exist every write fails (42703 / PGRST205), so nothing lands.
--
-- The full destructive bootstrap (supabase/schema.sql) remains available if a
-- clean wipe is ever wanted; this file is the surgical alternative.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. business_profiles.owner_email
-- ---------------------------------------------------------------------------
ALTER TABLE public.business_profiles
    ADD COLUMN IF NOT EXISTS owner_email TEXT;

-- ---------------------------------------------------------------------------
-- 2. device_sessions: the deep-signal columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.device_sessions
    ADD COLUMN IF NOT EXISTS ua_ch_platform         TEXT,
    ADD COLUMN IF NOT EXISTS ua_ch_model            TEXT,
    ADD COLUMN IF NOT EXISTS gpu_renderer           TEXT,
    ADD COLUMN IF NOT EXISTS storage_quota_bytes    BIGINT,
    ADD COLUMN IF NOT EXISTS storage_usage_bytes    BIGINT,
    ADD COLUMN IF NOT EXISTS display_mode           TEXT,
    ADD COLUMN IF NOT EXISTS color_scheme           TEXT,
    ADD COLUMN IF NOT EXISTS prefers_reduced_motion BOOLEAN,
    ADD COLUMN IF NOT EXISTS prefers_reduced_data   BOOLEAN,
    ADD COLUMN IF NOT EXISTS max_touch_points       INTEGER,
    ADD COLUMN IF NOT EXISTS viewport_width_css     INTEGER,
    ADD COLUMN IF NOT EXISTS viewport_height_css    INTEGER,
    ADD COLUMN IF NOT EXISTS color_depth            INTEGER,
    ADD COLUMN IF NOT EXISTS active_time_sec        INTEGER,
    ADD COLUMN IF NOT EXISTS page_view_count        INTEGER,
    ADD COLUMN IF NOT EXISTS cpu_pressure           TEXT,
    ADD COLUMN IF NOT EXISTS geo_lat                DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS geo_lng                DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS geo_accuracy_m         DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS geo_altitude_m         DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS geo_speed_mps          DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS geo_heading_deg        DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS geo_source             TEXT,
    ADD COLUMN IF NOT EXISTS geo_city               TEXT,
    ADD COLUMN IF NOT EXISTS geo_region             TEXT,
    ADD COLUMN IF NOT EXISTS geo_country            TEXT,
    ADD COLUMN IF NOT EXISTS temperature_celsius    NUMERIC,
    ADD COLUMN IF NOT EXISTS extra                  JSONB NOT NULL DEFAULT '{}'::jsonb;

-- The geo_source CHECK, added only if it is not already present.
DO $$
BEGIN
    ALTER TABLE public.device_sessions
        ADD CONSTRAINT device_sessions_geo_source_check
        CHECK (
            geo_source IS NULL
            OR geo_source IN ('store_location', 'ip_approximate', 'device_gps')
        );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 3. user_identities — one durable row per account, seeded at signup
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_identities (
    user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email              TEXT,
    email_verified     BOOLEAN,
    owner_first_name   TEXT,
    owner_last_name    TEXT,
    display_name       TEXT,
    avatar_url         TEXT,
    auth_provider      TEXT,
    preferred_language TEXT,
    phone              TEXT,
    signup_at          TIMESTAMPTZ,
    last_sign_in_at    TIMESTAMPTZ,
    consent_profiling  BOOLEAN NOT NULL DEFAULT false,
    consent_at         TIMESTAMPTZ,
    signals            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner selects own identity" ON public.user_identities;
CREATE POLICY "owner selects own identity" ON public.user_identities
    FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner inserts own identity" ON public.user_identities;
CREATE POLICY "owner inserts own identity" ON public.user_identities
    FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner updates own identity" ON public.user_identities;
CREATE POLICY "owner updates own identity" ON public.user_identities
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner deletes own identity" ON public.user_identities;
CREATE POLICY "owner deletes own identity" ON public.user_identities
    FOR DELETE USING (auth.uid() = user_id);

-- Every new auth user gets an identity row, for every provider.
CREATE OR REPLACE FUNCTION public.seed_user_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    meta      jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
    app       jsonb := coalesce(NEW.raw_app_meta_data, '{}'::jsonb);
    raw_name  text  := coalesce(nullif(meta->>'full_name', ''), nullif(meta->>'name', ''));
    full_name text  := nullif(regexp_replace(trim(coalesce(raw_name, '')), '\s+', ' ', 'g'), '');
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
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_identity ON auth.users;
CREATE TRIGGER on_auth_user_created_identity
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.seed_user_identity();

-- Backfill every account that already exists (including the one just created).
INSERT INTO public.user_identities (
    user_id, email, email_verified, display_name, avatar_url, auth_provider, signup_at
)
SELECT
    u.id,
    u.email,
    (u.email_confirmed_at IS NOT NULL),
    nullif(regexp_replace(trim(coalesce(
        u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), '\s+', ' ', 'g'), ''),
    nullif(coalesce(u.raw_user_meta_data->>'picture', u.raw_user_meta_data->>'avatar_url'), ''),
    nullif(u.raw_app_meta_data->>'provider', ''),
    u.created_at
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Engagement view, the one-lookup 360 view, and the RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.merchant_engagement_metrics
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

CREATE OR REPLACE VIEW public.v_user_360
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
LEFT JOIN public.business_profiles             b ON b.user_id = i.user_id
LEFT JOIN public.merchant_order_metrics        m ON m.user_id = i.user_id
LEFT JOIN public.merchant_signin_stats         s ON s.user_id = i.user_id
LEFT JOIN public.merchant_engagement_metrics   e ON e.user_id = i.user_id
LEFT JOIN LATERAL (
    SELECT * FROM public.device_sessions ds
    WHERE ds.user_id = i.user_id
    ORDER BY ds.started_at DESC
    LIMIT 1
) d ON true;

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