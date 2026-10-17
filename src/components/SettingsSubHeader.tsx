import React from 'react';
import { useLanguage } from '../contexts/LanguageContext.tsx';

interface SettingsSubHeaderProps {
    title: string;
    onBack: () => void;
    onSave?: () => void;
    isSaving?: boolean;
}

const SettingsSubHeader: React.FC<SettingsSubHeaderProps> = ({ title, onBack, onSave, isSaving }) => {
    const { t } = useLanguage();
    return (
        <header className="sticky top-0 z-10 flex items-center justify-between bg-gradient-to-b from-[#1A1A1A] to-black p-4 pb-2">
            <div className="flex w-16 items-center justify-start">
                <button onClick={onBack} className="flex h-10 w-10 cursor-pointer items-center justify-center text-white">
                    <span className="material-symbols-outlined text-2xl">arrow_back_ios_new</span>
                </button>
            </div>
            <h1 className="flex-1 text-center text-xl font-bold tracking-tight text-white">{title}</h1>
            <div className="flex w-16 items-center justify-end">
                {onSave && (
                    <button 
                        onClick={onSave}
                        disabled={isSaving}
                        className="px-4 py-1.5 text-base font-bold text-black bg-[#E6E6FA] rounded-full disabled:opacity-50 transition-opacity"
                    >
                        {isSaving ? '...' : t('button_save')}
                    </button>
                )}
            </div>
      </header>
    );
};

export default SettingsSubHeader;