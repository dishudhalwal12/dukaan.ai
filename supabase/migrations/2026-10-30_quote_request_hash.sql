-- ============================================================================
-- Migration: make quote_order safe to retry
-- Project: glkzpygjodhnmtlxejzg
--
-- WHY
-- `quote_order` inserted a row on every call. Once the transport gained a
-- one-shot retry for stale sockets (mcp/net.js), a retried request could create
-- two quotes for the same basket: it burns the customer's 20-per-hour preview
-- budget and leaves the model holding a quote id it will never use.
--
-- WHAT THIS ADDS
-- `request_hash` is a sha256 of shop + delivery address + the normalised basket,
-- computed by the server. The server looks for an unconsumed, unexpired quote
-- with the same hash inside 60 seconds and returns it instead of inserting.
--
-- The index matches that lookup exactly (user, hash, newest first), so the check
-- stays a single index scan as the table grows; quotes are cleaned up by
-- mcp_expire_quotes(), so the table does not accumulate dead rows.
--
-- NON-DESTRUCTIVE. Run once in the Supabase SQL Editor after 2026-10-29.
-- ============================================================================

ALTER TABLE public.order_quotes
    ADD COLUMN IF NOT EXISTS request_hash TEXT;

CREATE INDEX IF NOT EXISTS order_quotes_request_hash_idx
    ON public.order_quotes(user_id, request_hash, created_at DESC)
    WHERE request_hash IS NOT NULL;

COMMENT ON COLUMN public.order_quotes.request_hash IS
    'sha256 of shop + address + normalised basket. A retry inside 60s returns the existing quote instead of inserting a second one.';
