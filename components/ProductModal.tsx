import React, { useState, useEffect, useRef } from 'react';
import { Product } from '../types.ts';
import { XIcon, CameraIcon } from './Icons.tsx';
import { useProducts } from '../contexts/ProductContext.tsx';
import { resizeImage } from '../utils/image.ts';
import { useLanguage } from '../contexts/LanguageContext.tsx';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  productToEdit: Product | null;
  onUpstockClick: () => void;
}

const ProductModal: React.FC<ProductModalProps> = ({ isOpen, onClose, productToEdit, onUpstockClick }) => {
  const { products, addProduct, updateProduct } = useProducts();
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [stockUnit, setStockUnit] = useState('units');
  const [imageUrl, setImageUrl] = useState('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upstock feature state and logic
  const lowStockItems = products.filter(p => p.stock < 10);

  useEffect(() => {
    if (productToEdit) {
      setName(t(productToEdit.name));
      setPrice(productToEdit.price.replace('₹', ''));
      setStock(String(productToEdit.stock));
      setStockUnit(productToEdit.stockUnit);
      setImageUrl(productToEdit.imageUrl);
    } else {
      // Reset form when opening for a new product
      setName('');
      setPrice('');
      setStock('');
      setStockUnit('units');
      setImageUrl('');
    }
  }, [productToEdit, isOpen, t]);

  useEffect(() => {
    const mainElement = document.querySelector('main');
    if (isOpen) {
      mainElement?.classList.add('overflow-hidden');
    } else {
      mainElement?.classList.remove('overflow-hidden');
    }
    return () => {
      mainElement?.classList.remove('overflow-hidden');
    };
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price || !stock) {
        alert("Please fill all fields.");
        return;
    }
    const productData = {
      name,
      price: `₹${price}`,
      stock: parseInt(stock, 10),
      stockUnit,
      imageUrl: imageUrl || 'https://via.placeholder.com/150/1A1A1A/E6E6FA?text=No+Image',
    };

    if (productToEdit) {
      // If the name hasn't changed from the translated initial name,
      // we should save the original key, not the translated string.
      // Otherwise, we save the new user-entered name.
      if (t(productToEdit.name) === name) {
        productData.name = productToEdit.name;
      }
      updateProduct({ ...productData, id: productToEdit.id });
    } else {
      addProduct(productData);
    }
    onClose();
  };

  const handleImageUploadClick = () => {
    if (isProcessingImage) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsProcessingImage(true);
      try {
        const compressedImage = await resizeImage(file, 400, 400, 0.8);
        setImageUrl(compressedImage);
      } catch (error) {
        console.error("Failed to process image:", error);
        alert("There was an error processing your image. Please try another one.");
      } finally {
        setIsProcessingImage(false);
      }
    }
  };

  const handleUpstockClick = () => {
    onUpstockClick();
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black bg-opacity-70 z-30 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`fixed bottom-0 left-0 right-0 max-w-sm mx-auto bg-[#1A1A1A] text-white rounded-t-2xl p-6 z-40 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
      >
        <div className="flex justify-between items-center mb-6">
          <h3 id="product-modal-title" className="text-lg font-bold text-white">
            {productToEdit ? t('edit_product') : t('add_new_product')}
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white" aria-label="Close">
            <XIcon className="w-6 h-6" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-4">
            <button type="button" onClick={handleImageUploadClick} className="relative flex-shrink-0 h-20 w-20 bg-[#2D2D2D] rounded-lg flex items-center justify-center overflow-hidden">
                {imageUrl && !isProcessingImage && <img src={imageUrl} alt="Product" className="h-full w-full object-cover"/>}
                {!imageUrl && !isProcessingImage && <CameraIcon className="w-8 h-8 text-neutral-400"/>}
                {isProcessingImage && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
            </button>
             <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            <div className="w-full">
                <label htmlFor="product-name" className="text-sm font-medium text-neutral-400">Product Name</label>
                <input id="product-name" type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-[#2D2D2D] mt-1 text-white rounded-md p-2 border-transparent focus:ring-2 focus:ring-[#E6E6FA] focus:outline-none" required/>
            </div>
          </div>
          <div>
            <label htmlFor="price" className="text-sm font-medium text-neutral-400">Price (₹)</label>
            <input id="price" type="number" value={price} onChange={e => setPrice(e.target.value)} className="w-full bg-[#2D2D2D] mt-1 text-white rounded-md p-2 border-transparent focus:ring-2 focus:ring-[#E6E6FA] focus:outline-none" required/>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="stock" className="text-sm font-medium text-neutral-400">Stock</label>
              <input id="stock" type="number" value={stock} onChange={e => setStock(e.target.value)} className="w-full bg-[#2D2D2D] mt-1 text-white rounded-md p-2 border-transparent focus:ring-2 focus:ring-[#E6E6FA] focus:outline-none" required/>
            </div>
            <div>
              <label htmlFor="unit" className="text-sm font-medium text-neutral-400">Unit</label>
              <input id="unit" type="text" value={stockUnit} onChange={e => setStockUnit(e.target.value)} className="w-full bg-[#2D2D2D] mt-1 text-white rounded-md p-2 border-transparent focus:ring-2 focus:ring-[#E6E6FA] focus:outline-none" />
            </div>
          </div>
          
          <div className="border-t border-[#2D2D2D] !my-6"></div>

          <button
              type="button"
              onClick={handleUpstockClick}
              disabled={lowStockItems.length === 0}
              title={lowStockItems.length === 0 ? "No low-stock items under 10 units" : `Send ${lowStockItems.length} low-stock item(s) to supplier`}
              className="w-full flex items-center p-3 bg-[#2D2D2D] rounded-lg text-left hover:bg-opacity-80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
              <span className="material-symbols-outlined w-6 h-6 mr-3 text-[#E6E6FA]">local_shipping</span>
              <div className="flex-1">
                  <span className="font-semibold text-neutral-200">Upstock</span>
                  <p className="text-xs text-neutral-400">
                      {lowStockItems.length > 0
                          ? `Send ${lowStockItems.length} low-stock item(s) to supplier`
                          : 'No items with low stock (< 10 units)'}
                  </p>
              </div>
              <span className="material-symbols-outlined text-neutral-400">chevron_right</span>
          </button>

          <div className="pt-2">
            <button type="submit" className="w-full bg-[#E6E6FA] text-black font-bold py-3 rounded-lg hover:opacity-90 transition-opacity active:scale-95 transform">
              {productToEdit ? 'Save Changes' : 'Add Product'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
};

export default ProductModal;