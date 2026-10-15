-- ==============================================================================
-- DUKAN.AI – Supabase Backend Database Schema & Security Policies
-- ==============================================================================
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor -> New Query).
--
-- Tenancy model: ONE ACCOUNT = ONE STORE. Every row is owned by the `user_id`
-- that created it and is reachable only by that owner (see RLS below).
--
-- Client ids are NOT globally unique — each store's WhatsApp engine numbers its
-- own orders starting from DKN-1001, and every store using the same preset
-- shares product ids like `product_parle_g`. They are therefore stored as
-- `external_id` and scoped by `user_id`, never used as a primary key.
--
-- !! THIS SCRIPT DROPS AND RECREATES THE THREE TABLES !!
-- It is the bootstrap for the grocery-only build and the previous contents were
-- test output; re-running it wipes all store data.
-- ==============================================================================

-- ==============================================================================
-- 0. RESET (destructive)
-- ==============================================================================
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.business_profiles CASCADE;

-- ==============================================================================
-- 1. BUSINESS PROFILES — exactly one row per store owner
-- ==============================================================================
CREATE TABLE public.business_profiles (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    store_name   TEXT NOT NULL,
    category     TEXT,
    profile_data JSONB NOT NULL DEFAULT '{}'::jsonb,  -- storeDetails + raw answers
    onboarding   JSONB NOT NULL DEFAULT '{}'::jsonb,  -- dynamic Q&A: [{question,intent,type,answer}]
    created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 2. PRODUCTS / CATALOG — owner-scoped
-- ==============================================================================
CREATE TABLE public.products (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,                       -- client-side id, e.g. product_parle_g
    name        TEXT NOT NULL,
    price       TEXT NOT NULL,
    stock       INTEGER NOT NULL DEFAULT 0,
    stock_unit  TEXT NOT NULL DEFAULT 'pcs',
    image_url   TEXT,
    attributes  JSONB NOT NULL DEFAULT '{}'::jsonb,  -- business-type-specific fields
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT products_owner_external_id_key UNIQUE (user_id, external_id)
);

-- ==============================================================================
-- 3. ORDERS — owner-scoped
-- ==============================================================================
CREATE TABLE public.orders (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    external_id    TEXT NOT NULL,                    -- this store's own engine id, e.g. DKN-1001
    customer       JSONB NOT NULL DEFAULT '{}'::jsonb,
    items          JSONB NOT NULL DEFAULT '[]'::jsonb,
    total          NUMERIC NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('COD', 'UPI')),
    status         TEXT NOT NULL CHECK (status IN ('NEW', 'PREPARING', 'READY_FOR_PICKUP', 'COMPLETED', 'REJECTED', 'CANCELLED')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT orders_owner_external_id_key UNIQUE (user_id, external_id)
);

-- ==============================================================================
-- INDEXES FOR PERFORMANCE
-- ==============================================================================
CREATE INDEX idx_business_profiles_user_id ON public.business_profiles(user_id);
CREATE INDEX idx_products_user_id ON public.products(user_id);
CREATE INDEX idx_products_owner_external ON public.products(user_id, external_id);
CREATE INDEX idx_orders_user_id ON public.orders(user_id);
CREATE INDEX idx_orders_owner_external ON public.orders(user_id, external_id);
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES — owner only
-- ==============================================================================
-- Deliberately NO anon access and NO `user_id IS NULL` escape hatch. Those are
-- what let any holder of the public anon key read every store's orders (customer
-- phone numbers included) and let the first sign-in absorb every unowned row.
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Business Profiles:
CREATE POLICY "owner selects own profile" ON public.business_profiles
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner inserts own profile" ON public.business_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner updates own profile" ON public.business_profiles
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner deletes own profile" ON public.business_profiles
    FOR DELETE USING (auth.uid() = user_id);

-- Products:
CREATE POLICY "owner selects own products" ON public.products
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner inserts own products" ON public.products
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner updates own products" ON public.products
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner deletes own products" ON public.products
    FOR DELETE USING (auth.uid() = user_id);

-- Orders:
CREATE POLICY "owner selects own orders" ON public.orders
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner inserts own orders" ON public.orders
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner updates own orders" ON public.orders
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner deletes own orders" ON public.orders
    FOR DELETE USING (auth.uid() = user_id);
