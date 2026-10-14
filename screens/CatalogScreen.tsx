import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useProducts } from '../contexts/ProductContext.tsx';
import { Product, UnityDeal } from '../types.ts';
import ProductModal from '../components/ProductModal.tsx';
import { useLanguage } from '../contexts/LanguageContext.tsx';
import StoreNameModal from '../components/StoreNameModal.tsx';
import SupplierDetailsModal from '../components/SupplierDetailsModal.tsx';
import UpstockMessageModal from '../components/UpstockMessageModal.tsx';
import UnityModal from '../components/UnityModal.tsx';
import { initialUnityDeals } from '../data/unityDeals.ts';
import { useBusinessLabel } from '../hooks/useBusinessLabel.ts';

const CatalogHeader: React.FC = () => {
    const label = useBusinessLabel('CATALOG');
    return (
        <header className="flex items-center bg-gradient-to-b from-[#1A1A1A] to-black p-4 pb-2 justify-center sticky top-0 z-10">
            <h1 className="text-white text-xl font-bold tracking-tight">{label}</h1>
        </header>
    );
};

const SearchAndAdd: React.FC<{ 
    onAdd: () => void; 
    onSearch: (query: string) => void;
    onUpstock: () => void;
    onUnity: () => void;
}> = ({ onAdd, onSearch, onUpstock, onUnity }) => {
    const { t } = useLanguage();
    return (
        <div className="flex items-center gap-2">
            <div className="relative flex-grow">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">search</span>
                <input 
                  type="text" 
                  placeholder="Search products..." 
                  onChange={(e) => onSearch(e.target.value)}
                  className="w-full bg-[#1A1A1A] text-white rounded-full pl-10 pr-4 py-2.5 border border-[#2D2D2D] focus:ring-2 focus:ring-[#E6E6FA] focus:outline-none"
                />
            </div>
            <button 
                onClick={onUnity}
                className="relative p-2.5 bg-[#1A1A1A] text-white rounded-full border border-[#2D2D2D] hover:bg-neutral-800 transition-colors"
                aria-label={t('button_unity_deals')}
            >
                <span className="material-symbols-outlined">groups</span>
            </button>
            <button 
                onClick={onUpstock}
                className="relative p-2.5 bg-[#1A1A1A] text-white rounded-full border border-[#2D2D2D] hover:bg-neutral-800 transition-colors"
                 aria-label="Upstock from supplier"
            >
                <span className="material-symbols-outlined">local_shipping</span>
            </button>
            <button 
                onClick={onAdd}
                className="p-2.5 bg-[#E6E6FA] text-black rounded-full hover:opacity-90 transition-opacity"
                aria-label="Add new product"
            >
                <span className="material-symbols-outlined">add</span>
            </button>
        </div>
    );
};

const ProductCard: React.FC<{ product: Product; onEdit: () => void, onDelete: () => void }> = ({ product, onEdit, onDelete }) => {
    const { t } = useLanguage();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    return (
        <div className="bg-[#1A1A1A] rounded-xl flex items-center p-3 gap-3">
            <img src={product.imageUrl} alt={product.name} className="w-16 h-16 rounded-lg object-cover bg-neutral-700" />
            <div className="flex-1">
                <p className="font-bold text-white">{t(product.name)}</p>
                <p className="text-sm text-neutral-400">{product.price}</p>
                <p className={`text-sm font-semibold ${product.stock < 10 ? 'text-red-400' : product.stock > 10 ? 'text-green-400' : 'text-neutral-300'}`}>
                    Stock: {product.stock} {product.stockUnit}
                </p>
            </div>
            <div className="relative" ref={menuRef}>
                <button onClick={() => setIsMenuOpen(prev => !prev)} className="p-2 text-neutral-400 rounded-full hover:bg-[#2D2D2D]">
                    <span className="material-symbols-outlined">more_vert</span>
                </button>
                {isMenuOpen && (
                    <div className="absolute right-0 top-10 w-40 bg-[#2D2D2D] rounded-lg shadow-xl z-20 py-1">
                        <button onClick={() => { onEdit(); setIsMenuOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-white hover:bg-neutral-600 flex items-center gap-2">
                           <span className="material-symbols-outlined text-base">edit</span> Edit
                        </button>
                        <button onClick={() => { onDelete(); setIsMenuOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-neutral-600 flex items-center gap-2">
                            <span className="material-symbols-outlined text-base">delete</span> Delete
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};


interface CatalogScreenProps {
  onModalStateChange: (isOpen: boolean) => void;
}

const CatalogScreen: React.FC<CatalogScreenProps> = ({ onModalStateChange }) => {
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [isUnityModalOpen, setIsUnityModalOpen] = useState(false);
    const [productToEdit, setProductToEdit] = useState<Product | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const { products, loading, deleteProduct } = useProducts();
    const { t } = useLanguage();

    // Modals for Upstock Flow
    const [isStoreNameModalOpen, setIsStoreNameModalOpen] = useState(false);
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [isUpstockMessageModalOpen, setIsUpstockMessageModalOpen] = useState(false);
    const [upstockMessage, setUpstockMessage] = useState('');
    const [whatsappUrl, setWhatsappUrl] = useState('');

    // --- State for Unity Deals ---
    const [unityDeals, setUnityDeals] = useState<UnityDeal[]>(() => JSON.parse(JSON.stringify(initialUnityDeals)));
    const [joinedUnityDeals, setJoinedUnityDeals] = useState<Record<string, number>>({}); // {[dealId]: quantity}

    const filteredProducts = useMemo(() => {
        return products.filter(p => t(p.name).toLowerCase().includes(searchQuery.toLowerCase()));
    }, [products, searchQuery, t]);
    
    const modalsOpen = isProductModalOpen || isStoreNameModalOpen || isSupplierModalOpen || isUpstockMessageModalOpen || isUnityModalOpen;
    useEffect(() => {
        onModalStateChange(modalsOpen);
    }, [modalsOpen, onModalStateChange]);

    const handleAddProduct = () => {
        setProductToEdit(null);
        setIsProductModalOpen(true);
    };

    const handleEditProduct = (product: Product) => {
        setProductToEdit(product);
        setIsProductModalOpen(true);
    };

    const handleDeleteProduct = (productId: string) => {
        if (window.confirm('Are you sure you want to delete this product?')) {
            deleteProduct(productId);
        }
    };
    
    const handleUpstockClick = () => {
        const lowStockItems = products.filter(p => p.stock < 10);
        if (lowStockItems.length === 0) {
            alert("No items are currently low on stock (less than 10 units).");
            return;
        }

        const storeName = localStorage.getItem('dukan-store-name');
        if (!storeName) {
            setIsStoreNameModalOpen(true);
        } else {
            handleStoreNameSaved();
        }
    };

    const handleUnityClick = () => {
        setIsUnityModalOpen(true);
    };

     const handleJoinUnityDeal = (dealId: string, quantity: number) => {
        const isFirstJoin = !joinedUnityDeals[dealId];

        // Update the main deals list with new progress
        setUnityDeals(currentDeals => currentDeals.map(d => {
            if (d.id === dealId) {
                return {
                    ...d,
                    currentQuantity: Math.min(d.currentQuantity + quantity, d.targetQuantity),
                    participants: isFirstJoin ? d.participants + 1 : d.participants,
                };
            }
            return d;
        }));
        
        // Update the user's joined list
        setJoinedUnityDeals(prev => ({
            ...prev,
            [dealId]: (prev[dealId] || 0) + quantity
        }));
    };

    const handleStoreNameSaved = () => {
        setIsStoreNameModalOpen(false);
        const supplierName = localStorage.getItem('dukan-supplier-name');
        const supplierWhatsapp = localStorage.getItem('dukan-supplier-whatsapp');
        if (!supplierName || !supplierWhatsapp) {
            setIsSupplierModalOpen(true);
        } else {
            handleSupplierDetailsSaved();
        }
    };

    const handleSupplierDetailsSaved = () => {
        setIsSupplierModalOpen(false);
        generateAndShowUpstockMessage();
    };

    const generateAndShowUpstockMessage = () => {
        const storeName = localStorage.getItem('dukan-store-name') || "our store";
        const supplierName = localStorage.getItem('dukan-supplier-name') || "Sir/Madam";
        const supplierWhatsapp = localStorage.getItem('dukan-supplier-whatsapp');
        
        const lowStockItems = products.filter(p => p.stock < 10);
        
        const itemsList = lowStockItems.map(p => `- ${t(p.name)} (Current stock: ${p.stock} ${p.stockUnit})`).join('\n');
        
        const message = `Hello ${supplierName},\n\nPlease send the following items for ${storeName}:\n\n${itemsList}\n\nThank you!`;
        
        const encodedMessage = encodeURIComponent(message);
        const url = `https://wa.me/${supplierWhatsapp}?text=${encodedMessage}`;

        setUpstockMessage(message);
        setWhatsappUrl(url);
        setIsUpstockMessageModalOpen(true);
    };
    
    return (
        <div>
            <CatalogHeader />
            <div className="p-4">
                <SearchAndAdd 
                    onAdd={handleAddProduct} 
                    onSearch={setSearchQuery} 
                    onUpstock={handleUpstockClick}
                    onUnity={handleUnityClick}
                />
            </div>
            {loading ? (
                <div className="text-center py-10">Loading products...</div>
            ) : (
                <div className="px-4 space-y-3 pb-4">
                    {filteredProducts.map(product => (
                        <ProductCard 
                            key={product.id} 
                            product={product} 
                            onEdit={() => handleEditProduct(product)}
                            onDelete={() => handleDeleteProduct(product.id)}
                        />
                    ))}
                    {filteredProducts.length === 0 && (
                        <div className="text-center py-20 text-neutral-400">
                             <div className="flex flex-col items-center justify-center p-8 bg-[#1A1A1A] rounded-2xl w-full max-w-xs mx-auto">
                                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#2D2D2D] mb-5">
                                    <span className="material-symbols-outlined text-4xl text-neutral-400">inventory_2</span>
                                </div>
                                <h3 className="text-lg font-bold text-white">No Products Found</h3>
                                <p className="mt-1 text-sm text-neutral-400">
                                    Try adjusting your search or adding a new product.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}
            <ProductModal 
                isOpen={isProductModalOpen} 
                onClose={() => setIsProductModalOpen(false)} 
                productToEdit={productToEdit}
                onUpstockClick={handleUpstockClick}
            />
            <StoreNameModal
                isOpen={isStoreNameModalOpen}
                onClose={() => setIsStoreNameModalOpen(false)}
                onSave={handleStoreNameSaved}
            />
             <SupplierDetailsModal
                isOpen={isSupplierModalOpen}
                onClose={() => setIsSupplierModalOpen(false)}
                onSave={handleSupplierDetailsSaved}
            />
            <UpstockMessageModal
                isOpen={isUpstockMessageModalOpen}
                onClose={() => setIsUpstockMessageModalOpen(false)}
                message={upstockMessage}
                whatsappUrl={whatsappUrl}
            />
            <UnityModal
                isOpen={isUnityModalOpen}
                onClose={() => setIsUnityModalOpen(false)}
                deals={unityDeals}
                joinedDeals={joinedUnityDeals}
                onJoinDeal={handleJoinUnityDeal}
            />
        </div>
    );
};

export default CatalogScreen;