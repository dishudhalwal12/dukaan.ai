import React from 'react';

const BrandGuideScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const colors = [
        { name: 'Pitch Black', hex: '#000000', class: 'bg-black text-white border border-neutral-800' },
        { name: 'Brand Dark', hex: '#1A1A1A', class: 'bg-[#1A1A1A] text-white border border-neutral-800' },
        { name: 'Lavender Accent', hex: '#E6E6FA', class: 'bg-[#E6E6FA] text-black border border-transparent' },
        { name: 'Neutral Gray', hex: '#737373', class: 'bg-neutral-500 text-white border border-transparent' },
        { name: 'Success Green', hex: '#4ADE80', class: 'bg-green-400 text-black border border-transparent' },
        { name: 'Danger Red', hex: '#F87171', class: 'bg-red-400 text-black border border-transparent' },
    ];

    const typography = [
        { name: 'Display Headline', font: 'font-manrope font-extrabold text-4xl', sample: 'Empower Your Store' },
        { name: 'Section Heading', font: 'font-manrope font-bold text-2xl', sample: 'Recent Orders' },
        { name: 'Subheading', font: 'font-sans font-semibold text-xl', sample: 'Manage Inventory' },
        { name: 'Body Text', font: 'font-sans font-normal text-base text-neutral-300', sample: 'The quick brown fox jumps over the lazy dog. Building modern commerce experiences.' },
        { name: 'Small Text', font: 'font-sans font-medium text-sm text-neutral-400', sample: 'Updated 2 mins ago' },
    ];

    return (
        <div className="h-full bg-black text-white flex flex-col font-sans">
            <header className="flex items-center bg-[#1A1A1A] p-4 sticky top-0 z-10 border-b border-neutral-800">
                <button onClick={onBack} className="flex items-center justify-center w-10 h-10 rounded-full bg-black active:bg-neutral-800 transition-colors mr-4" aria-label="Go back">
                    <span className="material-symbols-outlined text-white">arrow_back</span>
                </button>
                <h1 className="text-xl font-bold tracking-tight">Brand & Guidelines</h1>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-12">
                {/* Logo & Identity */}
                <section className="space-y-6">
                    <h2 className="text-sm font-bold text-[#E6E6FA] uppercase tracking-wider">Logo & Identity</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-8 bg-[#1A1A1A] rounded-2xl flex flex-col items-center justify-center border border-neutral-800">
                            <h1 className="text-4xl font-extrabold tracking-tighter mb-2">Dukan<span className="text-[#E6E6FA]">.AI</span></h1>
                            <p className="text-neutral-400 text-sm">Primary Wordmark</p>
                        </div>
                        <div className="p-8 bg-white rounded-2xl flex flex-col items-center justify-center">
                            <h1 className="text-4xl font-extrabold tracking-tighter text-black mb-2">Dukan<span className="text-violet-600">.AI</span></h1>
                            <p className="text-neutral-500 text-sm">Light Background Variant</p>
                        </div>
                        <div className="p-8 bg-[#1A1A1A] rounded-2xl flex flex-col items-center justify-center border border-neutral-800">
                            <div className="w-16 h-16 bg-[#E6E6FA] rounded-2xl flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(230,230,250,0.3)]">
                                <span className="material-symbols-outlined text-black text-3xl">storefront</span>
                            </div>
                            <p className="text-neutral-400 text-sm">App Icon / Logomark</p>
                        </div>
                    </div>
                </section>

                {/* Color Palette */}
                <section className="space-y-6">
                    <h2 className="text-sm font-bold text-[#E6E6FA] uppercase tracking-wider">Color Palette</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                        {colors.map(color => (
                            <div key={color.name} className="flex flex-col">
                                <div className={`h-24 rounded-t-xl ${color.class}`}></div>
                                <div className="bg-[#1A1A1A] p-4 rounded-b-xl border-x border-b border-neutral-800">
                                    <p className="font-bold text-sm">{color.name}</p>
                                    <p className="text-neutral-400 text-xs font-mono mt-1">{color.hex}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Typography */}
                <section className="space-y-6">
                    <h2 className="text-sm font-bold text-[#E6E6FA] uppercase tracking-wider">Typography</h2>
                    <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-neutral-800 space-y-8">
                        {typography.map(type => (
                            <div key={type.name} className="border-b border-neutral-800 pb-6 last:border-0 last:pb-0">
                                <p className="text-neutral-400 text-xs font-mono mb-2">{type.font}</p>
                                <p className={type.font}>{type.sample}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* UI Elements */}
                <section className="space-y-6">
                    <h2 className="text-sm font-bold text-[#E6E6FA] uppercase tracking-wider">UI Components</h2>
                    <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl p-6 space-y-6">
                        <div className="space-y-3">
                            <p className="text-neutral-400 text-sm">Primary Button</p>
                            <button className="w-full bg-[#E6E6FA] text-black font-semibold py-3 rounded-full text-lg hover:bg-opacity-90 transition-opacity">
                                Primary Action
                            </button>
                        </div>
                        <div className="space-y-3">
                            <p className="text-neutral-400 text-sm">Secondary Button</p>
                            <button className="w-full bg-neutral-800 text-white font-semibold py-3 rounded-full text-lg border border-neutral-700 hover:bg-neutral-700 transition-colors">
                                Secondary Action
                            </button>
                        </div>
                        <div className="space-y-3">
                            <p className="text-neutral-400 text-sm">Input Field</p>
                            <input 
                                type="text" 
                                placeholder="Enter text here..." 
                                className="w-full bg-black border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#E6E6FA] transition-colors"
                            />
                        </div>
                        <div className="space-y-3 pb-4">
                            <p className="text-neutral-400 text-sm">Card Element</p>
                            <div className="bg-black border border-neutral-800 rounded-2xl p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-[#E6E6FA] rounded-full flex items-center justify-center">
                                        <span className="material-symbols-outlined text-black">inventory_2</span>
                                    </div>
                                    <div>
                                        <p className="font-bold text-white">Inventory Item</p>
                                        <p className="text-sm text-neutral-400">120 in stock</p>
                                    </div>
                                </div>
                                <p className="font-bold text-[#E6E6FA]">₹499</p>
                            </div>
                        </div>
                    </div>
                </section>
                
                {/* Moodboard / Aesthetic Description */}
                <section className="space-y-6 pb-20">
                    <h2 className="text-sm font-bold text-[#E6E6FA] uppercase tracking-wider">Brand Emotion</h2>
                    <div className="bg-gradient-to-br from-[#1A1A1A] to-black border border-neutral-800 rounded-2xl p-8 text-center relative overflow-hidden">
                        <div className="absolute top-[-50%] left-[-10%] w-[120%] h-[200%] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#E6E6FA]/5 via-transparent to-transparent pointer-events-none"></div>
                        <p className="text-2xl font-normal leading-relaxed text-white relative z-10 italic">
                            "Empowering local businesses with a sleek, minimalist, and ultra-premium digital presence. No clutter, just conversion-focused design with a touch of organic luxury."
                        </p>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default BrandGuideScreen;
