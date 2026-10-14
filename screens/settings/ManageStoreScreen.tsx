
import React, { useState, useRef } from 'react';
import SettingsSubHeader from '../../components/SettingsSubHeader.tsx';
import { resizeImage } from '../../utils/image.ts';
import { useLanguage } from '../../contexts/LanguageContext.tsx';

const FormField: React.FC<{ label: string; value: string; onChange: (value: string) => void; placeholder?: string }> = 
({ label, value, onChange, placeholder }) => (
    <div>
        <label className="block text-sm font-medium text-neutral-400 mb-1.5 px-1">{label}</label>
        <input 
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-transparent border-b-2 border-neutral-600 text-white text-lg py-2 focus:outline-none focus:border-[#E6E6FA] placeholder-neutral-400 transition-colors duration-300"
        />
    </div>
);

const ManageStoreScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [storeName, setStoreName] = useState(() => localStorage.getItem('dukan-store-name') || "");
    const [address, setAddress] = useState(() => localStorage.getItem('dukan-store-address') || "");
    const [category, setCategory] = useState(() => localStorage.getItem('dukan-store-category') || "");
    const [storeBanner, setStoreBanner] = useState(() => localStorage.getItem('dukan-store-banner') || null);
    
    const [supplierName, setSupplierName] = useState(() => localStorage.getItem('dukan-supplier-name') || '');
    const [supplierWhatsapp, setSupplierWhatsapp] = useState(() => localStorage.getItem('dukan-supplier-whatsapp-display') || '');

    const [isSaving, setIsSaving] = useState(false);
    const [isProcessingImage, setIsProcessingImage] = useState(false);
    const { t } = useLanguage();
    
    const bannerInputRef = useRef<HTMLInputElement>(null);

    const handleBannerChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setIsProcessingImage(true);
            try {
                const compressedImage = await resizeImage(file, 800, 400, 0.8);
                setStoreBanner(compressedImage);
            } catch (error) {
                console.error("Failed to process image:", error);
                alert("There was an error processing your banner image. Please try another one.");
            } finally {
                setIsProcessingImage(false);
            }
        }
    };

    const handleUploadBannerClick = () => {
        if(isProcessingImage) return;
        bannerInputRef.current?.click();
    };

    const handleSave = () => {
        setIsSaving(true);
        try {
            localStorage.setItem('dukan-store-name', storeName);
            localStorage.setItem('dukan-store-address', address);
            localStorage.setItem('dukan-store-category', category);
            if (storeBanner) {
                localStorage.setItem('dukan-store-banner', storeBanner);
            } else {
                localStorage.removeItem('dukan-store-banner');
            }

            // Save supplier details
            const whatsappDigits = supplierWhatsapp.replace(/[^0-9]/g, '');
            localStorage.setItem('dukan-supplier-name', supplierName);
            localStorage.setItem('dukan-supplier-whatsapp', whatsappDigits);
            localStorage.setItem('dukan-supplier-whatsapp-display', supplierWhatsapp); // Save display version too

            console.log('Saving store details:', { storeName, address, category, supplierName, supplierWhatsapp });
            setTimeout(() => {
                setIsSaving(false);
                onBack();
            }, 1000);
        } catch (error) {
            if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
                alert("Error: Your device storage is full. Could not save store banner.");
            } else {
                alert("An unexpected error occurred while saving.");
                console.error("Save failed:", error);
            }
            setIsSaving(false);
        }
    };

    const handleCopyUrl = () => {
        navigator.clipboard.writeText("sunil-kirana.dukan.ai");
        alert("Store URL copied to clipboard!");
    }

    return (
        <div>
            <SettingsSubHeader title={t('manage_store_title')} onBack={onBack} onSave={handleSave} isSaving={isSaving} />
            <div className="p-4 space-y-6">
                <div className="flex flex-col items-center">
                    <button onClick={handleUploadBannerClick} className="relative w-full h-32 bg-[#1A1A1A] rounded-lg flex items-center justify-center overflow-hidden text-neutral-400 hover:bg-[#2D2D2D] transition-colors">
                        {storeBanner && !isProcessingImage && (
                            <img src={storeBanner} alt="Store Banner" className="h-full w-full object-cover" />
                        )}
                        {!storeBanner && !isProcessingImage && (
                            <div className="text-center">
                                <span className="material-symbols-outlined text-5xl">add_a_photo</span>
                                <p className="text-sm font-semibold">{t('manage_store_upload_banner')}</p>
                            </div>
                        )}
                        {isProcessingImage && (
                           <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                        )}
                         <div className="absolute bottom-2 right-2 h-8 w-8 bg-[#E6E6FA] rounded-full flex items-center justify-center text-black pointer-events-none">
                            <span className="material-symbols-outlined text-lg">edit</span>
                        </div>
                    </button>
                     <input
                        type="file"
                        ref={bannerInputRef}
                        onChange={handleBannerChange}
                        accept="image/*"
                        className="hidden"
                    />
                </div>

                <div className="space-y-4">
                    <FormField label={t('label_store_name')} value={storeName} onChange={setStoreName} placeholder={t('placeholder_store_name_example')} />
                    <FormField label={t('label_store_address')} value={address} onChange={setAddress} placeholder={t('placeholder_store_address_example')} />
                    <FormField label={t('label_store_category')} value={category} onChange={setCategory} placeholder={t('placeholder_store_category_example')} />

                    <div>
                        <label className="block text-sm font-medium text-neutral-400 mb-1.5 px-1">{t('label_online_store_url')}</label>
                        <div className="relative">
                            <input 
                                type="text"
                                value="sunil-kirana.dukan.ai"
                                readOnly
                                className="w-full bg-transparent border-b-2 border-neutral-600 text-neutral-300 text-lg py-2 pr-12"
                            />
                            <button onClick={handleCopyUrl} className="absolute inset-y-0 right-0 flex items-center justify-center w-12 text-[#E6E6FA]">
                                <span className="material-symbols-outlined">content_copy</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="border-t border-[#2D2D2D] my-4"></div>

                <div className="space-y-4">
                    <h3 className="text-lg font-bold text-white px-1">{t('manage_store_supplier_details_title')}</h3>
                     <FormField label={t('label_supplier_name')} value={supplierName} onChange={setSupplierName} placeholder={t('placeholder_supplier_name_example')} />
                     <div>
                        <label className="block text-sm font-medium text-neutral-400 mb-1.5 px-1">{t('label_supplier_whatsapp')}</label>
                        <input 
                            type="tel"
                            value={supplierWhatsapp}
                            placeholder="+91 9876543210"
                            onChange={(e) => setSupplierWhatsapp(e.target.value)}
                            className="w-full bg-transparent border-b-2 border-neutral-600 text-white text-lg py-2 focus:outline-none focus:border-[#E6E6FA] placeholder-neutral-400 transition-colors duration-300"
                        />
                        <p className="text-xs text-neutral-500 mt-1.5 px-1">{t('manage_store_whatsapp_hint')}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ManageStoreScreen;