
import React, { useState, useEffect } from 'react';
import { XIcon } from '../components/Icons.tsx';
import EditProfileScreen from './settings/EditProfileScreen.tsx';
import ManageStoreScreen from './settings/ManageStoreScreen.tsx';
import NotificationsScreen from './settings/NotificationsScreen.tsx';
import ChangeLanguageScreen from './settings/ChangeLanguageScreen.tsx';
import BrandGuideScreen from './settings/BrandGuideScreen.tsx';
import PrivacyPolicyScreen from './settings/PrivacyPolicyScreen.tsx';
import HelpCenterScreen from './settings/HelpCenterScreen.tsx';
import { useLanguage } from '../contexts/LanguageContext.tsx';

const SettingsHeader: React.FC = () => {
    const { t } = useLanguage();
    return (
        <header className="flex items-center bg-gradient-to-b from-[#1A1A1A] to-black p-4 pb-2 justify-center sticky top-0 z-10">
            <h1 className="text-white text-xl font-bold tracking-tight">{t('settings_title')}</h1>
        </header>
    );
};

const ProfileSummary: React.FC = () => {
    const { t } = useLanguage();
    const name = localStorage.getItem('dukan-profile-name') || t('placeholder_your_name');
    const storeName = localStorage.getItem('dukan-store-name') || t('placeholder_store_name');
    const profilePic = localStorage.getItem('dukan-profile-pic');

    return (
        <div className="flex items-center gap-4 p-4">
            <div className="h-16 w-16 rounded-full bg-[#1A1A1A] flex items-center justify-center overflow-hidden">
                {profilePic ? (
                    <img src={profilePic} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                    <span className="material-symbols-outlined text-4xl text-neutral-400">person</span>
                )}
            </div>
            <div>
                <p className="text-xl font-bold text-white">{name}</p>
                <p className="text-sm text-neutral-400">{storeName}</p>
            </div>
        </div>
    );
}

interface SettingsItemProps {
    icon: string;
    label: string;
    onClick?: () => void;
}

const SettingsItem: React.FC<SettingsItemProps> = ({ icon, label, onClick }) => (
    <button onClick={onClick} className="w-full flex items-center justify-between p-4 bg-[#1A1A1A] rounded-lg text-left transition-colors active:bg-neutral-800">
        <div className="flex items-center gap-4">
            <span className="material-symbols-outlined text-neutral-300">{icon}</span>
            <p className="font-semibold text-white">{label}</p>
        </div>
        <span className="material-symbols-outlined text-neutral-500">chevron_right</span>
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
    
                <a href="tel:9256487182" className="flex flex-col items-center gap-2 text-neutral-200 hover:text-white transition-colors">
                    <div className="w-20 h-20 bg-[#2D2D2D] rounded-full flex items-center justify-center active:bg-neutral-600 transition-colors">
                        <span className="material-symbols-outlined text-4xl text-[#E6E6FA]">call</span>
                    </div>
                    <p className="font-semibold text-sm">Call Us</p>
                </a>
            </div>
          </div>
        </>
    );
};

const MainSettings: React.FC<{
  onNavigate: (screen: string) => void;
  onModalStateChange: (isOpen: boolean) => void;
  onLogout: () => void;
}> = ({ onNavigate, onModalStateChange, onLogout }) => {
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
          <ProfileSummary />
          <div className="p-4 space-y-4">
              <div>
                  <h3 className="text-neutral-400 text-sm font-bold uppercase tracking-wider px-2 pb-2">{t('settings_account')}</h3>
                  <div className="space-y-2">
                      <SettingsItem icon="account_circle" label={t('settings_edit_profile')} onClick={() => onNavigate('profile')} />
                      <SettingsItem icon="store" label={t('settings_manage_store')} onClick={() => onNavigate('store')} />
                      <SettingsItem icon="notifications" label={t('settings_notifications')} onClick={() => onNavigate('notifications')} />
                      <SettingsItem icon="language" label={t('settings_change_language')} onClick={() => onNavigate('language')} />
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
          <div className="p-4">
               <button
                onClick={onLogout}
                className="w-full flex items-center justify-center p-3 bg-[#1A1A1A] rounded-lg text-left transition-colors active:bg-neutral-800"
              >
                  <span className="material-symbols-outlined text-red-400 mr-2">logout</span>
                  <p className="font-semibold text-red-400">{t('settings_logout')}</p>
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
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({ onModalStateChange, onLogout }) => {
  const [activeSubScreen, setActiveSubScreen] = useState<string | null>(null);
  const [profileKey, setProfileKey] = useState(0);

  const renderContent = () => {
    const handleBack = () => {
        setActiveSubScreen(null);
        setProfileKey(k => k + 1); // Force re-mount of MainSettings to refresh profile info
    };

    switch(activeSubScreen) {
        case 'profile':
            return <EditProfileScreen onBack={handleBack} />;
        case 'store':
            return <ManageStoreScreen onBack={handleBack} />;
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
              />
            );
    }
  };

  return <>{renderContent()}</>;
};

export default SettingsScreen;
