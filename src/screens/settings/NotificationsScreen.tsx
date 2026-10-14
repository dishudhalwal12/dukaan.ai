
import React, { useState, useEffect } from 'react';
import SettingsSubHeader from '../../components/SettingsSubHeader.tsx';
import ToggleSwitch from '../../components/ToggleSwitch.tsx';
import { useLanguage } from '../../contexts/LanguageContext.tsx';

interface NotificationItemProps {
    id: string;
    label: string;
    description: string;
    initialState: boolean;
}

const NotificationItem: React.FC<NotificationItemProps> = ({ id, label, description, initialState }) => {
    const storageKey = `dukan-notif-${id}`;
    const [isEnabled, setIsEnabled] = useState(() => {
        const saved = localStorage.getItem(storageKey);
        return saved !== null ? JSON.parse(saved) : initialState;
    });

    useEffect(() => {
        localStorage.setItem(storageKey, JSON.stringify(isEnabled));
    }, [isEnabled, storageKey]);

    return (
        <div className="flex items-center justify-between p-4 bg-[#1A1A1A] rounded-lg">
            <div className="flex-1 pr-4">
                <p className="font-semibold text-white">{label}</p>
                <p className="text-sm text-neutral-400">{description}</p>
            </div>
            <ToggleSwitch id={id} checked={isEnabled} onChange={setIsEnabled} />
        </div>
    );
};


const NotificationsScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { t } = useLanguage();
    return (
        <div>
            <SettingsSubHeader title={t('notifications_title')} onBack={onBack} />
            <div className="p-4 space-y-3">
                <NotificationItem 
                    id="sales-alerts"
                    label="Sales Alerts"
                    description="Get notified about new sales."
                    initialState={true}
                />
                 <NotificationItem 
                    id="inventory-alerts"
                    label="Inventory Alerts"
                    description="Receive alerts for low-stock items."
                    initialState={true}
                />
                 <NotificationItem 
                    id="ai-insights"
                    label="AI Insights"
                    description="Weekly summary of AI-powered insights."
                    initialState={false}
                />
                 <NotificationItem 
                    id="promotions"
                    label="Dukan.AI News"
                    description="News and special promotions from us."
                    initialState={true}
                />
            </div>
        </div>
    );
};

export default NotificationsScreen;