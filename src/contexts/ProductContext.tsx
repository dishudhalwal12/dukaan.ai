import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback, useRef } from 'react';
import { Product, Insight } from '../types.ts';
import { initialProducts } from '../data/initialProducts.ts';
import { catalogPreset } from '../data/presetProducts.js';
import { generateDynamicInsights } from '../services/ai.ts';
import { currentIdentity, enforceDataOwnership } from '../utils/localStore.ts';
import { syncProductsToCloud, deleteProductFromCloud } from '../services/cloudSync.ts';
import { useLanguage } from './LanguageContext.tsx';
import { whatsappService } from '../services/whatsappService.ts';
import { normalizeStock } from '../utils/stock.ts';
import { isOldPresetId, migratePresetCatalog, reconcileCatalog } from '../utils/catalogSync.js';

interface ProductContextType {
  products: Product[];
  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (product: Product) => void;
  deleteProduct: (productId: string) => void;
  loadProducts: (products: Product[]) => void;
  loading: boolean;
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

interface InsightContextType {
  insights: Insight[];
  isLoadingInsights: boolean;
  error: string | null;
  refreshInsights: () => Promise<void>;
}

const InsightContext = createContext<InsightContextType | undefined>(undefined);


export const ProductProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [insights, setInsights] = useState<Insight[]>([]);
  const [isLoadingInsights, setIsLoadingInsights] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { language, t, languageReady, translationsLanguage } = useLanguage();
  // Every generation gets an id. A language change starts a new generation, and
  // the old stream's remaining chunks are ignored instead of being appended to
  // the new (possibly different-language) list.
  const insightsRequestId = useRef(0);

  /* ─── [MULTI-BUSINESS] commented for grocery-only build — restore to re-enable ───
  // ─── Neutral fallback for "Other" — mirrors OnboardingFlow's constant ──────
  // This is the last line of defense: if ProductContext somehow runs before
  // OnboardingFlow writes dukaan-custom-catalog-seed, this fires instead of
  // the grocery-loaded initialProducts.
  const OTHER_NEUTRAL_FALLBACK = [
    { name: 'Item 1', price: 100, stock: 10, unit: 'pcs' },
    { name: 'Item 2', price: 150, stock: 10, unit: 'pcs' },
    { name: 'Item 3', price: 200, stock: 10, unit: 'pcs' },
    { name: 'Item 4', price: 250, stock: 10, unit: 'pcs' },
  ];
  ─── end [MULTI-BUSINESS] ─── */

  useEffect(() => {
    try {
      // The cache is per-device but the catalogue is per-account: drop another
      // account's products before reading them.
      enforceDataOwnership(currentIdentity());
      const storedProducts = localStorage.getItem('dukan-products');
      const seededForCategory = localStorage.getItem('dukaan-catalog-seeded-for');
      const category = localStorage.getItem('dukan-store-category');
      // [MULTI-BUSINESS] commented for grocery-only build — restore to re-enable.
      // const isOther = category === 'Other' || category === 'Other Grocery' || category === 'category_other';

      /* ── [MULTI-BUSINESS] commented for grocery-only build — restore to re-enable ──
      // ── FIREWALL: "Other" category has its own sealed seeding path ──────────
      // We NEVER use initialProducts (grocery) for "Other".
      // We NEVER fall through to presetProductsByDisplayName for "Other".
      if (isOther) {
        const aiSeedDone = localStorage.getItem('dukaan-other-ai-seed-done');

        // If AI-verified seed exists and category matches — trust it as-is.
        // This also handles re-renders and hot-reloads without re-seeding.
        if (storedProducts && seededForCategory === category && aiSeedDone === 'true') {
          const parsed = JSON.parse(storedProducts);
          if (Array.isArray(parsed)) setProducts(parsed);
          setLoading(false);
          return;
        }

        // Stale run detected: products exist but not for this category,
        // or sentinel key is missing. Clear the stale state and force re-seed.
        if (storedProducts && seededForCategory !== category) {
          localStorage.removeItem('dukan-products');
          localStorage.removeItem('dukaan-catalog-seeded-for');
          localStorage.removeItem('dukaan-other-ai-seed-done');
        }

        // Read the AI-generated or neutral-fallback seed written by OnboardingFlow.
        const customSeedStr = localStorage.getItem('dukaan-custom-catalog-seed');
        let seedToUse = OTHER_NEUTRAL_FALLBACK;

        if (customSeedStr) {
          try {
            const parsed = JSON.parse(customSeedStr);
            if (Array.isArray(parsed) && parsed.length > 0) {
              seedToUse = parsed;
            }
          } catch (e) {
            console.error('[ProductContext] Failed to parse custom catalog seed', e);
          }
        }

        // Map to Product shape
        const seededProducts: Product[] = seedToUse.map((item: any, i: number) => ({
          id: `custom_${i}_${Date.now()}`,
          name: item.name,
          price: `₹${item.price}`,
          stock: item.stock,
          stockUnit: item.unit || 'pcs',
          imageUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&h=600&fit=crop',
        }));

        setProducts(seededProducts);
        localStorage.setItem('dukaan-catalog-seeded', 'true');
        localStorage.setItem('dukaan-catalog-seeded-for', category ?? '');
        localStorage.setItem('dukan-products', JSON.stringify(seededProducts));
        localStorage.removeItem('dukaan-custom-catalog-seed');
        setLoading(false);
        return;
      }
      ── end [MULTI-BUSINESS] ── */

      // ── Standard path for every category ────────────────────────────────────
      // The starter catalog is the same whatever the category, and old
      // per-category seed rows are replaced with it. Products the shopkeeper
      // added are kept; a catalog without any starter row is left alone.
      const categoryMismatch =
        storedProducts &&
        (seededForCategory === null || seededForCategory !== category);

      const seedOrPreserve = (stored: Product[]): Product[] => {
        if (!Array.isArray(stored) || stored.length === 0) return catalogPreset;
        const isStarter = (product: Product) =>
          String(product?.id || '').startsWith('kirana_') || isOldPresetId(product?.id);
        return stored.some(isStarter)
          ? (migratePresetCatalog(stored, catalogPreset) as Product[])
          : [...catalogPreset, ...stored];
      };

      if (storedProducts) {
        const parsed = JSON.parse(storedProducts);
        // Re-clamped on the way in: a build that predates the guard may have
        // left a negative count in storage, and it would otherwise persist for
        // ever because nothing rewrites an untouched row.
        if (Array.isArray(parsed)) {
          const base = categoryMismatch
            ? seedOrPreserve(parsed)
            : (migratePresetCatalog(parsed, catalogPreset) as Product[]);
          const cleaned = reconcileCatalog(base) as Product[];
          setProducts(cleaned.map(p => ({ ...p, stock: normalizeStock(p?.stock) })));
          if (categoryMismatch || cleaned.length !== parsed.length) {
            localStorage.setItem('dukan-products', JSON.stringify(cleaned));
            localStorage.setItem('dukan-catalog-seeded-for', category ?? '');
          }
        }
      } else {
        const cleanedSeed = reconcileCatalog(catalogPreset) as Product[];
        setProducts(cleanedSeed);
        localStorage.setItem('dukan-catalog-seeded', 'true');
        localStorage.setItem('dukaan-catalog-seeded-for', category ?? '');
        localStorage.setItem('dukan-products', JSON.stringify(cleanedSeed));
      }
    } catch (error) {
      console.error('Failed to load products from localStorage', error);
      setProducts(initialProducts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading) {
        try {
            localStorage.setItem('dukan-products', JSON.stringify(products));
            syncProductsToCloud(products);
        } catch (error) {
             if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
                console.error("LocalStorage quota exceeded. Cannot save products.");
                alert("Error: Your device storage is full. Cannot save new product data. Please try removing some older products or images.");
            } else {
                console.error("Failed to save products to localStorage", error);
            }
        }

        // Auto-sync live store catalog to Baileys WhatsApp bot
        if (products.length > 0) {
            const formattedForBot = products.map(p => ({
                ...p,
                name: t(p.name) || p.name
            }));
            whatsappService.syncCatalog(formattedForBot).catch(err => {
                // Deferred or offline during initial frontend boot
                console.debug('[ProductContext] WhatsApp catalog auto-sync deferred:', err?.message || err);
            });
        }
    }
  }, [products, loading]);

  const refreshInsights = useCallback(async () => {
    const requestId = ++insightsRequestId.current;
    setIsLoadingInsights(true);
    setError(null);
    setInsights([]); // Clear previous insights for streaming

    try {
      for await (const insight of generateDynamicInsights(products, language, t)) {
        if (requestId !== insightsRequestId.current) return;
        setInsights(prevInsights => [...prevInsights, insight]);
      }
    } catch (err) {
      if (requestId !== insightsRequestId.current) return;
      const errorMessage = 'Failed to load insights due to a network or client error.';
      setError(errorMessage);
      console.error(err);
    } finally {
      if (requestId === insightsRequestId.current) {
        setIsLoadingInsights(false);
      }
    }
  }, [products, language, t]);

  useEffect(() => {
    // Runs when the catalogue has loaded, and again when the language changes:
    // the insights are model-written prose, so the only way to localise them is
    // to ask again. Deliberately NOT dependent on `products` (that would re-ask
    // on every stock edit) or on `refreshInsights` (same reason).
    //
    // `languageReady` is the first-load fix: on a new device the provider starts
    // with English and only learns the account's language after the profile
    // sync. Generating before that paints English insights first and then
    // replaces them — the "refresh fixes it" bug.
    //
    // `translationsLanguage` closes the other half: changing `language` starts
    // the bundle fetch, so without this the generator would run once with the
    // previous language's strings and never re-run when the new bundle landed.
    if (!loading && languageReady && translationsLanguage === language) {
      refreshInsights();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, language, languageReady, translationsLanguage]);

  /**
   * The single choke point for stock.
   *
   * Every writer funnels through here — the product form, accepting an order,
   * cancelling one, and a restore from Supabase — so a negative count cannot be
   * introduced by a caller that forgot to clamp. Before this, the only floor in
   * the codebase was one `Math.max(0, …)` at a single call site in App.tsx.
   */
  const withSafeStock = (product: Product): Product => ({
    ...product,
    stock: normalizeStock(product.stock),
  });

  const addProduct = (product: Omit<Product, 'id'>) => {
    const newProduct: Product = withSafeStock({
      ...product,
      id: `prod_${new Date().getTime()}`,
    });
    setProducts(prevProducts => [...prevProducts, newProduct]);
  };

  const updateProduct = (updatedProduct: Product) => {
    const safeProduct = withSafeStock(updatedProduct);
    setProducts(prevProducts =>
      prevProducts.map(p => (p.id === safeProduct.id ? safeProduct : p))
    );
  };

  const deleteProduct = (productId: string) => {
    setProducts(prevProducts => prevProducts.filter(p => p.id !== productId));
    deleteProductFromCloud(productId);
  };
  
  const loadProducts = useCallback((newProducts: Product[]) => {
    // Also covers a restore from Supabase and anything an older build left in
    // localStorage with a negative count. Old starter rows in the cloud are
    // migrated to the shared preset; the account's own products are kept.
    const migrated = migratePresetCatalog(newProducts, catalogPreset) as Product[];
    const cleaned = reconcileCatalog(migrated) as Product[];
    const safe = cleaned.map(p => ({ ...p, stock: normalizeStock(p.stock) }));
    setProducts(safe);
    try {
      localStorage.setItem('dukan-products', JSON.stringify(safe));
    } catch (e) {
      console.error('Failed to cache products', e);
    }
  }, []);

  const productContextValue = { products, addProduct, updateProduct, deleteProduct, loadProducts, loading };
  const insightContextValue = { insights, isLoadingInsights, error, refreshInsights };

  return (
    <ProductContext.Provider value={productContextValue}>
        <InsightContext.Provider value={insightContextValue}>
            {children}
        </InsightContext.Provider>
    </ProductContext.Provider>
  );
};

export const useProducts = () => {
  const context = useContext(ProductContext);
  if (context === undefined) {
    throw new Error('useProducts must be used within a ProductProvider');
  }
  return context;
};

export const useInsights = () => {
    const context = useContext(InsightContext);
    if (context === undefined) {
        throw new Error('useInsights must be used within a ProductProvider');
    }
    return context;
};