import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback } from 'react';
import { Product, Insight } from '../types.ts';
import { initialProducts } from '../data/initialProducts.ts';
import { presetProductsByDisplayName } from '../data/presetProducts.ts';
import { generateDynamicInsights } from '../services/ai.ts';
import { useLanguage } from './LanguageContext.tsx';

interface ProductContextType {
  products: Product[];
  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (product: Product) => void;
  deleteProduct: (productId: string) => void;
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
  const { language } = useLanguage();

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

  useEffect(() => {
    try {
      const storedProducts = localStorage.getItem('dukan-products');
      const seededForCategory = localStorage.getItem('dukaan-catalog-seeded-for');
      const category = localStorage.getItem('dukan-store-category');
      const isOther = category === 'Other' || category === 'category_other';

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

      // ── Standard path for all preset categories (Grocery, Salon, etc.) ──────
      const categoryMismatch =
        storedProducts &&
        (seededForCategory === null || seededForCategory !== category);

      if (storedProducts && !categoryMismatch) {
        const parsed = JSON.parse(storedProducts);
        if (Array.isArray(parsed)) setProducts(parsed);
      } else {
        let initialSeed: Product[] = initialProducts;

        if (category) {
          const presetSeed = presetProductsByDisplayName[category];
          if (presetSeed && presetSeed.length > 0) {
            initialSeed = presetSeed;
          }
        }

        setProducts(initialSeed);
        localStorage.setItem('dukaan-catalog-seeded', 'true');
        localStorage.setItem('dukaan-catalog-seeded-for', category ?? '');
        localStorage.setItem('dukan-products', JSON.stringify(initialSeed));
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
        } catch (error) {
             if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
                console.error("LocalStorage quota exceeded. Cannot save products.");
                alert("Error: Your device storage is full. Cannot save new product data. Please try removing some older products or images.");
            } else {
                console.error("Failed to save products to localStorage", error);
            }
        }
    }
  }, [products, loading]);

  const refreshInsights = useCallback(async () => {
    setIsLoadingInsights(true);
    setError(null);
    setInsights([]); // Clear previous insights for streaming

    try {
      for await (const insight of generateDynamicInsights(products, language)) {
        setInsights(prevInsights => [...prevInsights, insight]);
      }
    } catch (err) {
      const errorMessage = 'Failed to load insights due to a network or client error.';
      setError(errorMessage);
      console.error(err);
    } finally {
      setIsLoadingInsights(false);
    }
  }, [products, language]);

  useEffect(() => {
    // This effect runs only when the initial product data has been loaded.
    // It is intentionally not dependent on `refreshInsights` (and by extension, `products`)
    // to prevent automatic refreshes when the product catalog changes.
    // Insights will now only refresh on initial load or when the user manually clicks the refresh button.
    if (!loading) {
      refreshInsights();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const addProduct = (product: Omit<Product, 'id'>) => {
    const newProduct: Product = {
      ...product,
      id: `prod_${new Date().getTime()}`,
    };
    setProducts(prevProducts => [...prevProducts, newProduct]);
  };

  const updateProduct = (updatedProduct: Product) => {
    setProducts(prevProducts =>
      prevProducts.map(p => (p.id === updatedProduct.id ? updatedProduct : p))
    );
  };

  const deleteProduct = (productId: string) => {
    setProducts(prevProducts => prevProducts.filter(p => p.id !== productId));
  };
  
  const productContextValue = { products, addProduct, updateProduct, deleteProduct, loading };
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