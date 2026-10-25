import { z } from 'zod';
import { registerAppResource, registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { CHECKOUT_URI, checkoutResourceContents } from './apps/checkout.js';
import { rankShops, serviceability, roundedKm, isShopAvailable } from './geometry.js';
import { searchCatalog, formatRupees } from './catalog.js';
import { buildQuote, isQuoteExpired } from './orderRules.js';
import { geocodeAddress, formatAddress, needsExactAddress } from './geo.js';
import { evaluateOrderLimits, checkOrderTotal, allowRead } from './limits.js';
import { mcpOrderId } from './ids.js';
import { normalisePhone, normalisePincode, normaliseName } from './validation.js';
import { publicOrder, addressSnapshot } from './data.js';
import { ok, fail, fromError } from './result.js';

const READ = { readOnlyHint: true, openWorldHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };

const shopPublic = (shop, km) => ({
  shop_id: shop.shopId,
  name: shop.name,
  distance_km: roundedKm(km ?? shop.distanceKm),
  delivery_radius_km: shop.deliveryRadiusKm,
  item_count: shop.catalogItemCount,
  accepting_orders: isShopAvailable(shop),
});

const coordsOk = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

async function resolveLocation(input, repo, deps) {
  if (input.address_id) {
    const row = await repo.getAddressRow(input.address_id);
    if (!row) return { ok: false, code: 'address_not_found', message: 'That saved address does not exist.' };
    return {
      ok: true,
      lat: Number(row.lat),
      lng: Number(row.lng),
      label: formatAddress(row),
      source: 'saved_address',
      match_type: row.match_type,
      needs_exact_address: needsExactAddress(row.match_type),
    };
  }

  if (input.latitude !== undefined || input.longitude !== undefined) {
    if (!coordsOk(Number(input.latitude), Number(input.longitude))) {
      return { ok: false, code: 'location_invalid', message: 'Pass both latitude and longitude, or a saved address.' };
    }
    return {
      ok: true,
      lat: Number(input.latitude),
      lng: Number(input.longitude),
      label: 'Shared location',
      source: 'coordinates',
      match_type: 'house',
      needs_exact_address: false,
    };
  }

  if (input.pincode || input.area) {
    const pincode = input.pincode ? normalisePincode(input.pincode) : null;
    if (input.pincode && !pincode) {
      return { ok: false, code: 'invalid_pincode', message: 'A pincode must be six digits.' };
    }
    const geo = await geocodeAddress(
      { pincode, line1: input.area || '' },
      { fetchImpl: deps.fetchImpl, googleKey: deps.config.googleKey, provider: deps.config.geocoderProvider }
    );
    if (!geo.ok) return { ok: false, code: geo.code, message: geo.message };
    return {
      ok: true,
      lat: geo.lat,
      lng: geo.lng,
      label: geo.displayName,
      source: 'geocoded',
      match_type: geo.matchType,
      needs_exact_address: geo.needsExactAddress,
    };
  }

  return {
    ok: false,
    code: 'location_required',
    message: 'Ask for a pincode, an area, a saved address, or a map location before searching.',
  };
}

function validateItemsShape(items) {
  return Array.isArray(items) && items.length > 0;
}

/**
 * Registers every MCP tool. `repo` is the data surface; `deps` carries config,
 * fetch, clock, and randomness so tests can replace all three.
 */
export function registerTools(server, { repo, config, deps }) {
  // Kill switch: pause new orders and address/profile writes, while keeping
  // discovery, existing-order status, and cancellation available.
  const ALLOWED_WHEN_PAUSED = new Set([
    'find_shops',
    'get_shop',
    'search_products',
    'get_customer_profile',
    'list_addresses',
    'get_order',
    'list_orders',
    'show_checkout',
    'cancel_order',
  ]);
  const READ_HEAVY = new Set([
    'find_shops',
    'search_products',
    'get_shop',
    'get_customer_profile',
    'list_addresses',
    'save_address',
    'get_order',
    'list_orders',
    'show_checkout',
  ]);
  const originalRegisterTool = server.registerTool.bind(server);
  server.registerTool = (name, toolConfig, callback) =>
    originalRegisterTool(name, toolConfig, async (...args) => {
      if (!config.enabled && !ALLOWED_WHEN_PAUSED.has(name)) {
        return fail('service_paused', 'AI ordering is paused right now. Existing orders can still be read or cancelled.');
      }
      if (READ_HEAVY.has(name) && !allowRead(repo.userId)) {
        return fail('rate_limited', 'Too many requests in a minute. Try again shortly.');
      }
      return callback(...args);
    });

  registerAppResource(
    server,
    'Dukaan checkout card',
    CHECKOUT_URI,
    { description: 'Interactive checkout card for a priced Dukaan order preview.' },
    async () => checkoutResourceContents()
  );

  server.registerTool(
    'find_shops',
    {
      title: 'Find nearby shops',
      description:
        'Find Dukaan shops that deliver to a customer location. Use a saved address_id, a six-digit pincode, an area name, or latitude/longitude. Returns distance, delivery radius, item count, and availability. Never invent a location: if the customer has not said where they are, ask for a pincode or area first.',
      inputSchema: z.object({
        address_id: z.string().uuid().optional(),
        pincode: z.string().optional(),
        area: z.string().max(120).optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        query: z.string().max(80).optional(),
        limit: z.number().int().min(1).max(10).optional(),
      }),
      annotations: READ,
    },
    async (input) => {
      try {
        const location = await resolveLocation(input, repo, deps);
        if (!location.ok) return fail(location.code, location.message);

        const shops = await repo.loadEnabledShops();
        const ranked = rankShops(shops, location);
        const serviceable = ranked.filter((shop) => serviceability(shop, location).ok);
        const filtered = input.query
          ? serviceable.filter((shop) => shop.name.toLowerCase().includes(input.query.trim().toLowerCase()))
          : serviceable;

        if (filtered.length === 0) {
          if (serviceable.length > 0) {
            return fail('no_matching_shops', 'No shop near that location matches that name. Nothing was ordered.');
          }
          const nearest = ranked[0];
          if (!nearest) {
            return fail('no_shops', 'No Dukaan shop is taking AI orders yet. Nothing was ordered.');
          }
          return fail(
            'out_of_range',
            `No shop delivers to that location. The nearest shop is ${roundedKm(nearest.distanceKm)} km away. Nothing was ordered.`,
            { nearest_km: roundedKm(nearest.distanceKm) }
          );
        }

        const limit = input.limit || 5;
        const results = filtered.slice(0, limit).map((shop) => shopPublic(shop));
        const lines = results.map(
          (shop, index) => `${index + 1}. ${shop.name} — ${shop.distance_km} km, ${shop.item_count} items`
        );
        const warning = location.needs_exact_address
          ? '\nThis is an area-level location. Save a precise address before placing an order.'
          : '';
        return ok(
          `Shops near ${location.label}:\n${lines.join('\n')}${warning}`,
          {
            location: {
              label: location.label,
              match_type: location.match_type,
              source: location.source,
              needs_exact_address: Boolean(location.needs_exact_address),
            },
            shops: results,
          }
        );
      } catch (error) {
        return fromError(error);
      }
    }
  );

  server.registerTool(
    'get_shop',
    {
      title: 'Get shop details',
      description: 'Get one shop by its shop_id: name, delivery radius, catalog size, and whether it is accepting orders.',
      inputSchema: z.object({ shop_id: z.string().min(1) }),
      annotations: READ,
    },
    async ({ shop_id }) => {
      try {
        const shop = await repo.getShop(shop_id);
        if (!shop) return fail('shop_not_found', 'That shop is not taking AI orders.');
        const catalog = await repo.getCatalog(shop.userId);
        return ok(`${shop.name} — ${catalog.length} items, ${shop.deliveryRadiusKm} km delivery radius.`, {
          shop: {
            shop_id: shop.shopId,
            name: shop.name,
            delivery_radius_km: shop.deliveryRadiusKm,
            item_count: catalog.length,
            accepting_orders: isShopAvailable(shop),
          },
        });
      } catch (error) {
        return fromError(error);
      }
    }
  );

  server.registerTool(
    'search_products',
    {
      title: 'Search a shop catalog',
      description:
        'Search the items a shop actually stocks. Returns authoritative prices and whether each item is in stock. Use the returned product_id in quote_order; never invent a product id or a price.',
      inputSchema: z.object({
        shop_id: z.string().min(1),
        query: z.string().max(80).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      annotations: READ,
    },
    async ({ shop_id, query, limit }) => {
      try {
        const shop = await repo.getShop(shop_id);
        if (!shop) return fail('shop_not_found', 'That shop is not taking AI orders.');
        const catalog = await repo.getCatalog(shop.userId);
        const products = searchCatalog(catalog, query || '', limit || 20);
        if (products.length === 0) {
          return ok(`No matching items at ${shop.name}.`, { shop: { shop_id: shop.shopId, name: shop.name }, products: [] });
        }
        const lines = products.map((product) => {
          const stock = product.inStock
            ? Number.isFinite(product.stock) ? ` — ${product.stock} left` : ''
            : ' — out of stock';
          return `- ${product.name} (${product.unit}) — ${product.price}${stock} [${product.productId}]`;
        });
        return ok(`Items at ${shop.name}:\n${lines.join('\n')}`, {
          shop: { shop_id: shop.shopId, name: shop.name },
          products,
        });
      } catch (error) {
        return fromError(error);
      }
    }
  );

  server.registerTool(
    'get_customer_profile',
    {
      title: 'Get customer profile',
      description: 'Read the saved name, delivery phone, and saved addresses for this signed-in customer.',
      inputSchema: z.object({}),
      annotations: READ,
    },
    async () => {
      try {
        const profile = await repo.getProfile();
        const addresses = await repo.listAddresses();
        return ok(
          profile
            ? `Saved profile: ${profile.full_name || 'no name'}, ${profile.phone || 'no phone'}. ${addresses.length} saved address(es).`
            : `No profile saved yet. ${addresses.length} saved address(es).`,
          { profile: profile ? { full_name: profile.full_name, phone: profile.phone } : null, addresses }
        );
      } catch (error) {
        return fromError(error);
      }
    }
  );

  server.registerTool(
    'save_customer_profile',
    {
      title: 'Save customer profile',
      description: 'Save the customer name and delivery phone. The phone is required before an order can be placed; it is used by the shop to call about delivery.',
      inputSchema: z.object({
        full_name: z.string().max(80).optional(),
        phone: z.string().max(20).optional(),
      }),
      annotations: { ...WRITE, destructiveHint: false },
    },
    async ({ full_name, phone }) => {
      try {
        const existing = await repo.getProfile();
        const name = full_name === undefined ? existing?.full_name || null : normaliseName(full_name);
        const phoneNumber = phone === undefined ? existing?.phone || null : normalisePhone(phone);
        if (full_name !== undefined && !name) return fail('invalid_name', 'Enter a name between 2 and 80 characters.');
        if (phone !== undefined && !phoneNumber) return fail('invalid_phone', 'Enter a valid mobile number.');
        if (!name && !phoneNumber) return fail('profile_required', 'Save a name or a delivery phone first.');

        const saved = await repo.saveProfile({ fullName: name, phone: phoneNumber });
        return ok(`Saved ${saved.full_name || 'customer'}${saved.phone ? `, ${saved.phone}` : ''}.`, {
          profile: { full_name: saved.full_name, phone: saved.phone },
        });
      } catch (error) {
        return fromError(error);
      }
    }
  );

  server.registerTool(
    'list_addresses',
    {
      title: 'List saved addresses',
      description: 'List the customer saved delivery addresses. Use an address_id from this list for quote_order.',
      inputSchema: z.object({}),
      annotations: READ,
    },
    async () => {
      try {
        const addresses = await repo.listAddresses();
        if (addresses.length === 0) return ok('No saved addresses yet.', { addresses: [] });
        const lines = addresses.map(
          (address, index) => `${index + 1}. ${address.label ? `${address.label}: ` : ''}${address.address}${address.is_default ? ' (default)' : ''} [${address.address_id}]`
        );
        return ok(`Saved addresses:\n${lines.join('\n')}`, { addresses });
      } catch (error) {
        return fromError(error);
      }
    }
  );

  server.registerTool(
    'save_address',
    {
      title: 'Save a delivery address',
      description:
        'Save a delivery address. Pass latitude/longitude when the customer shared a map pin; otherwise pass the address text and the server geocodes it. The response says whether the match is house, street, area, or city. City-level matches cannot be used for delivery.',
      inputSchema: z.object({
        address_id: z.string().uuid().optional(),
        label: z.string().max(40).optional(),
        line1: z.string().max(160).optional(),
        line2: z.string().max(160).optional(),
        landmark: z.string().max(120).optional(),
        city: z.string().max(80).optional(),
        state: z.string().max(80).optional(),
        pincode: z.string().max(10).optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        accuracy_m: z.number().min(0).max(100000).optional(),
        source: z.enum(['map_pin', 'geocoded', 'manual']).optional(),
        is_default: z.boolean().optional(),
      }),
      annotations: WRITE,
    },
    async (input) => {
      try {
        const existing = input.address_id ? await repo.getAddressRow(input.address_id) : null;
        if (input.address_id && !existing) return fail('address_not_found', 'That address is not on this account.');

        const pincode = input.pincode !== undefined ? normalisePincode(input.pincode) : existing?.pincode || null;
        if (input.pincode !== undefined && !pincode) return fail('invalid_pincode', 'A pincode must be six digits.');

        const merged = {
          line1: input.line1 !== undefined ? input.line1.trim() : existing?.line1 || '',
          line2: input.line2 !== undefined ? input.line2.trim() : existing?.line2 || '',
          landmark: input.landmark !== undefined ? input.landmark.trim() : existing?.landmark || '',
          city: input.city !== undefined ? input.city.trim() : existing?.city || '',
          state: input.state !== undefined ? input.state.trim() : existing?.state || '',
          pincode: pincode || '',
        };
        if (!merged.line1) return fail('address_required', 'Add a house/street line for the address.');

        let lat = input.latitude;
        let lng = input.longitude;
        let accuracyM = input.accuracy_m;
        let matchType = 'house';
        let source = input.source || 'map_pin';

        if (lat !== undefined || lng !== undefined) {
          if (!coordsOk(Number(lat), Number(lng))) return fail('location_invalid', 'Pass both latitude and longitude.');
          accuracyM = accuracyM ?? 15;
        } else {
          const textChanged = ['line1', 'line2', 'landmark', 'city', 'state', 'pincode'].some(
            (key) => input[key] !== undefined && String(input[key] || '') !== String(existing?.[key] || '')
          );
          if (existing && !textChanged) {
            lat = existing.lat;
            lng = existing.lng;
            accuracyM = existing.accuracy_m;
            matchType = existing.match_type;
            source = existing.source;
          } else {
            const geo = await geocodeAddress(merged, {
              fetchImpl: deps.fetchImpl,
              googleKey: deps.config.googleKey,
              provider: deps.config.geocoderProvider,
            });
            if (!geo.ok) return fail(geo.code, geo.message);
            lat = geo.lat;
            lng = geo.lng;
            accuracyM = geo.accuracyM;
            matchType = geo.matchType;
            source = 'geocoded';
          }
        }

        const address = await repo.saveAddress({
          address_id: input.address_id,
          label: input.label !== undefined ? input.label : existing?.label || null,
          ...merged,
          lat,
          lng,
          accuracy_m: accuracyM,
          match_type: matchType,
          source,
          is_default: input.is_default,
        });
        return ok(
          `Saved ${address.label ? `${address.label}: ` : ''}${address.address}. Match: ${address.match_type}${address.match_type === 'area' ? ' (the shop may call to confirm)' : ''}.`,
          { address, needs_exact_address: address.match_type === 'city' }
        );
      } catch (error) {
        return fromError(error);
      }
    }
  );

  server.registerTool(
    'delete_address',
    {
      title: 'Delete a delivery address',
      description: 'Delete one saved delivery address. This cannot be undone.',
      inputSchema: z.object({ address_id: z.string().uuid() }),
      annotations: { ...WRITE, destructiveHint: true },
    },
    async ({ address_id }) => {
      try {
        const result = await repo.deleteAddress(address_id);
        return ok('Address deleted.', result);
      } catch (error) {
        return fromError(error);
      }
    }
  );

  server.registerTool(
    'quote_order',
    {
      title: 'Preview an order',
      description:
        'Price-lock a draft order for 10 minutes. This does NOT place an order. It validates stock, computes the total from the shop catalog, and returns a quote_id. After this, show the items, total, and full delivery address to the customer and ask for explicit confirmation before calling place_order.',
      inputSchema: z.object({
        shop_id: z.string().min(1),
        address_id: z.string().uuid(),
        items: z
          .array(z.object({ product_id: z.string().min(1), quantity: z.number().int().min(1).max(20) }))
          .min(1)
          .max(30),
        payment_method: z.enum(['COD']).optional(),
        customer_note: z.string().max(200).optional(),
      }),
      annotations: { ...WRITE, idempotentHint: false, destructiveHint: false },
    },
    async (input) => {
      try {
        if (!config.enabled) return fail('service_paused', 'AI ordering is paused right now.');
        if (!validateItemsShape(input.items)) return fail('items_required', 'Add at least one item.');

        const shop = await repo.getShop(input.shop_id);
        if (!shop) return fail('shop_not_found', 'That shop is not taking AI orders.');
        if (!isShopAvailable(shop)) return fail('shop_paused', 'That shop has paused AI orders. Nothing was ordered.');

        const address = await repo.getAddressRow(input.address_id);
        if (!address) return fail('address_required', 'Save a delivery address first, then quote the order.');

        const profile = await repo.getProfile();
        const phone = normalisePhone(profile?.phone);
        if (!phone) return fail('phone_required', 'A delivery phone is required. Ask for it and call save_customer_profile.');

        const service = serviceability(shop, { latitude: address.lat, longitude: address.lng });
        if (!service.ok) {
          return fail(
            'out_of_range',
            service.reason === 'out_of_range'
              ? `That shop does not deliver to this address (${roundedKm(service.distanceKm)} km away, radius ${service.radiusKm} km).`
              : 'That address cannot be used for delivery.'
          );
        }
        if (String(address.match_type) === 'city') {
          return fail('address_too_imprecise', 'That address is only city-level. Add a house/street line or a map pin before ordering.');
        }

        const catalog = await repo.getCatalog(shop.userId);
        const quote = buildQuote({ items: input.items, catalog, now: deps.now() });
        if (!quote.ok) return fail(quote.code, quote.message, quote.details);
        const total = checkOrderTotal(quote.totalPaise);
        if (!total.ok) return fail(total.code, total.message);

        const since = new Date(deps.now() - 60 * 60 * 1000).toISOString();
        const counts = await repo.usageCounts(shop.userId, since);
        const limits = evaluateOrderLimits(counts);
        if (!limits.ok) return fail(limits.code, limits.message);

        const saved = await repo.createQuote({
          shopUserId: shop.userId,
          address: addressSnapshot(address, profile),
          items: quote.items,
          total: Number((quote.totalPaise / 100).toFixed(2)),
          paymentMethod: 'COD',
          notes: input.customer_note ? input.customer_note.trim() : null,
          expiresAt: quote.expiresAt,
        });

        const lines = quote.items.map(
          (item) => `${item.quantity} × ${item.name} (${item.unit}) — ${formatRupees(item.totalPaise)}`
        );
        const warning = address.match_type === 'area' ? '\nAddress match is area-level; the shop may call to confirm.' : '';
        return ok(
          `Order preview from ${shop.name}:\n${lines.join('\n')}\nTotal: ${quote.total}\nDeliver to: ${formatAddress(address)}${warning}\n\nAsk the customer to confirm. Only then call place_order with quote_id ${saved.id} and confirmed: true. This quote expires at ${quote.expiresAt}.`,
          {
            quote_id: saved.id,
            shop: shopPublic(shop, service.distanceKm),
            items: quote.items,
            total: Number((quote.totalPaise / 100).toFixed(2)),
            total_display: quote.total,
            address: formatAddress(address),
            address_match_type: address.match_type,
            payment_method: 'COD',
            expires_at: quote.expiresAt,
            requires_confirmation: true,
            warnings: address.match_type === 'area' ? ['Area-level address; the shop may call to confirm.'] : [],
          }
        );
      } catch (error) {
        return fromError(error);
      }
    }
  );

  server.registerTool(
    'place_order',
    {
      title: 'Place the confirmed order',
      description:
        'Place the order that quote_order produced. CRITICAL: call this only after showing the customer the items, total, and full delivery address and receiving an explicit yes. The quote must be less than 10 minutes old. Never invent a quote_id or change the basket here.',
      inputSchema: z.object({
        quote_id: z.string().uuid(),
        confirmed: z.literal(true),
      }),
      annotations: { ...WRITE, destructiveHint: false },
    },
    async ({ quote_id }) => {
      try {
        if (!config.enabled) return fail('service_paused', 'AI ordering is paused right now.');
        const quote = await repo.getQuote(quote_id);
        if (!quote) return fail('quote_not_found', 'That order preview no longer exists. Ask for a fresh preview.');
        if (!quote.consumed_at && isQuoteExpired(quote, deps.now())) {
          return fail('quote_expired', 'That preview expired. Ask for a fresh preview before placing the order.');
        }

        const shop = await repo.getShopByUserId(quote.shop_user_id);
        // A retry of an already-placed quote must return the same order even if
        // the shop has since paused. Only a fresh placement checks availability.
        if (!quote.consumed_at) {
          if (!shop || shop.mcp_enabled === false) return fail('shop_paused', 'That shop is not taking AI orders.');
          if (shop.orders_paused) return fail('shop_paused', 'That shop has paused AI orders. Nothing was ordered.');
          const catalog = await repo.getCatalog(quote.shop_user_id);
          const byId = new Map(catalog.map((product) => [product.productId, product]));
          const unavailable = (quote.items || []).filter((item) => {
            const product = byId.get(item.productId);
            if (!product || !product.inStock) return true;
            return Number.isFinite(product.stock) && Number(item.quantity) > product.stock;
          });
          if (unavailable.length > 0) {
            return fail(
              'product_unavailable',
              'Some items went out of stock. Ask for a fresh preview.',
              { productIds: unavailable.map((item) => item.productId) }
            );
          }

          const since = new Date(deps.now() - 60 * 60 * 1000).toISOString();
          const counts = await repo.usageCounts(quote.shop_user_id, since);
          const limits = evaluateOrderLimits(counts);
          if (!limits.ok) return fail(limits.code, limits.message);
        }

        const externalId = mcpOrderId(new Date(deps.now()), deps.randomBytes);
        const row = await repo.placeOrder({ quoteId: quote.id, externalId });
        if (!row) return fail('order_failed', 'The order could not be saved. Nothing was charged.');

        const order = publicOrder(row, shop || {});
        if (String(row.status).toUpperCase() !== 'NEW') {
          return ok(
            `This quote was already placed. ${order.order_id} is ${order.status_label.toLowerCase()}.`,
            { order, already_placed: true }
          );
        }
        return ok(
          `Order placed: ${order.order_id} with ${order.shop.name}. Total ${order.total_display}, cash on delivery. The shop will accept or reject it. Track it with get_order using this order id.`,
          { order }
        );
      } catch (error) {
        return fromError(error);
      }
    }
  );

  server.registerTool(
    'get_order',
    {
      title: 'Get one order',
      description: 'Read the current status of an MCP order placed by this customer.',
      inputSchema: z.object({ order_id: z.string().min(3) }),
      annotations: READ,
    },
    async ({ order_id }) => {
      try {
        const row = await repo.getOrder(order_id);
        if (!row) return fail('order_not_found', 'No order with that id is on this account.');
        const shop = await repo.getShopByUserId(row.user_id);
        const order = publicOrder(row, shop || {});
        return ok(`${order.order_id}: ${order.status_label}. Total ${order.total_display}.`, { order });
      } catch (error) {
        return fromError(error);
      }
    }
  );

  server.registerTool(
    'list_orders',
    {
      title: 'List recent orders',
      description: 'List the customer recent MCP orders, newest first.',
      inputSchema: z.object({ limit: z.number().int().min(1).max(10).optional() }),
      annotations: READ,
    },
    async ({ limit }) => {
      try {
        const rows = await repo.listOrders(limit || 10);
        if (rows.length === 0) return ok('No orders yet.', { orders: [] });
        const shopIds = [...new Set(rows.map((row) => row.user_id))];
        const shops = new Map();
        for (const id of shopIds) {
          const shop = await repo.getShopByUserId(id);
          if (shop) shops.set(id, shop);
        }
        const orders = rows.map((row) => publicOrder(row, shops.get(row.user_id) || {}));
        const lines = orders.map((order) => `${order.order_id} — ${order.shop.name} — ${order.total_display} — ${order.status_label}`);
        return ok(`Recent orders:\n${lines.join('\n')}`, { orders });
      } catch (error) {
        return fromError(error);
      }
    }
  );

  registerAppTool(
    server,
    'show_checkout',
    {
      title: 'Show checkout card',
      description:
        'Render an interactive checkout card for a live quote. This does not place an order. Use it after quote_order when the host can display MCP Apps; hosts without UI support receive the same summary as text.',
      inputSchema: z.object({ quote_id: z.string().uuid() }),
      annotations: READ,
      _meta: { ui: { resourceUri: CHECKOUT_URI } },
    },
    async ({ quote_id }) => {
      try {
        const quote = await repo.getQuote(quote_id);
        if (!quote) return fail('quote_not_found', 'That order preview no longer exists. Ask for a fresh preview.');
        if (quote.consumed_at) return fail('quote_already_used', 'That preview was already placed.');
        if (isQuoteExpired(quote, deps.now())) return fail('quote_expired', 'That preview expired. Ask for a fresh preview.');
        const shop = await repo.getShopByUserId(quote.shop_user_id);
        const total = Number(quote.total) || 0;
        const view = {
          quote_id: quote.id,
          shop: { shop_id: shop?.public_shop_id || null, name: shop?.store_name || 'Shop' },
          items: quote.items,
          total,
          total_display: formatRupees(Math.round(total * 100)),
          address: quote.address_snapshot?.address || '',
          payment_method: quote.payment_method,
          expires_at: quote.expires_at,
        };
        const lines = (quote.items || []).map((item) => `${item.quantity} × ${item.name} — ${item.total}`);
        return ok(
          `Checkout preview from ${view.shop.name}:
${lines.join('\n')}\nTotal: ${view.total_display}\nDeliver to: ${view.address}\n\nOnly place this order after the customer confirms.`,
          { quote: view }
        );
      } catch (error) {
        return fromError(error);
      }
    }
  );

  server.registerTool(
    'cancel_order',
    {
      title: 'Cancel an order',
      description: 'Cancel an order that the shop has not accepted yet. Once the shop accepts, the customer must call the shop.',
      inputSchema: z.object({ order_id: z.string().min(3) }),
      annotations: { ...WRITE, destructiveHint: true, idempotentHint: true },
    },
    async ({ order_id }) => {
      try {
        const row = await repo.cancelOrder(order_id);
        const shop = await repo.getShopByUserId(row.user_id);
        const order = publicOrder(row, shop || {});
        return ok(`${order.order_id} is cancelled.`, { order });
      } catch (error) {
        return fromError(error);
      }
    }
  );
}
