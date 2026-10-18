
import React, { useState, useRef } from 'react';
import SettingsSubHeader from '../../components/SettingsSubHeader.tsx';
import { resizeImage } from '../../utils/image.ts';
import { useLanguage } from '../../contexts/LanguageContext.tsx';
import { saveBusinessProfileToCloud, saveLanguagePreferenceToCloud } from '../../services/cloudSync.ts';
import { languages } from './ChangeLanguageScreen.tsx';

const FormField: React.FC<{ label: string; type: string; value: string; placeholder?: string; disabled?: boolean; isVerified?: boolean; onChange: (value: string) => void }> = 
({ label, type, value, placeholder, disabled, isVerified, onChange }) => (
    <div>
        <label className="block text-sm font-medium text-neutral-400 mb-1.5 px-1">{label}</label>
        <div className="relative">
            <input 
                type={type}
                value={value}
                placeholder={placeholder}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-transparent border-b-2 border-neutral-600 text-white text-lg py-2 focus:outline-none focus:border-[#E6E6FA] placeholder-neutral-400 transition-colors duration-300 disabled:opacity-60"
            />
            {isVerified && (
                <div className="absolute inset-y-0 right-0 flex items-center text-xs text-blue-300 font-semibold">
                    <span className="material-symbols-outlined text-sm mr-1">verified</span>
                    Verified
                </div>
            )}
        </div>
    </div>
);

const EditProfileScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [name, setName] = useState(() => localStorage.getItem('dukan-profile-name') || '');
    const [email, setEmail] = useState(() => localStorage.getItem('dukan-profile-email') || '');
    const [profilePic, setProfilePic] = useState(() => localStorage.getItem('dukan-profile-pic') || null);
    const [isSaving, setIsSaving] = useState(false);
    const [isProcessingImage, setIsProcessingImage] = useState(false);
    const { language, setLanguage, t } = useLanguage();

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setIsProcessingImage(true);
            try {
                if (file.type === 'image/gif') {
                    // Bypass compression for GIFs to preserve animation layers
                    const base64Gif = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            if (e.target?.result && typeof e.target.result === 'string') {
                                resolve(e.target.result);
                            } else {
                                reject(new Error("Failed to read GIF file"));
                            }
                        };
                        reader.onerror = (e) => reject(e);
                        reader.readAsDataURL(file);
                    });
                    setProfilePic(base64Gif);
                } else {
                    const compressedImage = await resizeImage(file, 200, 200, 0.8);
                    setProfilePic(compressedImage);
                }
            } catch (error) {
                console.error("Failed to process image:", error);
                alert("There was an error processing your image. Please try another one.");
            } finally {
                setIsProcessingImage(false);
            }
        }
    };

    const handleEditPhotoClick = () => {
        if(isProcessingImage) return;
        fileInputRef.current?.click();
    };

    const handleSave = () => {
        setIsSaving(true);
        try {
            localStorage.setItem('dukan-profile-name', name);
            localStorage.setItem('dukan-profile-email', email);
            if (profilePic) {
                localStorage.setItem('dukan-profile-pic', profilePic);
            } else {
                localStorage.removeItem('dukan-profile-pic');
            }

            console.log('Saving profile:', { name, email, language });

            // Save language preference to Supabase cloud
            void saveLanguagePreferenceToCloud(language);

            // Mirror the name into the cloud profile so the greeting survives a
            // device change. Fire-and-forget: it never blocks the save.
            const storeName = localStorage.getItem('dukan-store-name');
            if (storeName) {
                const readJson = (key: string) => {
                    try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
                };
                saveBusinessProfileToCloud(storeName, {
                    storeDetails: {
                        storeName,
                        category: localStorage.getItem('dukan-store-category') || undefined,
                    },
                    answers: readJson('dukan-store-context'),
                    ownerName: name,
                    preferredLanguage: language,
                    timestamp: new Date().toISOString(),
                }, undefined, readJson('dukan-business-intelligence-context'));
            }
            // Simulate API call
            setTimeout(() => {
                setIsSaving(false);
                onBack(); // Go back after saving
            }, 1000);
        } catch (error) {
             if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
                alert("Error: Your device storage is full. Could not save profile picture.");
            } else {
                alert("An unexpected error occurred while saving.");
                console.error("Save failed:", error);
            }
            setIsSaving(false);
        }
    };

    return (
        <div>
            <SettingsSubHeader title={t('edit_profile_title')} onBack={onBack} onSave={handleSave} isSaving={isSaving} />
            <div className="p-4 space-y-8">
                <div className="flex flex-col items-center">
                    <div className="relative">
                        <div className="h-28 w-28 rounded-full bg-[#1A1A1A] flex items-center justify-center overflow-hidden">
                           {profilePic && !isProcessingImage && (
                               <img src={profilePic} alt="Profile" className="h-full w-full object-cover" />
                           )}
                           {!profilePic && !isProcessingImage && (
                               <span className="material-symbols-outlined text-7xl text-neutral-400">person</span>
                           )}
                           {isProcessingImage && (
                             <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                           )}
                        </div>
                        <button onClick={handleEditPhotoClick} className="absolute bottom-1 right-1 h-8 w-8 bg-[#E6E6FA] rounded-full flex items-center justify-center text-black">
                            <span className="material-symbols-outlined text-lg">edit</span>
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleImageChange}
                            accept="image/*"
                            className="hidden"
                        />
                    </div>
                </div>
                <div className="space-y-4">
                    <FormField label={t('label_full_name')} type="text" value={name} onChange={setName} placeholder={t('placeholder_your_full_name')} />
                    <FormField label={t('label_mobile_number')} type="tel" value="+91 98765 43210" onChange={() => {}} disabled isVerified />
                    <FormField label={t('label_email_address')} type="email" value={email} onChange={setEmail} placeholder={t('placeholder_your_email_address')} />

                    <div>
                        <label className="block text-sm font-medium text-neutral-400 mb-1.5 px-1">{t('settings_change_language') || 'Preferred Language'}</label>
                        <div className="relative">
                            <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                className="w-full bg-transparent border-b-2 border-neutral-600 text-white text-lg py-2 focus:outline-none focus:border-[#E6E6FA] transition-colors duration-300 appearance-none"
                                style={{
                                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23e6e6fa' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                                    backgroundRepeat: 'no-repeat',
                                    backgroundPosition: 'right 0.75rem center',
                                    backgroundSize: '1.5em 1.5em'
                                }}
                            >
                                {languages.map((lang) => (
                                    <option key={lang.code} className="bg-[#1A1A1A] text-white" value={lang.code}>
                                        {lang.name} ({lang.nativeName})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EditProfileScreen;