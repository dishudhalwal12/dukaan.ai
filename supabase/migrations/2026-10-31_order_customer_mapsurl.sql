-- ============================================================================
-- Migration: give the order row the same customer shape the POS popup reads
-- Project: glkzpygjodhnmtlxejzg
--
-- WHY
-- `mcp_place_order` wrote `customer.location.mapsUrl` but not a top-level
-- `customer.mapsUrl`. The app's reader (src/App.tsx) prefers `location.mapsUrl`
-- so the popup still worked, but `src/types.ts Customer` is the contract, and a
-- second reader — or a future one — that looks at `customer.mapsUrl` found
-- nothing. One shape, written once, is cheaper than a fallback in every reader.
--
-- WHAT CHANGES
-- The `customer` JSONB gains `mapsUrl`. Nothing is removed: `location` keeps its
-- own copy, so already-deployed readers are unaffected.
--
-- Replaces the function from 2026-10-26_mcp.sql with an identical body apart
-- from that one key. Grants are re-applied because CREATE OR REPLACE keeps the
-- old ACL, but stating them makes the intent auditable.
--
-- NON-DESTRUCTIVE. Run once in the Supabase SQL Editor after 2026-10-29.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mcp_place_order(
    p_quote_id UUID,
    p_user_id UUID,
    p_external_id TEXT
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    q public.order_quotes;
    existing public.orders;
    created public.orders;
    addr JSONB;
    customer JSONB;
BEGIN
    SELECT * INTO q
    FROM public.order_quotes
    WHERE id = p_quote_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'quote_not_found' USING ERRCODE = 'P0001';
    END IF;

    IF q.user_id <> p_user_id THEN
        RAISE EXCEPTION 'quote_not_owned' USING ERRCODE = 'P0001';
    END IF;

    -- Idempotent retry: the quote was consumed, return the order it produced.
    IF q.consumed_at IS NOT NULL THEN
        SELECT * INTO existing FROM public.orders WHERE quote_id = p_quote_id;
        IF FOUND THEN
            RETURN existing;
        END IF;
        RAISE EXCEPTION 'quote_already_used' USING ERRCODE = 'P0001';
    END IF;

    IF q.expires_at <= now() THEN
        RAISE EXCEPTION 'quote_expired' USING ERRCODE = 'P0001';
    END IF;

    addr := q.address_snapshot;
    customer := jsonb_build_object(
        'name', COALESCE(addr->>'name', 'Customer'),
        'whatsappNumber', COALESCE(addr->>'phone', ''),
        'address', COALESCE(addr->>'address', ''),
        'mapsUrl', addr->>'mapsUrl',
        'location', jsonb_build_object(
            'latitude', (addr->>'lat')::DOUBLE PRECISION,
            'longitude', (addr->>'lng')::DOUBLE PRECISION,
            'mapsUrl', addr->>'mapsUrl'
        ),
        'latitude', (addr->>'lat')::DOUBLE PRECISION,
        'longitude', (addr->>'lng')::DOUBLE PRECISION
    );

    INSERT INTO public.orders (
        user_id, external_id, customer, items, total, payment_method,
        customer_phone, customer_name, delivery_address, notes, status,
        customer_user_id, channel, quote_id, created_at, updated_at
    ) VALUES (
        q.shop_user_id, p_external_id, customer, q.items, q.total, q.payment_method,
        addr->>'phone', COALESCE(addr->>'name', 'Customer'), addr->>'address',
        q.notes, 'NEW', p_user_id, 'mcp', q.id, now(), now()
    )
    RETURNING * INTO created;

    UPDATE public.order_quotes SET consumed_at = now() WHERE id = q.id;

    RETURN created;
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_place_order(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_place_order(UUID, UUID, TEXT) TO service_role;
