import React, { useState, useEffect } from 'react';
import { XIcon, GoogleIcon } from '../components/Icons.tsx';
import type { User } from '../services/auth.ts';
import EditProfileScreen from './settings/EditProfileScreen.tsx';
import ManageStoreScreen from './settings/ManageStoreScreen.tsx';
import NotificationsScreen from './settings/NotificationsScreen.tsx';
import ChangeLanguageScreen from './settings/ChangeLanguageScreen.tsx';
import BrandGuideScreen from './settings/BrandGuideScreen.tsx';
import PrivacyPolicyScreen from './settings/PrivacyPolicyScreen.tsx';
import HelpCenterScreen from './settings/HelpCenterScreen.tsx';
import OnlineStoreScreen from './OnlineStoreScreen.tsx';
import { hasSupportWhatsApp, supportTelHref } from '../config/support.ts';
import { useLanguage } from '../contexts/LanguageContext.tsx';
import { resolveProfileImage } from '../utils/profileImage.ts';

const SettingsHeader: React.FC = () => {
    const { t } = useLanguage();
    return (
        <header className="flex items-center bg-gradient-to-b from-[#1A1A1A] to-black p-4 pb-2 justify-center sticky top-0 z-10">
            <h1 className="text-white text-xl font-bold tracking-tight">{t('settings_title')}</h1>
        </header>
    );
};

const ProfileCover: React.FC<{ currentUser?: User | null }> = ({ currentUser }) => {
    const { t } = useLanguage();
    const name = localStorage.getItem('dukan-profile-name') || t('placeholder_your_name');
    const storeName = localStorage.getItem('dukan-store-name') || t('placeholder_store_name');
    const profilePic = resolveProfileImage(currentUser, localStorage.getItem('dukan-profile-pic'));

    return (
        <div className="relative mx-4 mt-2 h-44 overflow-hidden rounded-2xl border border-white/10 bg-[#101012]">
            <video
                className="absolute inset-0 h-full w-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-hidden="true"
            >
                <source src="/banner.mp4" type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
            <div className="relative flex h-full items-end gap-3 p-4">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-white/80 bg-[#1A1A1A]">
                    <img src={profilePic} alt="Profile" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div className="min-w-0">
                    <p className="truncate text-lg font-bold leading-tight text-white">{name}</p>
                    <p className="truncate text-sm text-white/70">{storeName}</p>
                </div>
            </div>
        </div>
    );
}

interface SettingsItemProps {
    icon: string;
    label: string;
    onClick?: () => void;
    customIcon?: React.ReactNode;
}

const SettingsItem: React.FC<SettingsItemProps> = ({ icon, label, onClick, customIcon }) => (
    <button onClick={onClick} className="w-full flex items-center justify-between p-4 bg-[#1A1A1A] rounded-lg text-left transition-colors active:bg-neutral-800">
        <div className="flex items-center gap-4">
            {customIcon ? (
                customIcon
            ) : (
                <span className="material-symbols-outlined text-neutral-300">{icon}</span>
            )}
            <p className="font-semibold text-white">{label}</p>
        </div>
        <span className="material-symbols-outlined text-neutral-400">chevron_right</span>
    </button>
);

const ContactSupportModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
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
            aria-labelledby="contact-support-title"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h3 id="contact-support-title" className="text-lg font-bold text-white">Contact Support</h3>
              <button onClick={onClose} className="text-neutral-400 hover:text-white" aria-label="Close">
                <XIcon className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex justify-around items-center py-4">
                <a href="mailto:support@dukan.ai" className="flex flex-col items-center gap-2 text-neutral-200 hover:text-white transition-colors">
                    <div className="w-20 h-20 bg-[#2D2D2D] rounded-full flex items-center justify-center active:bg-neutral-600 transition-colors">
                        <span className="material-symbols-outlined text-4xl text-[#E6E6FA]">mail</span>
                    </div>
                    <p className="font-semibold text-sm">Email Us</p>
                </a>
    
                {hasSupportWhatsApp && (
                <a href={supportTelHref} className="flex flex-col items-center gap-2 text-neutral-200 hover:text-white transition-colors">
                    <div className="w-20 h-20 bg-[#2D2D2D] rounded-full flex items-center justify-center active:bg-neutral-600 transition-colors">
                        <span className="material-symbols-outlined text-4xl text-[#E6E6FA]">call</span>
                    </div>
                    <p className="font-semibold text-sm">Call Us</p>
                </a>
                )}
            </div>
          </div>
        </>
    );
};

const MainSettings: React.FC<{
  onNavigate: (screen: string) => void;
  onModalStateChange: (isOpen: boolean) => void;
  onLogout: () => void;
  currentUser?: User | null;
  onOpenAuth?: () => void;
  onStartWalkthrough?: () => void;
}> = ({ onNavigate, onModalStateChange, onLogout, currentUser, onOpenAuth, onStartWalkthrough }) => {
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    onModalStateChange(isContactModalOpen);
  }, [isContactModalOpen, onModalStateChange]);

  const handleContactSupport = () => {
    setIsContactModalOpen(true);
  };

  return (
    <>
      <div>
        <SettingsHeader />
        <div>
          <ProfileCover currentUser={currentUser} />
          <div className="p-4 space-y-4">
              <div>
                  <h3 className="text-neutral-400 text-sm font-bold uppercase tracking-wider px-2 pb-2">{t('settings_account')}</h3>
                  <div className="space-y-2">
                      <SettingsItem icon="account_circle" label={t('settings_edit_profile')} onClick={() => onNavigate('profile')} />
                      <SettingsItem icon="store" label={t('settings_manage_store')} onClick={() => onNavigate('store')} />
                      <SettingsItem icon="storefront" label="Online Store & AI Orders" onClick={() => onNavigate('onlineStore')} />
                      <SettingsItem icon="notifications" label={t('settings_notifications')} onClick={() => onNavigate('notifications')} />
                      <SettingsItem icon="language" label={t('settings_change_language')} onClick={() => onNavigate('language')} />
                  </div>
              </div>

              <div>
                  <h3 className="text-neutral-400 text-sm font-bold uppercase tracking-wider px-2 pb-2">{t('settings_walkthrough_section')}</h3>
                  <div className="space-y-2">
                      <SettingsItem 
                        icon="explore" 
                        label={t('settings_walkthrough')} 
                        onClick={onStartWalkthrough} 
                      />
                  </div>
              </div>

              <div>
                  <h3 className="text-neutral-400 text-sm font-bold uppercase tracking-wider px-2 pb-2">{t('settings_support')}</h3>
                   <div className="space-y-2">
                      <SettingsItem icon="help_outline" label={t('settings_help_center')} onClick={() => onNavigate('helpCenter')} />
                      <SettingsItem icon="support_agent" label={t('settings_contact_support')} onClick={handleContactSupport} />
                      <SettingsItem icon="privacy_tip" label={t('settings_privacy_policy')} onClick={() => onNavigate('privacy')} />
                      <SettingsItem icon="palette" label="Brand & Guidelines" onClick={() => onNavigate('brand')} />
                  </div>
              </div>
          </div>
          
          <div className="p-4 pt-0 space-y-3">
            {currentUser ? (
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
              <div className="p-4 bg-amber-950/20 border border-amber-800/40 rounded-xl">
                <div className="flex items-center space-x-2 mb-1">
                  <span className="material-symbols-outlined text-amber-400 text-base">cloud_off</span>
                  <p className="text-xs font-semibold text-amber-300">Guest Mode (Local Only)</p>
                </div>
                <p className="text-xs text-neutral-400 mb-3 leading-relaxed">
                  Your store is currently saved locally on this device. Sign in with Google to sync your catalog and orders into Supabase cloud.
                </p>
                {onOpenAuth && (
                  <button
                    onClick={onOpenAuth}
                    className="w-full py-2.5 px-3 bg-white text-gray-900 font-semibold rounded-lg text-xs flex items-center justify-center space-x-2 hover:bg-neutral-100 transition-colors shadow-sm"
                  >
                    <GoogleIcon className="w-4 h-4 flex-shrink-0" />
                    <span>Sync Store with Google</span>
                  </button>
                )}
              </div>
            )}

            <button
              onClick={onLogout}
              className="w-full flex items-center justify-center p-3 bg-[#1A1A1A] rounded-xl text-left transition-colors active:bg-neutral-800 border border-neutral-800"
            >
              <span className="material-symbols-outlined text-red-400 mr-2 text-lg">logout</span>
              <p className="font-semibold text-red-400 text-sm">{currentUser ? t('settings_logout') : 'Reset Session / Sign In'}</p>
            </button>
          </div>
        </div>
      </div>
      <ContactSupportModal isOpen={isContactModalOpen} onClose={() => setIsContactModalOpen(false)} />
    </>
  );
};

interface SettingsScreenProps {
  onModalStateChange: (isOpen: boolean) => void;
  onLogout: () => void;
  currentUser?: User | null;
  onOpenAuth?: () => void;
  onStartWalkthrough?: () => void;
  initialSubScreen?: string | null;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({ 
  onModalStateChange, 
  onLogout, 
  currentUser, 
  onOpenAuth,
  onStartWalkthrough,
  initialSubScreen = null,
}) => {
  const [activeSubScreen, setActiveSubScreen] = useState<string | null>(initialSubScreen);
  const [profileKey, setProfileKey] = useState(0);

  useEffect(() => {
    if (initialSubScreen !== undefined) {
      setActiveSubScreen(initialSubScreen);
    }
  }, [initialSubScreen]);

  const renderContent = () => {
    const handleBack = () => {
        setActiveSubScreen(null);
        setProfileKey(k => k + 1); // Force re-mount of MainSettings to refresh profile info
    };

    switch(activeSubScreen) {
        case 'profile':
            return <EditProfileScreen onBack={handleBack} currentUser={currentUser} onOpenAuth={onOpenAuth} />;
        case 'store':
            return <ManageStoreScreen onBack={handleBack} />;
        case 'onlineStore':
            return <OnlineStoreScreen onBack={handleBack} />;
        case 'notifications':
            return <NotificationsScreen onBack={handleBack} />;
        case 'language':
            return <ChangeLanguageScreen onBack={handleBack} />;
        case 'brand':
            return <BrandGuideScreen onBack={handleBack} />;
        case 'privacy':
            return <PrivacyPolicyScreen onBack={handleBack} />;
        case 'helpCenter':
            return <HelpCenterScreen onBack={handleBack} />;
        default:
            return (
              <MainSettings
                key={profileKey}
                onNavigate={setActiveSubScreen}
                onModalStateChange={onModalStateChange}
                onLogout={onLogout}
                currentUser={currentUser}
                onOpenAuth={onOpenAuth}
                onStartWalkthrough={onStartWalkthrough}
              />
            );
    }
  };

  return <>{renderContent()}</>;
};

export default SettingsScreen;
