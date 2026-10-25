-- ============================================================================
-- Migration: MCP ordering channel
-- Project: glkzpygjodhnmtlxejzg
--
-- Adds the customer-side identity, saved addresses, price-locked quotes, and
-- the columns the dashboard needs to read an order that did not come from
-- WhatsApp. NON-DESTRUCTIVE: every new table and column is additive; existing
-- WhatsApp orders are untouched and default to channel = 'whatsapp'.
--
-- Trust boundary: this script only creates structure. The order-writing RPC is
-- revoked from anon/authenticated and granted to service_role, because the MCP
-- server validates the catalog price before it calls it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Merchant controls on the shop profile
-- ---------------------------------------------------------------------------
ALTER TABLE public.business_profiles
    ADD COLUMN IF NOT EXISTS mcp_enabled BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS delivery_radius_km NUMERIC NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS orders_paused BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS public_shop_id TEXT;

-- An opaque public id: the MCP tools must never hand a merchant's auth UUID to
-- a customer. Backfill first, then make it required for every future row.
UPDATE public.business_profiles
SET public_shop_id = 'shop_' || substr(md5(id::text), 1, 10)
WHERE public_shop_id IS NULL OR public_shop_id = '';

ALTER TABLE public.business_profiles
    ALTER COLUMN public_shop_id SET DEFAULT ('shop_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10));

ALTER TABLE public.business_profiles
    ALTER COLUMN public_shop_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS business_profiles_public_shop_id_key
    ON public.business_profiles(public_shop_id);

CREATE INDEX IF NOT EXISTS business_profiles_mcp_enabled_idx
    ON public.business_profiles(mcp_enabled)
    WHERE mcp_enabled = true;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'business_profiles_delivery_radius_range'
          AND conrelid = 'public.business_profiles'::regclass
    ) THEN
        ALTER TABLE public.business_profiles
            ADD CONSTRAINT business_profiles_delivery_radius_range
            CHECK (delivery_radius_km >= 1 AND delivery_radius_km <= 10) NOT VALID;
    END IF;
END
$$;

ALTER TABLE public.business_profiles
    VALIDATE CONSTRAINT business_profiles_delivery_radius_range;

-- ---------------------------------------------------------------------------
-- 2. Customer identity (separate from a merchant business_profiles row)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_profiles (
    user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name   TEXT,
    phone       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer selects own profile" ON public.customer_profiles;
CREATE POLICY "customer selects own profile" ON public.customer_profiles
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "customer inserts own profile" ON public.customer_profiles;
CREATE POLICY "customer inserts own profile" ON public.customer_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "customer updates own profile" ON public.customer_profiles;
CREATE POLICY "customer updates own profile" ON public.customer_profiles
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "customer deletes own profile" ON public.customer_profiles;
CREATE POLICY "customer deletes own profile" ON public.customer_profiles
    FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. Saved delivery addresses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_addresses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    label       TEXT,
    line1       TEXT NOT NULL,
    line2       TEXT,
    landmark    TEXT,
    city        TEXT,
    state       TEXT,
    pincode     TEXT,
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    accuracy_m  DOUBLE PRECISION,
    match_type  TEXT NOT NULL DEFAULT 'area'
                CHECK (match_type IN ('house', 'street', 'area', 'city')),
    source      TEXT NOT NULL DEFAULT 'geocoded'
                CHECK (source IN ('map_pin', 'geocoded', 'manual')),
    is_default  BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT customer_addresses_coords_check
        CHECK (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)
);

CREATE INDEX IF NOT EXISTS customer_addresses_user_idx
    ON public.customer_addresses(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_one_default_idx
    ON public.customer_addresses(user_id)
    WHERE is_default = true;

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer selects own addresses" ON public.customer_addresses;
CREATE POLICY "customer selects own addresses" ON public.customer_addresses
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "customer inserts own addresses" ON public.customer_addresses;
CREATE POLICY "customer inserts own addresses" ON public.customer_addresses
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "customer updates own addresses" ON public.customer_addresses;
CREATE POLICY "customer updates own addresses" ON public.customer_addresses
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "customer deletes own addresses" ON public.customer_addresses;
CREATE POLICY "customer deletes own addresses" ON public.customer_addresses
    FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Price-locked quotes (the MCP "cart")
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_quotes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    shop_user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    address_snapshot JSONB NOT NULL,
    items            JSONB NOT NULL,
    total            NUMERIC(12,2) NOT NULL CHECK (total > 0),
    payment_method   TEXT NOT NULL DEFAULT 'COD' CHECK (payment_method IN ('COD', 'UPI')),
    notes            TEXT,
    expires_at       TIMESTAMPTZ NOT NULL,
    consumed_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS order_quotes_user_created_idx
    ON public.order_quotes(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_quotes_expiry_idx
    ON public.order_quotes(expires_at);

ALTER TABLE public.order_quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer selects own quotes" ON public.order_quotes;
CREATE POLICY "customer selects own quotes" ON public.order_quotes
    FOR SELECT USING (auth.uid() = user_id);

-- Writes are service_role only: the server owns price computation and expiry.

-- ---------------------------------------------------------------------------
-- 5. Orders: who ordered, through which channel, from which quote
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS customer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp',
    ADD COLUMN IF NOT EXISTS quote_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'orders_channel_check'
          AND conrelid = 'public.orders'::regclass
    ) THEN
        ALTER TABLE public.orders
            ADD CONSTRAINT orders_channel_check
            CHECK (channel IN ('whatsapp', 'mcp', 'pos')) NOT VALID;
    END IF;
END
$$;

ALTER TABLE public.orders
    VALIDATE CONSTRAINT orders_channel_check;

CREATE INDEX IF NOT EXISTS orders_customer_user_created_idx
    ON public.orders(customer_user_id, created_at DESC)
    WHERE customer_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_quote_id_key
    ON public.orders(quote_id)
    WHERE quote_id IS NOT NULL;

-- Customers may read the orders they placed through MCP. The merchant policies
-- in schema.sql continue to govern the owner side.
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer selects own mcp orders" ON public.orders;
CREATE POLICY "customer selects own mcp orders" ON public.orders
    FOR SELECT USING (auth.uid() = customer_user_id);

-- ---------------------------------------------------------------------------
-- 6. Atomic placement: consume the quote and insert the order once
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 7. Housekeeping
-- ---------------------------------------------------------------------------
-- Expired, unused quotes are dead rows. A daily delete keeps the table small
-- without a cron extension: the MCP server may call this opportunistically.
CREATE OR REPLACE FUNCTION public.mcp_expire_quotes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    removed INTEGER;
BEGIN
    DELETE FROM public.order_quotes
    WHERE consumed_at IS NULL
      AND expires_at < now() - INTERVAL '24 hours';
    GET DIAGNOSTICS removed = ROW_COUNT;
    RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_expire_quotes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_expire_quotes() TO service_role;
