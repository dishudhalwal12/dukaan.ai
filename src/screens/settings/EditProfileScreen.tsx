
import React, { useState, useRef } from 'react';
import SettingsSubHeader from '../../components/SettingsSubHeader.tsx';
import { resizeImage } from '../../utils/image.ts';
import { useLanguage } from '../../contexts/LanguageContext.tsx';
import { saveBusinessProfileToCloud } from '../../services/cloudSync.ts';
import type { User } from '../../services/auth.ts';

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

/**
 * Where this account's data actually lives, stated at the top of the profile.
 *
 * It sits above the fields on purpose: a shopkeeper who is testing the app wants
 * to know in one glance whether the catalogue they just edited is in the cloud or
 * only on this phone — not scroll to the bottom of Settings to find out.
 */
const SyncStatusCard: React.FC<{ currentUser?: User | null; onOpenAuth?: () => void }> = ({ currentUser, onOpenAuth }) => (
    currentUser ? (
        <div className="p-3.5 bg-emerald-950/20 border border-emerald-800/40 rounded-xl">
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <p className="text-xs text-emerald-400 font-semibold">Supabase Cloud Sync Active</p>
                </div>
                <span className="text-[10px] bg-emerald-900/60 text-emerald-300 px-2 py-0.5 rounded-full font-medium">Synced</span>
            </div>
            <p className="text-xs text-neutral-400 truncate">{currentUser.email || 'Google User'}</p>
        </div>
    ) : (
        <div className="p-3.5 bg-amber-950/20 border border-amber-800/40 rounded-xl">
            <div className="flex items-center space-x-2 mb-1">
                <span className="material-symbols-outlined text-amber-400 text-base">cloud_off</span>
                <p className="text-xs font-semibold text-amber-300">Guest Mode (Local Only)</p>
            </div>
            <p className="text-xs text-neutral-400 mb-2 leading-relaxed">
                This profile is saved on this phone only. Sign in to keep it in the cloud.
            </p>
            {onOpenAuth && (
                <button
                    onClick={onOpenAuth}
                    className="w-full py-2 px-3 bg-white text-gray-900 font-semibold rounded-lg text-xs hover:bg-neutral-100 transition-colors"
                >
                    Sign in to sync
                </button>
            )}
        </div>
    )
);

const EditProfileScreen: React.FC<{
    onBack: () => void;
    currentUser?: User | null;
    onOpenAuth?: () => void;
}> = ({ onBack, currentUser, onOpenAuth }) => {
    const [name, setName] = useState(() => localStorage.getItem('dukan-profile-name') || '');
    const [email, setEmail] = useState(() => localStorage.getItem('dukan-profile-email') || '');
    const [profilePic, setProfilePic] = useState(() => localStorage.getItem('dukan-profile-pic') || null);
    const [isSaving, setIsSaving] = useState(false);
    const [isProcessingImage, setIsProcessingImage] = useState(false);
    const { t } = useLanguage();

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

            console.log('Saving profile:', { name, email });

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
                <SyncStatusCard currentUser={currentUser} onOpenAuth={onOpenAuth} />
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
                </div>
            </div>
        </div>
    );
};

export default EditProfileScreen;