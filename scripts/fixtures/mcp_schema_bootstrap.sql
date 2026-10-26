-- Minimal Supabase-shaped bootstrap for testing the MCP migration in a plain
-- Postgres container. Not part of the app schema.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE TABLE public.business_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    store_name TEXT NOT NULL,
    store_lat DOUBLE PRECISION,
    store_lng DOUBLE PRECISION,
    store_location_source TEXT
);

-- Mirrors supabase/schema.sql: the nearby-search functions join it.
CREATE TABLE public.products (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    price TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    stock_unit TEXT NOT NULL DEFAULT 'pcs',
    image_url TEXT,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT products_owner_external_id_key UNIQUE (user_id, external_id),
    CONSTRAINT products_stock_non_negative CHECK (stock >= 0)
);

CREATE TABLE public.orders (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL,
    external_id TEXT NOT NULL,
    customer JSONB NOT NULL DEFAULT '{}'::jsonb,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total NUMERIC NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL,
    customer_phone TEXT,
    customer_name TEXT,
    delivery_address TEXT,
    notes TEXT,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT orders_owner_external_id_key UNIQUE (user_id, external_id)
);

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
