-- ============================================================================
-- ONE-TIME FIX: new sign-ups fail with
--   {"code":500,"error_code":"unexpected_failure","msg":"Database error saving new user"}
--
-- Cause: public.user_roles is missing from the database, so the auth.users
-- trigger that seeds a role raises on every insert. A leftover Supabase template
-- trigger (on_auth_user_created -> handle_new_user, writing to a public.profiles
-- table this project does not have) breaks it the same way.
--
-- How to run: Supabase dashboard -> SQL Editor -> New query -> paste all of this
-- -> Run. It is idempotent, so running it twice is harmless.
-- ============================================================================

-- 1. Remove the leftover template trigger/function that writes to a table this
--    project never had.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- 2. Recreate the roles table the sign-up trigger writes to.
CREATE TABLE IF NOT EXISTS public.user_roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    user_role       TEXT NOT NULL DEFAULT 'owner'
        CHECK (user_role IN ('owner', 'staff', 'support', 'admin')),
    role_changed_at TIMESTAMPTZ,
    role_changed_by UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Service-role only by design: RLS on, and deliberately no policies, so no
-- client can read or write it. The service role bypasses RLS.
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Every account that already exists gets an owner role.
INSERT INTO public.user_roles (user_id, user_role)
SELECT id, 'owner' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- 4. Every new account gets exactly one owner role.
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

-- ============================================================================
-- 5. Diagnostic only. If sign-ups still fail after this runs, the culprit is
--    another trigger on auth.users. Send back the list this prints.
-- ============================================================================
SELECT t.tgname AS trigger_name, p.proname AS function_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'auth' AND c.relname = 'users' AND NOT t.tgisinternal
ORDER BY t.tgname;
