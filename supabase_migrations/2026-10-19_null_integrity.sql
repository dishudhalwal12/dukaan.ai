-- ============================================================================
-- Migration: NULL audit + backfill for the columns the app always writes
-- Project: glkzpygjodhnmtlxejzg
--
-- IDEMPOTENT. It repairs existing rows, then adds defaults and NOT NULL only to
-- columns that have a real value for every account. Genuinely optional columns
-- (phone, avatar, store coordinates, last sign-in) stay nullable on purpose —
-- "no nulls" must not mean inventing facts about a shop.
--
-- Run it in the Supabase SQL Editor. Re-running is harmless.
--
-- Why this is needed:
--   * language was chosen before the store name, so the language writer could
--     create a profile row with a placeholder store name and a NULL category;
--   * the profile writer fell back to `category: null`;
--   * merchant_preferences.preferred_language could be written as NULL when
--     localStorage had no language yet;
--   * the signup trigger copied `user_metadata.locale` verbatim, so an email
--     signup with no locale produced NULL names/language.
--
-- The client fixes (cloudSync.ts, OnboardingFlow.tsx) stop new NULLs. This file
-- is the backstop for rows already in the database and for anything the client
-- is not: a restored backup, a manual SQL fix, a bot.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. user_identities: fill names, provider, language, confirmation and signup
--    time from the auth record. Every auth user has these facts, so a seeded
--    row can always be complete.
-- ---------------------------------------------------------------------------
WITH src AS (
    SELECT
        u.id,
        u.email,
        u.email_confirmed_at,
        u.created_at,
        coalesce(nullif(u.raw_app_meta_data->>'provider', ''), 'email') AS provider,
        coalesce(
            nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
            nullif(trim(u.raw_user_meta_data->>'name'), ''),
            initcap(regexp_replace(split_part(coalesce(u.email, ''), '@', 1), '[._+]+', ' ', 'g')),
            'Store Owner'
        ) AS raw_name
    FROM auth.users u
),
normalized AS (
    SELECT
        id, email, email_confirmed_at, created_at, provider,
        regexp_replace(raw_name, '\s+', ' ', 'g') AS full_name
    FROM src
),
parts AS (
    SELECT
        id, email, email_confirmed_at, created_at, provider, full_name,
        split_part(full_name, ' ', 1) AS first_name,
        nullif(substr(full_name, length(split_part(full_name, ' ', 1)) + 2), '') AS last_name
    FROM normalized
)
UPDATE public.user_identities ui
SET
    email              = coalesce(ui.email, p.email),
    email_verified     = coalesce(ui.email_verified, (p.email_confirmed_at IS NOT NULL)),
    owner_first_name   = coalesce(nullif(ui.owner_first_name, ''), nullif(p.first_name, ''), 'Store'),
    owner_last_name    = coalesce(nullif(ui.owner_last_name, ''), p.last_name, 'Owner'),
    display_name       = coalesce(nullif(ui.display_name, ''), nullif(p.full_name, ''), 'Store Owner'),
    auth_provider      = coalesce(nullif(ui.auth_provider, ''), p.provider, 'email'),
    signup_at          = coalesce(ui.signup_at, p.created_at),
    updated_at         = timezone('utc'::text, now())
FROM parts p
WHERE ui.user_id = p.id
  AND (
        ui.email IS NULL
     OR ui.email_verified IS NULL
     OR nullif(ui.owner_first_name, '') IS NULL
     OR nullif(ui.owner_last_name, '') IS NULL
     OR nullif(ui.display_name, '') IS NULL
     OR nullif(ui.auth_provider, '') IS NULL
     OR ui.signup_at IS NULL
  );

-- ---------------------------------------------------------------------------
-- 2. business_profiles: category and owner identity
-- ---------------------------------------------------------------------------
UPDATE public.business_profiles bp
SET category = coalesce(
        nullif(bp.category, ''),
        nullif(bp.profile_data->'storeDetails'->>'category', ''),
        nullif(bp.profile_data->>'category', ''),
        'Kirana / General Store'
    )
WHERE nullif(bp.category, '') IS NULL;

UPDATE public.business_profiles bp
SET
    owner_first_name   = coalesce(nullif(bp.owner_first_name, ''), ui.owner_first_name, 'Store'),
    owner_last_name    = coalesce(nullif(bp.owner_last_name, ''), ui.owner_last_name, 'Owner'),
    owner_email        = coalesce(nullif(bp.owner_email, ''), ui.email),
    google_picture_url = coalesce(bp.google_picture_url, ui.avatar_url),
    auth_provider      = coalesce(nullif(bp.auth_provider, ''), ui.auth_provider, 'email'),
    preferred_language = coalesce(
        nullif(bp.preferred_language, ''),
        nullif(bp.profile_data->>'preferredLanguage', ''),
        ui.preferred_language,
        'en'
    ),
    updated_at         = timezone('utc'::text, now())
FROM public.user_identities ui
WHERE bp.user_id = ui.user_id
  AND (
        nullif(bp.owner_first_name, '') IS NULL
     OR nullif(bp.owner_last_name, '') IS NULL
     OR nullif(bp.owner_email, '') IS NULL
     OR nullif(bp.auth_provider, '') IS NULL
     OR nullif(bp.preferred_language, '') IS NULL
  );

-- A profile with no identity row (older data) still gets its language filled.
UPDATE public.business_profiles bp
SET preferred_language = coalesce(
        nullif(bp.preferred_language, ''),
        nullif(bp.profile_data->>'preferredLanguage', ''),
        'en'
    )
WHERE nullif(bp.preferred_language, '') IS NULL;

-- ---------------------------------------------------------------------------
-- 3. merchant_preferences.preferred_language
-- ---------------------------------------------------------------------------
UPDATE public.merchant_preferences mp
SET
    preferred_language = coalesce(
        nullif(mp.preferred_language, ''),
        (SELECT bp.preferred_language FROM public.business_profiles bp WHERE bp.user_id = mp.user_id),
        (SELECT ui.preferred_language FROM public.user_identities ui WHERE ui.user_id = mp.user_id),
        'en'
    ),
    updated_at = timezone('utc'::text, now())
WHERE nullif(mp.preferred_language, '') IS NULL;

-- ---------------------------------------------------------------------------
-- 4. user_identities.preferred_language (last, so it can read the two above)
-- ---------------------------------------------------------------------------
UPDATE public.user_identities ui
SET
    preferred_language = coalesce(
        nullif(ui.preferred_language, ''),
        (SELECT bp.preferred_language FROM public.business_profiles bp WHERE bp.user_id = ui.user_id),
        (SELECT mp.preferred_language FROM public.merchant_preferences mp WHERE mp.user_id = ui.user_id),
        'en'
    ),
    updated_at = timezone('utc'::text, now())
WHERE nullif(ui.preferred_language, '') IS NULL;

-- Rows with no matching auth record (should be impossible thanks to the FK)
-- still cannot be left NULL once the constraints below are added.
UPDATE public.user_identities
SET
    owner_first_name = coalesce(nullif(owner_first_name, ''), 'Store'),
    owner_last_name  = coalesce(nullif(owner_last_name, ''), 'Owner'),
    display_name     = coalesce(nullif(display_name, ''), 'Store Owner'),
    auth_provider    = coalesce(nullif(auth_provider, ''), 'email'),
    preferred_language = coalesce(nullif(preferred_language, ''), 'en'),
    email_verified   = coalesce(email_verified, false),
    signup_at        = coalesce(signup_at, created_at, timezone('utc'::text, now()))
WHERE nullif(owner_first_name, '') IS NULL
   OR nullif(owner_last_name, '') IS NULL
   OR nullif(display_name, '') IS NULL
   OR nullif(auth_provider, '') IS NULL
   OR nullif(preferred_language, '') IS NULL
   OR email_verified IS NULL
   OR signup_at IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Signup trigger: never seed a NULL where the app expects a value.
--    (Replaces the version in 2026-10-19_fix_null_user_identities.sql.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_user_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    meta       jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
    app        jsonb := coalesce(NEW.raw_app_meta_data, '{}'::jsonb);
    email_name text  := initcap(regexp_replace(split_part(coalesce(NEW.email, ''), '@', 1), '[._+]+', ' ', 'g'));
    raw_name   text  := coalesce(
        nullif(meta->>'full_name', ''),
        nullif(meta->>'name', ''),
        nullif(email_name, ''),
        'Store Owner'
    );
    full_name  text  := nullif(regexp_replace(trim(raw_name), '\s+', ' ', 'g'), '');
    first      text  := coalesce(nullif(split_part(full_name, ' ', 1), ''), 'Store');
    last_raw   text  := nullif(substr(full_name, length(first) + 2), '');
    last       text  := coalesce(last_raw, 'Owner');
    prov       text  := coalesce(nullif(app->>'provider', ''), 'email');
    lang       text  := coalesce(nullif(meta->>'locale', ''), 'en');
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
        last,
        coalesce(full_name, 'Store Owner'),
        coalesce(nullif(meta->>'picture', ''), nullif(meta->>'avatar_url', '')),
        prov,
        lang,
        NEW.phone,
        NEW.created_at,
        NEW.last_sign_in_at
    )
    ON CONFLICT (user_id) DO UPDATE SET
        owner_first_name = EXCLUDED.owner_first_name,
        owner_last_name  = EXCLUDED.owner_last_name,
        display_name     = EXCLUDED.display_name,
        email_verified   = EXCLUDED.email_verified,
        auth_provider    = EXCLUDED.auth_provider,
        preferred_language = coalesce(
            public.user_identities.preferred_language,
            EXCLUDED.preferred_language
        ),
        last_sign_in_at  = coalesce(EXCLUDED.last_sign_in_at, public.user_identities.last_sign_in_at);

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_identity ON auth.users;
CREATE TRIGGER on_auth_user_created_identity
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.seed_user_identity();

-- ---------------------------------------------------------------------------
-- 6. Defaults + NOT NULL on the columns that now always have a real value.
--
--    Deliberately NOT constrained:
--      * user_identities.email / phone   — phone-only and email-only accounts exist
--      * user_identities.avatar_url      — many providers send no picture
--      * user_identities.last_sign_in_at — NULL means "never signed in"
--      * business_profiles.store_lat/lng — NULL means "location not captured yet"
--      * business_profiles.owner_email   — phone-only accounts have none
--      * merchant_preferences.ui_theme_preference / push_token_web
-- ---------------------------------------------------------------------------
ALTER TABLE public.business_profiles
    ALTER COLUMN category SET DEFAULT 'Kirana / General Store',
    ALTER COLUMN category SET NOT NULL,
    ALTER COLUMN preferred_language SET DEFAULT 'en',
    ALTER COLUMN preferred_language SET NOT NULL,
    ALTER COLUMN profile_data SET DEFAULT '{}'::jsonb,
    ALTER COLUMN onboarding SET DEFAULT '{}'::jsonb;

ALTER TABLE public.merchant_preferences
    ALTER COLUMN preferred_language SET DEFAULT 'en',
    ALTER COLUMN preferred_language SET NOT NULL;

ALTER TABLE public.user_identities
    ALTER COLUMN owner_first_name SET DEFAULT 'Store',
    ALTER COLUMN owner_first_name SET NOT NULL,
    ALTER COLUMN owner_last_name SET DEFAULT 'Owner',
    ALTER COLUMN owner_last_name SET NOT NULL,
    ALTER COLUMN display_name SET DEFAULT 'Store Owner',
    ALTER COLUMN display_name SET NOT NULL,
    ALTER COLUMN auth_provider SET DEFAULT 'email',
    ALTER COLUMN auth_provider SET NOT NULL,
    ALTER COLUMN preferred_language SET DEFAULT 'en',
    ALTER COLUMN preferred_language SET NOT NULL,
    ALTER COLUMN email_verified SET DEFAULT false,
    ALTER COLUMN email_verified SET NOT NULL;

-- signup_at is a fact of every auth account; keep it non-null too.
ALTER TABLE public.user_identities
    ALTER COLUMN signup_at SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. Audit: run this last. Every count must be 0 for the columns above.
--    Rows are (table, column, null_rows, total_rows).
-- ---------------------------------------------------------------------------
SELECT 'business_profiles' AS tbl, 'category' AS col,
       count(*) FILTER (WHERE category IS NULL) AS null_rows, count(*) AS total_rows
FROM public.business_profiles
UNION ALL
SELECT 'business_profiles', 'preferred_language',
       count(*) FILTER (WHERE preferred_language IS NULL), count(*)
FROM public.business_profiles
UNION ALL
SELECT 'business_profiles', 'store_name',
       count(*) FILTER (WHERE nullif(store_name, '') IS NULL), count(*)
FROM public.business_profiles
UNION ALL
SELECT 'merchant_preferences', 'preferred_language',
       count(*) FILTER (WHERE preferred_language IS NULL), count(*)
FROM public.merchant_preferences
UNION ALL
SELECT 'user_identities', 'preferred_language',
       count(*) FILTER (WHERE preferred_language IS NULL), count(*)
FROM public.user_identities
UNION ALL
SELECT 'user_identities', 'owner_first_name',
       count(*) FILTER (WHERE owner_first_name IS NULL), count(*)
FROM public.user_identities
UNION ALL
SELECT 'user_identities', 'owner_last_name',
       count(*) FILTER (WHERE owner_last_name IS NULL), count(*)
FROM public.user_identities
UNION ALL
SELECT 'user_identities', 'display_name',
       count(*) FILTER (WHERE display_name IS NULL), count(*)
FROM public.user_identities
UNION ALL
SELECT 'user_identities', 'auth_provider',
       count(*) FILTER (WHERE auth_provider IS NULL), count(*)
FROM public.user_identities
UNION ALL
SELECT 'user_identities', 'email_verified',
       count(*) FILTER (WHERE email_verified IS NULL), count(*)
FROM public.user_identities
UNION ALL
SELECT 'user_identities', 'signup_at',
       count(*) FILTER (WHERE signup_at IS NULL), count(*)
FROM public.user_identities
ORDER BY tbl, col;

-- Optional: a full per-column NULL census for every table in `public`.
-- Uncomment and run on its own if you want to inspect the optional columns too.
--
-- SELECT schemaname AS schema, relname AS tbl, attname AS col,
--        null_frac, n_distinct
-- FROM pg_stats
-- WHERE schemaname = 'public' AND null_frac > 0
-- ORDER BY null_frac DESC, relname, attname;
