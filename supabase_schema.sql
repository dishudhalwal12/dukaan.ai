-- ==============================================================================
-- DUKAN.AI – Supabase Backend Database Schema & Security Policies
-- ==============================================================================
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- to initialize tables, row-level security (RLS), and performance indexes.
-- ==============================================================================

-- 1. BUSINESS PROFILES TABLE
-- Stores store details, AI contextual questionnaire responses, and metadata
CREATE TABLE IF NOT EXISTS public.business_profiles (
    id TEXT PRIMARY KEY,                       -- Slugified store name or identifier
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    store_name TEXT NOT NULL,
    profile_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. PRODUCTS / CATALOG TABLE
-- Stores catalog items, pricing, inventory stock, and image references
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    stock_unit TEXT NOT NULL DEFAULT 'pcs',
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. ORDERS TABLE
-- Stores orders received (simulated or real webhook orders)
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    customer JSONB NOT NULL DEFAULT '{}'::jsonb,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total NUMERIC NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('COD', 'UPI')),
    status TEXT NOT NULL CHECK (status IN ('NEW', 'PREPARING', 'READY_FOR_PICKUP', 'COMPLETED', 'REJECTED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- INDEXES FOR PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_business_profiles_user_id ON public.business_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_products_user_id ON public.products(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Business Profiles Policies:
-- Allow authenticated users to manage their profiles, and anon users to read/upsert
CREATE POLICY "Allow public read access to business profiles"
    ON public.business_profiles FOR SELECT
    USING (true);

CREATE POLICY "Allow authenticated and anon upsert to business profiles"
    ON public.business_profiles FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow authenticated and anon update to business profiles"
    ON public.business_profiles FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- Products Policies:
CREATE POLICY "Allow public and user read access to products"
    ON public.products FOR SELECT
    USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'anon');

CREATE POLICY "Allow users and anon to insert products"
    ON public.products FOR INSERT
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'anon');

CREATE POLICY "Allow users and anon to update products"
    ON public.products FOR UPDATE
    USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'anon')
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'anon');

CREATE POLICY "Allow users and anon to delete products"
    ON public.products FOR DELETE
    USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'anon');

-- Orders Policies:
CREATE POLICY "Allow public and user read access to orders"
    ON public.orders FOR SELECT
    USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'anon');

CREATE POLICY "Allow users and anon to insert orders"
    ON public.orders FOR INSERT
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'anon');

CREATE POLICY "Allow users and anon to update orders"
    ON public.orders FOR UPDATE
    USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'anon')
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'anon');
