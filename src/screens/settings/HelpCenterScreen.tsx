import React, { useState } from 'react';
import SettingsSubHeader from '../../components/SettingsSubHeader.tsx';

interface FAQItem {
  question: string;
  answer: string;
  icon: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    icon: 'add_shopping_cart',
    question: 'How do I add a new order manually?',
    answer:
      'Tap the + button on the Dashboard. You can upload a photo of a bill (AI reads it automatically), paste a WhatsApp order message, or import a CSV file. All methods auto-populate your sales records.',
  },
  {
    icon: 'inventory_2',
    question: 'How do I add or edit products?',
    answer:
      'Go to the Catalog tab (or Services / Menu / Medicines depending on your store type). Tap any product to edit it, or use the + button at the bottom to add a new one. Stock levels update automatically when orders are accepted.',
  },
  {
    icon: 'auto_awesome',
    question: 'How do AI insights work?',
    answer:
      'Dukan.AI analyses your inventory and sales data using Google Gemini to generate 5 actionable insights daily. Tap the sync icon on the Dashboard to refresh them anytime. Insights are tailored to your specific business type.',
  },
  {
    icon: 'receipt_long',
    question: 'How do I accept or reject an incoming order?',
    answer:
      'When a new order arrives, a pop-up appears from the bottom. Swipe the white handle to the right to accept. Tap "Decline" to reject it. Orders auto-expire after 60 seconds if no action is taken.',
  },
  {
    icon: 'language',
    question: 'How do I change the app language?',
    answer:
      'Go to Settings → Change Language. Dukan.AI supports English, Hindi, Gujarati, Tamil, Punjabi, Kannada, and Urdu. All app text adapts immediately after selection.',
  },
  {
    icon: 'cloud_sync',
    question: 'How do I sync my data to the cloud?',
    answer:
      'Go to Settings and sign in with your email to enable cloud sync. Your store profile is securely backed up to Firebase. Guest mode keeps all data local on your device only.',
  },
  {
    icon: 'storefront',
    question: 'What is Dukan.AI?',
    answer:
      'Dukan.AI is an AI-Adaptive Commerce OS — one app that transforms to fit your business type. Whether you run a Kirana store, Salon, Restaurant, or Chemist, Dukan.AI adapts its interface, labels, and AI advice to suit your specific context.',
  },
  {
    icon: 'bar_chart',
    question: 'Where can I see my earnings and sales history?',
    answer:
      'The Sales tab shows a full breakdown of your revenue — by day, week, and month. The Dashboard shows today\'s and this month\'s totals at a glance.',
  },
  {
    icon: 'photo_camera',
    question: 'Can the AI read handwritten bills?',
    answer:
      'Yes! The AI (powered by Gemini Vision) can read printed and reasonably clear handwritten bills. For best results, ensure good lighting and capture the full bill in frame.',
  },
  {
    icon: 'delete_forever',
    question: 'How do I reset or clear all my data?',
    answer:
      'Clear your browser\'s localStorage through your browser settings (Settings → Privacy → Clear browsing data → Cached data and cookies). This will reset the app completely. Note: this action cannot be undone.',
  },
];

const FAQCard: React.FC<{ item: FAQItem }> = ({ item }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <button
      onClick={() => setIsOpen(o => !o)}
      className="w-full text-left bg-[#1A1A1A] border border-neutral-800 rounded-2xl overflow-hidden transition-colors active:bg-neutral-900"
    >
      <div className="flex items-center gap-4 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E6E6FA]/10">
          <span className="material-symbols-outlined text-[#E6E6FA] text-lg">{item.icon}</span>
        </div>
        <p className="flex-1 font-semibold text-white text-sm leading-snug">{item.question}</p>
        <span
          className={`material-symbols-outlined text-neutral-500 text-lg shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        >
          expand_more
        </span>
      </div>
      {isOpen && (
        <div className="px-5 pb-5 pt-0 border-t border-neutral-800">
          <p className="text-sm text-neutral-400 leading-relaxed mt-3">{item.answer}</p>
        </div>
      )}
    </button>
  );
};

const HelpCenterScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  return (
    <div className="h-full bg-black text-white flex flex-col font-sans">
      <SettingsSubHeader title="Help Center" onBack={onBack} />

      <div className="flex-1 overflow-y-auto p-5 space-y-8 pb-20">

        {/* Hero */}
        <div className="bg-gradient-to-br from-[#1A1A1A] to-black border border-neutral-800 rounded-2xl p-6 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(230,230,250,0.05),_transparent)] pointer-events-none" />
          <div className="w-14 h-14 bg-[#E6E6FA]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-[#E6E6FA] text-3xl">help_outline</span>
          </div>
          <h1 className="text-xl font-bold text-white mb-1">How can we help?</h1>
          <p className="text-xs text-neutral-500">Find answers to common questions below</p>
        </div>

        {/* FAQ */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold text-[#E6E6FA] uppercase tracking-wider px-1">
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item, i) => (
              <FAQCard key={i} item={item} />
            ))}
          </div>
        </section>

        {/* Contact */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-[#E6E6FA] uppercase tracking-wider px-1">Still need help?</h2>
          <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl p-5 space-y-4">
            <p className="text-sm text-neutral-400">
              Our support team is happy to help. Reach out through any of the channels below.
            </p>
            <a
              href="mailto:support@dukan.ai"
              className="flex items-center gap-4 p-3 bg-black rounded-xl active:bg-neutral-900 transition-colors"
            >
              <div className="w-10 h-10 bg-[#E6E6FA]/10 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-[#E6E6FA]">mail</span>
              </div>
              <div>
                <p className="font-semibold text-white text-sm">Email Support</p>
                <p className="text-xs text-neutral-400">support@dukan.ai</p>
              </div>
              <span className="material-symbols-outlined text-neutral-600 ml-auto">chevron_right</span>
            </a>
            <a
              href="tel:9256487182"
              className="flex items-center gap-4 p-3 bg-black rounded-xl active:bg-neutral-900 transition-colors"
            >
              <div className="w-10 h-10 bg-[#E6E6FA]/10 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-[#E6E6FA]">call</span>
              </div>
              <div>
                <p className="font-semibold text-white text-sm">Call Us</p>
                <p className="text-xs text-neutral-400">+91 92564 87182</p>
              </div>
              <span className="material-symbols-outlined text-neutral-600 ml-auto">chevron_right</span>
            </a>
          </div>
        </section>

        <p className="text-center text-xs text-neutral-600 pb-4">
          Dukan<span className="text-[#E6E6FA]/40">.AI</span> · Breeze'26 · Shiv Nadar University
        </p>
      </div>
    </div>
  );
};

export default HelpCenterScreen;
