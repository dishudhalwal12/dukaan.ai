-- ==============================================================================
-- DUKAN.AI – Supabase Backend Database Schema & Security Policies
-- ==============================================================================
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- to initialize tables, row-level security (RLS), and performance indexes.
-- ==============================================================================

-- 1. USERS PROFILE TABLE (DEDICATED SHOPKEEPER PROFILE)
-- Stores shopkeeper details like store name, owner name, phone number, address, and UPI ID
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    owner_name TEXT,
    store_name TEXT DEFAULT 'My Kirana Store',
    store_category TEXT DEFAULT 'Grocery / Kirana',
    phone_number TEXT,
    address TEXT,
    upi_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
    ON public.users FOR SELECT
    USING (auth.uid() = id OR auth.role() = 'anon');

CREATE POLICY "Users can update own profile"
    ON public.users FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON public.users FOR INSERT
    WITH CHECK (auth.uid() = id OR auth.role() = 'anon');

-- Trigger to auto-create public.users row on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.users (id, email, owner_name, created_at, updated_at)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
        now(),
        now()
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. BUSINESS PROFILES TABLE
-- Stores store details, AI contextual questionnaire responses, and metadata
CREATE TABLE IF NOT EXISTS public.business_profiles (
    id TEXT PRIMARY KEY,                       -- Slugified store name or identifier
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    store_name TEXT NOT NULL,
    profile_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. PRODUCTS / CATALOG TABLE
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

-- 4. ORDERS TABLE
-- Stores orders received (WhatsApp, POS, simulated or real webhook orders)
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    customer_phone TEXT,
    customer_name TEXT,
    delivery_address TEXT,
    customer JSONB NOT NULL DEFAULT '{}'::jsonb,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total NUMERIC NOT NULL DEFAULT 0,
    payment_method TEXT DEFAULT 'COD',
    status TEXT NOT NULL DEFAULT 'NEW',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT valid_order_status CHECK (
        status IN (
            'NEW', 'PENDING', 'ACCEPTED', 'PREPARING', 
            'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 
            'COMPLETED', 'DELIVERED', 'REJECTED', 'CANCELLED'
        )
    )
);

-- Migration helper for existing databases:
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
        ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
        ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
        ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
        ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE public.orders ALTER COLUMN payment_method DROP NOT NULL;
        ALTER TABLE public.orders ALTER COLUMN payment_method SET DEFAULT 'COD';
        ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
        ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
        ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS valid_order_status;
        ALTER TABLE public.orders ADD CONSTRAINT valid_order_status CHECK (
            status IN (
                'NEW', 'PENDING', 'ACCEPTED', 'PREPARING', 
                'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 
                'COMPLETED', 'DELIVERED', 'REJECTED', 'CANCELLED'
            )
        );
    END IF;
END $$;

-- ==============================================================================
-- INDEXES FOR PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_business_profiles_user_id ON public.business_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_products_user_id ON public.products(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
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
