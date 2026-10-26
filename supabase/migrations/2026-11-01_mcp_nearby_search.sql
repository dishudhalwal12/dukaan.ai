-- ============================================================================
-- Migration: nearby search in SQL, so 10 000 shops is a query and not a download
-- Project: glkzpygjodhnmtlxejzg
--
-- WHY
-- `find_shops` used to select every AI-enabled shop and rank them in Node. That
-- works for a demo and fails at scale: PostgREST returns at most 1 000 rows by
-- default, so shop 1 001 was invisible regardless of distance, and the product
-- count query built an `IN (...)` list with one id per shop in the URL. At a few
-- thousand shops the right shop simply never reached the customer.
--
-- WHAT THIS ADDS
-- Two read-only functions that answer the two questions the assistant actually
-- asks, with the distance work, the radius rule, and the row limit inside
-- Postgres:
--
--   mcp_find_shops(lat, lng, radius_km, name_query, limit)
--     shops that deliver to this point, nearest first.
--
--   mcp_search_nearby_products(lat, lng, radius_km, tokens[], limit)
--     "which shop near me has soap, and at what price" — the query that used to
--     be 1 + N tool calls (find_shops, then search_products per shop).
--
-- WHY A BOUNDING BOX FIRST
-- A haversine expression cannot use an index. The box filter can, so the
-- expensive arithmetic runs on a handful of rows instead of the whole table.
--
-- WHY NO pg_trgm
-- A migration that needs an extension can fail on a project where it is absent,
-- and a failed migration in this project blocks every customer-facing tool.
-- Cross-shop matching is therefore exact-token (case-insensitive); typo and
-- alias tolerance stays in mcp/catalog.js, where a single shop's catalog is small
-- enough to fuzzy-match in memory.
--
-- TRUST
-- Both functions are SECURITY DEFINER because they read shop rows the caller
-- cannot see through RLS, and they return only public fields: the public shop id,
-- never the merchant's auth uuid. Writes stay service_role only.
--
-- NON-DESTRUCTIVE. Run once in the Supabase SQL Editor after 2026-10-31.
-- ============================================================================

-- The box filter needs a cheap range scan on coordinates.
CREATE INDEX IF NOT EXISTS business_profiles_store_bbox_idx
    ON public.business_profiles (store_lat, store_lng)
    WHERE mcp_enabled = true;

-- Product lookups always arrive with a shop id (user_id) and a name.
CREATE INDEX IF NOT EXISTS products_user_name_idx
    ON public.products (user_id, lower(name));

CREATE OR REPLACE FUNCTION public.mcp_find_shops(
    p_lat double precision,
    p_lng double precision,
    p_radius_km double precision DEFAULT 5,
    p_query text DEFAULT NULL,
    p_limit integer DEFAULT 10
)
RETURNS TABLE (
    shop_id text,
    user_id uuid,
    name text,
    latitude double precision,
    longitude double precision,
    distance_km double precision,
    delivery_radius_km double precision,
    item_count bigint,
    orders_paused boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH bbox AS (
        SELECT
            p_lat AS lat,
            p_lng AS lng,
            -- 1 degree of latitude is ~111 km; the longitude degree shrinks with
            -- the cosine of the latitude. Both are widened by 1 % so a point on
            -- the edge of the circle is never dropped by rounding.
            (p_radius_km / 111.045) * 1.01 AS dlat,
            (p_radius_km / (111.045 * GREATEST(cos(radians(p_lat)), 0.01))) * 1.01 AS dlng
    ),
    candidates AS (
        SELECT
            b.public_shop_id,
            b.user_id,
            b.store_name,
            b.store_lat,
            b.store_lng,
            b.delivery_radius_km,
            b.orders_paused,
            2 * 6371 * asin(sqrt(
                power(sin(radians((b.store_lat - bbox.lat) / 2)), 2) +
                cos(radians(bbox.lat)) * cos(radians(b.store_lat)) *
                power(sin(radians((b.store_lng - bbox.lng) / 2)), 2)
            )) AS distance_km
        FROM public.business_profiles b
        CROSS JOIN bbox
        WHERE b.mcp_enabled = true
          -- A paused shop cannot accept an order, and discovery that offers one
          -- is worse than discovery that omits it: the customer would build a
          -- basket the shop will refuse. (mcp_search_nearby_products filters the
          -- same way; a "closed" hint belongs to get_shop, not to a list.)
          AND b.orders_paused = false
          AND b.store_lat IS NOT NULL
          AND b.store_lng IS NOT NULL
          -- An IP-approximate position cannot be trusted to rank a delivery.
          AND COALESCE(b.store_location_source, '') <> 'ip_approximate'
          AND b.store_lat BETWEEN bbox.lat - bbox.dlat AND bbox.lat + bbox.dlat
          AND b.store_lng BETWEEN bbox.lng - bbox.dlng AND bbox.lng + bbox.dlng
    )
    SELECT
        c.public_shop_id,
        c.user_id,
        c.store_name,
        c.store_lat,
        c.store_lng,
        c.distance_km,
        c.delivery_radius_km,
        counts.item_count,
        c.orders_paused
    FROM candidates c
    LEFT JOIN LATERAL (
        SELECT count(*) AS item_count FROM public.products p WHERE p.user_id = c.user_id
    ) counts ON true
    WHERE c.distance_km <= LEAST(c.delivery_radius_km, p_radius_km)
      AND counts.item_count > 0
      AND (p_query IS NULL OR c.store_name ILIKE '%' || p_query || '%')
    ORDER BY c.distance_km ASC, counts.item_count DESC, c.public_shop_id ASC
    LIMIT GREATEST(1, LEAST(p_limit, 50));
$$;

CREATE OR REPLACE FUNCTION public.mcp_search_nearby_products(
    p_lat double precision,
    p_lng double precision,
    p_radius_km double precision DEFAULT 5,
    p_tokens text[] DEFAULT NULL,
    p_limit integer DEFAULT 40
)
RETURNS TABLE (
    shop_id text,
    user_id uuid,
    name text,
    latitude double precision,
    longitude double precision,
    distance_km double precision,
    product_id text,
    product_name text,
    price text,
    unit text,
    stock integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH bbox AS (
        SELECT
            p_lat AS lat,
            p_lng AS lng,
            (p_radius_km / 111.045) * 1.01 AS dlat,
            (p_radius_km / (111.045 * GREATEST(cos(radians(p_lat)), 0.01))) * 1.01 AS dlng
    ),
    shops AS (
        SELECT
            b.public_shop_id,
            b.user_id,
            b.store_name,
            b.store_lat,
            b.store_lng,
            b.delivery_radius_km,
            2 * 6371 * asin(sqrt(
                power(sin(radians((b.store_lat - bbox.lat) / 2)), 2) +
                cos(radians(bbox.lat)) * cos(radians(b.store_lat)) *
                power(sin(radians((b.store_lng - bbox.lng) / 2)), 2)
            )) AS distance_km
        FROM public.business_profiles b
        CROSS JOIN bbox
        WHERE b.mcp_enabled = true
          AND b.orders_paused = false
          AND b.store_lat IS NOT NULL
          AND b.store_lng IS NOT NULL
          AND COALESCE(b.store_location_source, '') <> 'ip_approximate'
          AND b.store_lat BETWEEN bbox.lat - bbox.dlat AND bbox.lat + bbox.dlat
          AND b.store_lng BETWEEN bbox.lng - bbox.dlng AND bbox.lng + bbox.dlng
    )
    SELECT
        s.public_shop_id,
        s.user_id,
        s.store_name,
        s.store_lat,
        s.store_lng,
        s.distance_km,
        p.external_id,
        p.name,
        p.price,
        p.stock_unit,
        p.stock
    FROM shops s
    JOIN public.products p ON p.user_id = s.user_id
    WHERE s.distance_km <= LEAST(s.delivery_radius_km, p_radius_km)
      AND p.stock > 0
      AND (
          p_tokens IS NULL
          OR cardinality(p_tokens) = 0
          -- ANY token (OR). The tokens are alias alternatives — "soap" and
          -- "sabun" describe the same shelf item — so requiring all of them would
          -- match nothing. Ranking inside one shop stays in mcp/catalog.js, where
          -- a multi-word query can be scored properly.
          OR EXISTS (
              SELECT 1 FROM unnest(p_tokens) AS token
              WHERE trim(token) <> '' AND p.name ILIKE '%' || trim(token) || '%'
          )
      )
    ORDER BY s.distance_km ASC, p.name ASC
    LIMIT GREATEST(1, LEAST(p_limit, 100));
$$;

REVOKE ALL ON FUNCTION public.mcp_find_shops(double precision, double precision, double precision, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mcp_search_nearby_products(double precision, double precision, double precision, text[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_find_shops(double precision, double precision, double precision, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mcp_search_nearby_products(double precision, double precision, double precision, text[], integer) TO service_role;

COMMENT ON FUNCTION public.mcp_find_shops(double precision, double precision, double precision, text, integer) IS
    'Shops that deliver to a point, nearest first, computed in SQL so 10k shops is a query and not a full table download.';
COMMENT ON FUNCTION public.mcp_search_nearby_products(double precision, double precision, double precision, text[], integer) IS
    'Stocked products near a point matching every token, nearest shop first. Replaces find_shops + N x search_products.';
