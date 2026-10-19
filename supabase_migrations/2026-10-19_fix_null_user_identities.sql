-- ==============================================================================
-- Migration: Fix NULL owner_first_name, owner_last_name, display_name
-- Project: glkzpygjodhnmtlxejzg
--
-- NON-DESTRUCTIVE and IDEMPOTENT.
-- 1. Updates seed_user_identity() trigger so email/password signups never leave
--    first or last name null even if metadata was omitted by the client.
-- 2. Backfills all existing records in public.user_identities and
--    public.business_profiles to eliminate any NULL name/email fields.
--
-- Run this script in the Supabase SQL Editor.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Update the signup identity trigger function
-- ------------------------------------------------------------------------------
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
        full_name,
        coalesce(nullif(meta->>'picture', ''), nullif(meta->>'avatar_url', '')),
        prov,
        nullif(meta->>'locale', ''),
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
        last_sign_in_at  = coalesce(EXCLUDED.last_sign_in_at, public.user_identities.last_sign_in_at);

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_identity ON auth.users;
CREATE TRIGGER on_auth_user_created_identity
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.seed_user_identity();

-- ------------------------------------------------------------------------------
-- 2. Backfill existing NULLs in public.user_identities
-- ------------------------------------------------------------------------------
UPDATE public.user_identities ui
SET
    owner_first_name = coalesce(
        ui.owner_first_name,
        split_part(bp.profile_data->>'ownerName', ' ', 1),
        split_part(initcap(regexp_replace(split_part(ui.email, '@', 1), '[._+]+', ' ', 'g')), ' ', 1),
        'Store'
    ),
    owner_last_name = coalesce(
        ui.owner_last_name,
        nullif(substr(bp.profile_data->>'ownerName', length(split_part(bp.profile_data->>'ownerName', ' ', 1)) + 2), ''),
        nullif(substr(
            initcap(regexp_replace(split_part(ui.email, '@', 1), '[._+]+', ' ', 'g')),
            length(split_part(initcap(regexp_replace(split_part(ui.email, '@', 1), '[._+]+', ' ', 'g')), ' ', 1)) + 2
        ), ''),
        'Owner'
    ),
    display_name = coalesce(
        ui.display_name,
        bp.profile_data->>'ownerName',
        initcap(regexp_replace(split_part(ui.email, '@', 1), '[._+]+', ' ', 'g')),
        'Store Owner'
    ),
    auth_provider = coalesce(ui.auth_provider, 'email'),
    email_verified = coalesce(ui.email_verified, true)
FROM public.business_profiles bp
WHERE ui.user_id = bp.user_id
  AND (ui.owner_first_name IS NULL OR ui.owner_last_name IS NULL OR ui.display_name IS NULL);

-- Any remaining standalone user_identities with NULLs (no business_profiles row yet)
UPDATE public.user_identities
SET
    owner_first_name = coalesce(
        owner_first_name,
        split_part(initcap(regexp_replace(split_part(email, '@', 1), '[._+]+', ' ', 'g')), ' ', 1),
        'Store'
    ),
    owner_last_name = coalesce(
        owner_last_name,
        nullif(substr(
            initcap(regexp_replace(split_part(email, '@', 1), '[._+]+', ' ', 'g')),
            length(split_part(initcap(regexp_replace(split_part(email, '@', 1), '[._+]+', ' ', 'g')), ' ', 1)) + 2
        ), ''),
        'Owner'
    ),
    display_name = coalesce(
        display_name,
        initcap(regexp_replace(split_part(email, '@', 1), '[._+]+', ' ', 'g')),
        'Store Owner'
    ),
    auth_provider = coalesce(auth_provider, 'email'),
    email_verified = coalesce(email_verified, true)
WHERE owner_first_name IS NULL OR owner_last_name IS NULL OR display_name IS NULL;

-- ------------------------------------------------------------------------------
-- 3. Backfill existing NULLs in public.business_profiles
-- ------------------------------------------------------------------------------
UPDATE public.business_profiles bp
SET
    owner_first_name = coalesce(
        bp.owner_first_name,
        ui.owner_first_name,
        split_part(bp.profile_data->>'ownerName', ' ', 1),
        split_part(initcap(regexp_replace(split_part(bp.owner_email, '@', 1), '[._+]+', ' ', 'g')), ' ', 1),
        'Store'
    ),
    owner_last_name = coalesce(
        bp.owner_last_name,
        ui.owner_last_name,
        nullif(substr(bp.profile_data->>'ownerName', length(split_part(bp.profile_data->>'ownerName', ' ', 1)) + 2), ''),
        nullif(substr(
            initcap(regexp_replace(split_part(bp.owner_email, '@', 1), '[._+]+', ' ', 'g')),
            length(split_part(initcap(regexp_replace(split_part(bp.owner_email, '@', 1), '[._+]+', ' ', 'g')), ' ', 1)) + 2
        ), ''),
        'Owner'
    ),
    owner_email = coalesce(bp.owner_email, ui.email),
    auth_provider = coalesce(bp.auth_provider, ui.auth_provider, 'email')
FROM public.user_identities ui
WHERE bp.user_id = ui.user_id
  AND (bp.owner_first_name IS NULL OR bp.owner_last_name IS NULL OR bp.owner_email IS NULL);

-- Any remaining business_profiles rows with NULLs
UPDATE public.business_profiles
SET
    owner_first_name = coalesce(
        owner_first_name,
        split_part(profile_data->>'ownerName', ' ', 1),
        'Store'
    ),
    owner_last_name = coalesce(
        owner_last_name,
        nullif(substr(profile_data->>'ownerName', length(split_part(profile_data->>'ownerName', ' ', 1)) + 2), ''),
        'Owner'
    )
WHERE owner_first_name IS NULL OR owner_last_name IS NULL;
