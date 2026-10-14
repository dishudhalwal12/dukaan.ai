
import React, { useState, useMemo, useRef } from 'react';
import { UnityDeal } from '../types.ts';
import { useLanguage } from '../contexts/LanguageContext.tsx';
import { XIcon } from './Icons.tsx';

const CONFETTI_COLORS = ['#E6E6FA', '#DDD6FE', '#F9FAFB', '#F3F4F6'];

const CardCelebrationEffect: React.FC = () => {
    const confettiPieces = useMemo(() => {
        return Array.from({ length: 30 }).map((_, i) => {
            const size = Math.random() * 8 + 5;
            const isCircle = Math.random() > 0.5;
            const style: React.CSSProperties = {
                position: 'absolute',
                width: `${size}px`,
                height: isCircle ? `${size}px` : `${size * 1.5}px`,
                backgroundColor: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
                borderRadius: isCircle ? '50%' : '2px',
                top: '50%',
                left: '50%',
                opacity: 0,
                transform: 'translate(-50%, -50%) rotate(0deg)',
                animation: `confetti-burst-${i} 700ms ease-out forwards`,
            };
            const angle = Math.random() * 360;
            const distance = Math.random() * 80 + 50;
            const endX = Math.cos(angle * (Math.PI / 180)) * distance;
            const endY = Math.sin(angle * (Math.PI / 180)) * distance;
            const rotation = Math.random() * 720 - 360;

            const keyframes = `
                @keyframes confetti-burst-${i} {
                    0% {
                        transform: translate(-50%, -50%) rotate(0deg) scale(0);
                        opacity: 1;
                    }
                    100% {
                        transform: translate(calc(-50% + ${endX}px), calc(-50% + ${endY}px)) rotate(${rotation}deg) scale(1);
                        opacity: 0;
                    }
                }
            `;
            return { style, keyframes };
        });
    }, []);

    return (
        <div className="absolute inset-0 overflow-visible pointer-events-none z-50">
            <style>
                {confettiPieces.map(p => p.keyframes).join('\n')}
            </style>
            {confettiPieces.map((p, i) => (
                <div key={i} style={p.style} />
            ))}
        </div>
    );
};


interface UnityDealCardProps {
    deal: UnityDeal;
    onJoin: (dealId: string, quantity: number) => void;
    isJoined: boolean;
    joinedQuantity: number;
}

const UnityDealCard: React.FC<UnityDealCardProps> = ({ deal, onJoin, isJoined, joinedQuantity }) => {
    const [quantity, setQuantity] = useState('');
    const [isCelebrating, setIsCelebrating] = useState(false);
    const { t } = useLanguage();

    const progress = (deal.currentQuantity / deal.targetQuantity) * 100;
    const isDealComplete = deal.currentQuantity >= deal.targetQuantity;

    const handleJoinClick = () => {
        const numQuantity = parseInt(quantity, 10);
        if (numQuantity > 0 && !isDealComplete) {
            const remainingQty = deal.targetQuantity - deal.currentQuantity;
            const qtyToAdd = Math.min(numQuantity, remainingQty);
            onJoin(deal.id, qtyToAdd);
            setQuantity('');
            
            setIsCelebrating(true);
            setTimeout(() => setIsCelebrating(false), 1000);
        }
    };
    
    const savingAmount = deal.retailPrice - deal.wholesalePrice;
    const numQuantity = parseInt(quantity, 10) || 0;
    const totalSavings = savingAmount * numQuantity;

    return (
        <div className="relative group bg-[#1A1A1A] rounded-2xl flex flex-col transition-all duration-300 shadow-2xl shadow-black/30 overflow-hidden border border-[#2D2D2D] hover:border-[#E6E6FA]/30 active:scale-[0.98] hover:scale-[1.02]">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#E6E6FA]/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            {isCelebrating && <CardCelebrationEffect />}
            
            <div className="p-4 flex flex-col gap-4 flex-1">
                <div className="flex-1">
                    <div className="flex justify-between items-start gap-2">
                        <h2 className="font-bold text-white text-xl leading-tight">{t(deal.productNameKey)}</h2>
                        {deal.tag && (
                            <div className="flex-shrink-0 px-2 py-0.5 text-xs font-bold rounded-full inline-block bg-[#E6E6FA]/20 text-[#E6E6FA]">
                                {deal.tag}
                            </div>
                        )}
                    </div>
                    
                    <div className="flex justify-between items-end mt-4">
                        <div>
                             <p className="text-xs text-[#E6E6FA] font-semibold uppercase tracking-wider">{t('unity_wholesale_price')}</p>
                             <p className="text-4xl font-extrabold text-white leading-none">
                                 <span className="text-2xl align-top">₹</span>{deal.wholesalePrice}
                             </p>
                        </div>
                        <div className="text-right">
                             <p className="text-xs text-neutral-500">{t('unity_retail_price')}</p>
                             <p className="text-lg font-semibold text-red-500 line-through">₹{deal.retailPrice}</p>
                        </div>
                    </div>

                    <div className="mt-3 inline-flex items-center gap-1.5 bg-[#E6E6FA]/20 text-[#E6E6FA] font-bold px-2.5 py-1 rounded-full text-sm">
                        <span className="material-symbols-outlined text-base">electric_bolt</span>
                        {t('unity_you_save', { amount: savingAmount })}
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-center mb-1.5 text-sm">
                        <p className="font-semibold text-neutral-300">
                            {t('unity_claim_progress', { claimed: deal.currentQuantity, total: deal.targetQuantity })}
                        </p>
                        <p className="font-medium text-neutral-400">{t('unity_participants', { count: deal.participants })}</p>
                    </div>
                    <div className="relative overflow-hidden w-full bg-white/10 rounded-full h-4 p-0.5">
                        <div className="bg-[#E6E6FA] h-full rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(230,230,250,0.6)]" style={{ width: `${progress}%` }}></div>
                         <div className="absolute top-0 left-0 w-full h-full animate-[sheen_2s_ease-in-out_infinite]">
                           <div className="w-1/2 h-full bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12"></div>
                        </div>
                    </div>
                </div>

                {isDealComplete ? (
                    <div className="flex flex-col items-center justify-center text-center p-3 bg-green-500/10 border-t-2 border-green-500/20 mt-2 rounded-lg">
                        <span className="material-symbols-outlined text-3xl text-green-400">verified</span>
                        <p className="font-bold text-lg text-green-300">{t('unity_deal_complete')}</p>
                        <p className="text-sm text-green-400/80">{t('unity_deal_complete_desc')}</p>
                    </div>
                ) : (
                    <div className="mt-2">
                         <div className="grid grid-cols-3 gap-0">
                            <div className="relative col-span-2">
                                <input 
                                    type="number" 
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    placeholder={t('unity_enter_quantity')}
                                    className="w-full h-full bg-[#2D2D2D] text-white rounded-l-lg p-3 pr-8 border-2 border-r-0 border-[#2D2D2D] focus:border-[#E6E6FA] focus:ring-0 focus:outline-none placeholder-neutral-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <div className="absolute inset-y-0 right-0 flex flex-col items-center justify-center w-8 text-neutral-500 pointer-events-none">
                                    <span className="material-symbols-outlined text-sm leading-none">arrow_drop_up</span>
                                    <span className="material-symbols-outlined text-sm leading-none -mt-1">arrow_drop_down</span>
                                </div>
                            </div>
                            <button 
                                onClick={handleJoinClick}
                                disabled={!quantity || numQuantity <= 0}
                                className="col-span-1 bg-[#E6E6FA] text-black font-bold py-3 px-2 rounded-r-lg hover:opacity-90 transition-all active:scale-95 transform disabled:opacity-50 disabled:bg-neutral-700 disabled:text-neutral-400 disabled:cursor-not-allowed h-full flex items-center justify-center"
                            >
                                {isJoined ? "Add" : t('unity_join')}
                            </button>
                        </div>
                        <div className="h-5 text-center pt-1 relative">
                            <div className={`absolute inset-x-0 top-1 transition-opacity duration-300 ${numQuantity > 0 ? 'opacity-100' : 'opacity-0'}`}>
                                <p className="text-xs font-semibold text-[#E6E6FA]">
                                    {t('unity_total_savings', { amount: totalSavings.toLocaleString('en-IN') })}
                                </p>
                            </div>
                            <div className={`absolute inset-x-0 top-1 transition-opacity duration-300 ${numQuantity <= 0 && isJoined ? 'opacity-100' : 'opacity-0'}`}>
                                <p className="text-xs font-semibold text-green-400">
                                    ✅ You're in for {joinedQuantity} {deal.stockUnit}.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

interface UnityModalProps {
    isOpen: boolean;
    onClose: () => void;
    deals: UnityDeal[];
    joinedDeals: Record<string, number>;
    onJoinDeal: (dealId: string, quantity: number) => void;
}

const UnityModal: React.FC<UnityModalProps> = ({ isOpen, onClose, deals, joinedDeals, onJoinDeal }) => {
    const { t } = useLanguage();
    const [selectedCategory, setSelectedCategory] = useState<string>('category_all');
    
    const categories = useMemo(() => {
        const uniqueCategories = [...new Set(deals.map(d => d.category))];
        return ['category_all', ...uniqueCategories];
    }, [deals]);

    const filteredDeals = useMemo(() => {
        if (selectedCategory === 'category_all') return deals;
        return deals.filter(d => d.category === selectedCategory);
    }, [deals, selectedCategory]);

    return (
        <>
            <div
                className={`fixed inset-0 bg-black bg-opacity-70 z-30 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
                aria-hidden="true"
            />
            <div
                className={`fixed bottom-0 left-0 right-0 max-w-sm mx-auto bg-black text-white rounded-t-2xl z-40 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="unity-modal-title"
            >
                <div className="p-6 pb-2 sticky top-0 bg-black/80 backdrop-blur-sm rounded-t-2xl z-10 border-b border-neutral-800">
                    <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-3xl text-[#E6E6FA]">groups</span>
                            <h3 id="unity-modal-title" className="text-2xl font-bold text-white">
                                {t('unity_title')}
                            </h3>
                        </div>
                        <button onClick={onClose} className="text-neutral-400 hover:text-white" aria-label="Close">
                            <XIcon className="w-6 h-6" />
                        </button>
                    </div>
                    <p className="text-neutral-400 text-sm mb-4">{t('unity_description')}</p>
                     <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-2 -mx-2 px-2">
                        {categories.map(category => (
                            <button
                                key={category}
                                onClick={() => setSelectedCategory(category)}
                                className={`flex-shrink-0 px-4 py-2 text-sm font-semibold rounded-full transition-all duration-200 border ${selectedCategory === category ? 'bg-[#E6E6FA] text-black border-transparent' : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700 hover:text-white'}`}
                            >
                                {t(category)}
                            </button>
                        ))}
                    </div>
                </div>
                
                <div className="max-h-[70vh] overflow-y-auto hide-scrollbar px-6 pb-6 space-y-4 pt-4">
                    {filteredDeals.map(deal => (
                        <UnityDealCard 
                            key={deal.id} 
                            deal={deal} 
                            onJoin={onJoinDeal}
                            isJoined={!!joinedDeals[deal.id]}
                            joinedQuantity={joinedDeals[deal.id] || 0}
                        />
                    ))}
                    {filteredDeals.length === 0 && (
                         <div className="text-center py-20 text-neutral-500">
                             <p className="font-semibold">No deals in this category.</p>
                         </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default UnityModal;
