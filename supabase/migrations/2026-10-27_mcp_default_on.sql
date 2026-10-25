-- ============================================================================
-- Migration: AI ordering on by default
-- Project: glkzpygjodhnmtlxejzg
--
-- The product decision changed: every registered shop should be discoverable
-- by AI customers without asking the shopkeeper to find a toggle. The server
-- still drops shops with no coordinates, no catalog, or an IP-approximate
-- location, so enabling the flag does not promise delivery.
--
-- The emergency control remains `orders_paused`, which stops new orders without
-- removing the shop from discovery.
--
-- Run once in the Supabase SQL Editor after 2026-10-26_mcp.sql.
-- ============================================================================

ALTER TABLE public.business_profiles
    ALTER COLUMN mcp_enabled SET DEFAULT true;

UPDATE public.business_profiles
SET mcp_enabled = true
WHERE mcp_enabled = false;

-- Make the intent explicit for anyone reading the table later.
COMMENT ON COLUMN public.business_profiles.mcp_enabled IS
    'AI ordering is on by default. The MCP server additionally requires coordinates, a catalog, and orders_paused = false.';
