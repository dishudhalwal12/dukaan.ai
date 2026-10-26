-- ============================================================================
-- Migration: the customer's own location, captured during MCP sign-in
-- Project: glkzpygjodhnmtlxejzg
--
-- WHY
-- A customer connecting an AI assistant already proves who they are, and the
-- consent page already asks the browser for a position (the same sheet the
-- shopkeeper sees during onboarding). Saving that fix means the assistant can
-- name the right nearby shop on the first message instead of asking "send a
-- pincode or your location" in the chat.
--
-- WHAT THIS IS NOT
-- A position is not a delivery address. `quote_order` still requires an
-- `address_id` from `customer_addresses`, because a shop needs a door and a
-- phone, not a dot on a map. This column only shortens discovery.
--
-- TRUST
-- The row belongs to the customer: the RLS policies created in 2026-10-26_mcp.sql
-- already restrict SELECT/INSERT/UPDATE to `auth.uid() = user_id`, so the
-- consent page writes it with the customer's own token and the MCP server reads
-- it with the same user-scoped client. No service-role write is involved.
--
-- `location_source` records HOW the fix was obtained, so an IP-level guess can
-- never be mistaken for a measured position, and `location_captured_at` lets the
-- server refuse a fix older than 30 days.
--
-- NON-DESTRUCTIVE: additive columns only. Run once in the Supabase SQL Editor
-- after 2026-10-27_mcp_default_on.sql.
-- ============================================================================

ALTER TABLE public.customer_profiles
    ADD COLUMN IF NOT EXISTS location_lat          DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS location_lng          DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS location_accuracy_m   DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS location_source       TEXT,
    ADD COLUMN IF NOT EXISTS location_label        TEXT,
    ADD COLUMN IF NOT EXISTS location_captured_at  TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'customer_profiles_location_source_check'
          AND conrelid = 'public.customer_profiles'::regclass
    ) THEN
        ALTER TABLE public.customer_profiles
            ADD CONSTRAINT customer_profiles_location_source_check
            CHECK (
                location_source IS NULL
                OR location_source IN ('gps', 'ip_approximate', 'manual', 'chat_shared')
            ) NOT VALID;
    END IF;
END
$$;

ALTER TABLE public.customer_profiles
    VALIDATE CONSTRAINT customer_profiles_location_source_check;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'customer_profiles_location_coords_check'
          AND conrelid = 'public.customer_profiles'::regclass
    ) THEN
        -- Either both coordinates are present and in range, or neither is.
        -- Written as IS NULL / IS NOT NULL on purpose: a CHECK that evaluates to
        -- NULL is treated as satisfied, so `lng BETWEEN ...` alone would let a
        -- row with a latitude and no longitude through.
        ALTER TABLE public.customer_profiles
            ADD CONSTRAINT customer_profiles_location_coords_check
            CHECK (
                (location_lat IS NULL AND location_lng IS NULL)
                OR (
                    location_lat IS NOT NULL
                    AND location_lng IS NOT NULL
                    AND location_lat BETWEEN -90 AND 90
                    AND location_lng BETWEEN -180 AND 180
                )
            ) NOT VALID;
    END IF;
END
$$;

ALTER TABLE public.customer_profiles
    VALIDATE CONSTRAINT customer_profiles_location_coords_check;

COMMENT ON COLUMN public.customer_profiles.location_lat IS
    'Last known position of the customer, captured with consent in the Dukaan app. Discovery only: delivery still needs a customer_addresses row.';

COMMENT ON COLUMN public.customer_profiles.location_source IS
    'gps = measured, ip_approximate = city level, manual = typed, chat_shared = shared by the customer inside an AI chat.';
