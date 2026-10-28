import React from 'react';
import { BRAND, BRAND_COLOURS, BRAND_FONTS, LINE_HEIGHT, TYPE_SCALE } from '../../config/brand.ts';
import { LANGUAGES } from '../../data/languages.ts';

/**
 * The brand, on a screen, for the team.
 *
 * This screen is why the values live in `src/config/brand.ts`: it used to spell
 * the product name a second way, and it listed a neutral grey that fails
 * contrast on the surface it sat on. Everything below now reads the same
 * constants the app reads.
 */
const BrandGuideScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const colors = [
        { name: 'Ink', hex: BRAND_COLOURS.ink, className: 'bg-black text-white border border-neutral-800', use: 'Page background' },
        { name: 'Surface', hex: BRAND_COLOURS.surface, className: 'bg-[#1A1A1A] text-white border border-neutral-800', use: 'Cards, bars' },
        { name: 'Raised', hex: BRAND_COLOURS.surfaceRaised, className: 'bg-[#2D2D2D] text-white border border-neutral-800', use: 'Fields, chips' },
        { name: 'Accent', hex: BRAND_COLOURS.accent, className: 'bg-[#E6E6FA] text-black border border-transparent', use: 'Primary action, on dark only' },
        { name: 'Accent ink', hex: BRAND_COLOURS.accentInk, className: 'bg-[#3A3E98] text-white border border-transparent', use: 'Links on white pages' },
        { name: 'Muted text', hex: BRAND_COLOURS.textMuted, className: 'bg-[#969696] text-black border border-transparent', use: 'Lowest allowed text tone' },
        { name: 'Success', hex: BRAND_COLOURS.success, className: 'bg-green-400 text-black border border-transparent', use: 'Stock healthy, order paid' },
        { name: 'Danger', hex: BRAND_COLOURS.danger, className: 'bg-red-400 text-black border border-transparent', use: 'Refused, failed, cancelled' },
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
                            <img src="/brand/nukkad-glyph.svg" alt="" width={56} height={56} className="h-14 w-14 mb-4" />
                            <h1 className="text-4xl font-extrabold tracking-tight mb-2">{BRAND.wordmark}</h1>
                            <p className="text-neutral-400 text-sm">Primary wordmark</p>
                        </div>
                        <div className="p-8 bg-white rounded-2xl flex flex-col items-center justify-center">
                            <img src="/brand/nukkad-mark.svg" alt="" width={56} height={56} className="h-14 w-14 mb-4" />
                            <h1 className="text-4xl font-extrabold tracking-tight text-black mb-2">{BRAND.wordmark}</h1>
                            <p className="text-neutral-600 text-sm">Light background variant</p>
                        </div>
                        <div className="p-8 bg-[#1A1A1A] rounded-2xl flex flex-col items-center justify-center border border-neutral-800 md:col-span-2">
                            <p className="text-neutral-400 text-sm text-center">{BRAND.descriptor}</p>
                            <p className="mt-2 text-sm text-white text-center">{BRAND.tagline}</p>
                        </div>
                    </div>
                </section>

                {/* Color Palette */}
                <section className="space-y-6">
                    <h2 className="text-sm font-bold text-[#E6E6FA] uppercase tracking-wider">Color Palette</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                        {colors.map(color => (
                            <div key={color.name} className="flex flex-col">
                                <div className={`h-24 rounded-t-xl ${color.className}`}></div>
                                <div className="bg-[#1A1A1A] p-4 rounded-b-xl border-x border-b border-neutral-800">
                                    <p className="font-bold text-sm">{color.name}</p>
                                    <p className="text-neutral-400 text-xs font-mono mt-1">{color.hex}</p>
                                    <p className="text-neutral-400 text-xs mt-2 leading-relaxed">{color.use}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Typography */}
                <section className="space-y-6">
                    <h2 className="text-sm font-bold text-[#E6E6FA] uppercase tracking-wider">Typography</h2>
                    <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-neutral-800 space-y-8">
                        {TYPE_SCALE.map((type) => (
                            <div key={type.role} className="border-b border-neutral-800 pb-6 last:border-0 last:pb-0">
                                <p className="text-neutral-400 text-xs font-mono mb-2">{type.role}</p>
                                <p className={type.className}>
                                    {type.role === 'Number' ? '₹1,240.50' : type.role === 'Screen title' ? 'Recent orders' : 'The quick brown fox jumps over the lazy dog'}
                                </p>
                                <p className="text-neutral-400 text-xs mt-2 leading-relaxed">{type.use}</p>
                            </div>
                        ))}
                    </div>

                    {/* The six scripts Manrope cannot draw, in their own type. */}
                    <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-neutral-800">
                        <p className="text-neutral-400 text-xs font-mono mb-3">
                            {BRAND_FONTS.display} for Latin, then one Noto family per script. Leading {LINE_HEIGHT.latin} Latin, {LINE_HEIGHT.indic} for Indic.
                        </p>
                        <div className="space-y-3">
                            {LANGUAGES.map((language) => (
                                <div key={language.code} className="flex items-baseline justify-between gap-4 border-b border-neutral-800 pb-3 last:border-0 last:pb-0">
                                    <p
                                        lang={language.code}
                                        dir={language.direction}
                                        className="text-lg text-white"
                                    >
                                        {BRAND.wordmark} · {language.nativeName}
                                    </p>
                                    <p className="text-xs text-neutral-400 shrink-0">{language.name}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* UI Elements */}
                <section className="space-y-6">
                    <h2 className="text-sm font-bold text-[#E6E6FA] uppercase tracking-wider">UI Components</h2>
                    <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl p-6 space-y-6">
                        <div className="space-y-3">
                            <p className="text-neutral-400 text-sm">Primary button</p>
                            <button className="w-full bg-[#E6E6FA] text-black font-semibold py-3 rounded-full text-lg hover:bg-[#D8D8F0] transition-colors">
                                Primary action
                            </button>
                        </div>
                        <div className="space-y-3">
                            <p className="text-neutral-400 text-sm">Secondary button</p>
                            <button className="w-full bg-neutral-800 text-white font-semibold py-3 rounded-full text-lg border border-neutral-700 hover:bg-neutral-700 transition-colors">
                                Secondary action
                            </button>
                        </div>
                        <div className="space-y-3">
                            <p className="text-neutral-400 text-sm">Input field</p>
                            <input
                                type="text"
                                placeholder="Enter text here..."
                                className="w-full bg-black border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#E6E6FA] transition-colors"
                            />
                        </div>
                        <div className="space-y-3 pb-4">
                            <p className="text-neutral-400 text-sm">Card element</p>
                            <div className="bg-black border border-neutral-800 rounded-2xl p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-[#E6E6FA] rounded-full flex items-center justify-center">
                                        <span className="material-symbols-outlined text-black">inventory_2</span>
                                    </div>
                                    <div>
                                        <p className="font-bold text-white">Inventory item</p>
                                        <p className="text-sm text-neutral-400">120 in stock</p>
                                    </div>
                                </div>
                                <p className="font-bold text-[#E6E6FA] tabular">₹499</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Moodboard / Aesthetic Description */}
                <section className="space-y-6 pb-20">
                    <h2 className="text-sm font-bold text-[#E6E6FA] uppercase tracking-wider">Brand emotion</h2>
                    <div className="bg-gradient-to-br from-[#1A1A1A] to-black border border-neutral-800 rounded-2xl p-8 text-center relative overflow-hidden">
                        <div className="absolute top-[-50%] left-[-10%] w-[120%] h-[200%] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#E6E6FA]/5 via-transparent to-transparent pointer-events-none"></div>
                        <p className="text-2xl font-normal leading-relaxed text-white relative z-10">
                            "The corner where the neighbourhood already buys. Quiet, familiar, and open at any hour
                            because a message never sleeps. Nothing shouts: the shopkeeper is at work, and the numbers
                            are the only thing that should look sharp."
                        </p>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default BrandGuideScreen;
