-- ============================================================================
-- Migration: stock can never be negative
-- Project: glkzpygjodhnmtlxejzg
--
-- NON-DESTRUCTIVE and IDEMPOTENT apart from one deliberate correction: an
-- existing negative stock is set to 0. That is not data loss, it is a repair —
-- a stored "-5" means the app miscounted, and the shelf is either empty or it is
-- not. Nothing else is dropped and no other column is touched.
--
-- Why this is needed:
--   * the product form accepted a typed "-5" (no `min`, a raw parseInt);
--   * an order line imported from a CSV, a bill photo or the WhatsApp backend
--     could carry a negative quantity, and cancelling that order added it to
--     stock instead of subtracting it;
--   * `products.stock` accepted any integer, so a bad value round-tripped
--     client -> database -> client and was rendered as "Stock: -5 pcs".
--
-- The client now clamps at the input and in the single stock mutator. This
-- constraint is the backstop for everything the client is not: a bot, a manual
-- SQL fix, a restored backup.
--
-- Run it in the Supabase SQL Editor. It can be re-run without harm.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Repair existing counts so the constraint can be applied at all.
-- ---------------------------------------------------------------------------
UPDATE public.products
SET stock = 0
WHERE stock < 0;

-- ---------------------------------------------------------------------------
-- 2. Add the constraint, once.
--
-- NOT VALID first, then validated: on a large table that keeps the write lock
-- short, and the check already holds because step 1 ran. Adding it twice is a
-- no-op thanks to the catalog lookup.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'products_stock_non_negative'
          AND conrelid = 'public.products'::regclass
    ) THEN
        ALTER TABLE public.products
            ADD CONSTRAINT products_stock_non_negative CHECK (stock >= 0) NOT VALID;
    END IF;
END
$$;

ALTER TABLE public.products
    VALIDATE CONSTRAINT products_stock_non_negative;
