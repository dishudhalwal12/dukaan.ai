-- ============================================================================
-- Migration: record HOW a delivery coordinate was obtained
-- Project: glkzpygjodhnmtlxejzg
--
-- WHY
-- An address row has always carried a latitude/longitude and a `match_type`
-- label, but nothing recorded where the numbers came from. In production an
-- assistant saved a typed address whose geocoding had FAILED, reusing the
-- customer's GPS fix, and the row then claimed `match_type = 'house'` with
-- `source = 'geocoded'`. Downstream that reads as "verified rooftop", which is
-- the one thing a delivery address must never lie about.
--
-- WHAT THIS ADDS
-- `precision_source` says which evidence produced the coordinate:
--   app_location  the fix captured when the customer connected the assistant
--   chat_shared   a pin the customer sent inside the conversation
--   geocoded      the address text was resolved by a geocoder
--   typed         text arrived with no coordinate source at all
--
-- `geocode_verified` is the only flag allowed to unlock house-level delivery
-- language. It is true only when a geocoder actually matched the text.
--
-- TRUST
-- The row stays owned by the customer (RLS from 2026-10-26). These columns are
-- written by the MCP server with the customer's own token, and read back by the
-- quote so the confirmation can be honest about precision.
--
-- NON-DESTRUCTIVE: additive columns, one backfill, no drops. Run once in the
-- Supabase SQL Editor after 2026-10-28_mcp_customer_location.sql.
-- ============================================================================

ALTER TABLE public.customer_addresses
    ADD COLUMN IF NOT EXISTS precision_source  TEXT,
    ADD COLUMN IF NOT EXISTS geocode_verified  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS coords_captured_at TIMESTAMPTZ;

-- Existing rows: `source` is the only provenance the old schema recorded.
-- 'geocoded' is the single value that claims the text was resolved, so it is the
-- only one allowed to become verified. Everything else stays unverified rather
-- than guessed — a wrong "verified" is worse than an honest "unknown".
UPDATE public.customer_addresses
SET precision_source = CASE WHEN source = 'geocoded' THEN 'geocoded' ELSE 'typed' END,
    geocode_verified = (source = 'geocoded')
WHERE precision_source IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'customer_addresses_precision_source_check'
          AND conrelid = 'public.customer_addresses'::regclass
    ) THEN
        ALTER TABLE public.customer_addresses
            ADD CONSTRAINT customer_addresses_precision_source_check
            CHECK (
                precision_source IS NULL
                OR precision_source IN ('app_location', 'chat_shared', 'geocoded', 'typed')
            ) NOT VALID;
    END IF;
END
$$;

ALTER TABLE public.customer_addresses
    VALIDATE CONSTRAINT customer_addresses_precision_source_check;

COMMENT ON COLUMN public.customer_addresses.precision_source IS
    'How the coordinate was obtained: app_location, chat_shared, geocoded, or typed. A pin is not a rooftop.';

COMMENT ON COLUMN public.customer_addresses.geocode_verified IS
    'True only when a geocoder matched the address text. The only flag that may unlock house-level delivery language.';
