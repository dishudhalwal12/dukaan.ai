import React from 'react';
import SettingsSubHeader from '../../components/SettingsSubHeader.tsx';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-3">
    <h2 className="text-sm font-bold text-[#E6E6FA] uppercase tracking-wider">{title}</h2>
    <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl p-5 space-y-3 text-sm text-neutral-300 leading-relaxed">
      {children}
    </div>
  </section>
);

const PrivacyPolicyScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  return (
    <div className="h-full bg-black text-white flex flex-col font-sans">
      <SettingsSubHeader title="Privacy Policy" onBack={onBack} />

      <div className="flex-1 overflow-y-auto p-5 space-y-8 pb-20">

        {/* Header Banner */}
        <div className="bg-gradient-to-br from-[#1A1A1A] to-black border border-neutral-800 rounded-2xl p-6 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(230,230,250,0.05),_transparent)] pointer-events-none" />
          <div className="w-14 h-14 bg-[#E6E6FA]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-[#E6E6FA] text-3xl">privacy_tip</span>
          </div>
          <h1 className="text-xl font-bold text-white mb-1">Dukan<span className="text-[#E6E6FA]">.AI</span> Privacy Policy</h1>
          <p className="text-xs text-neutral-500">Last updated: February 2026</p>
        </div>

        <Section title="Our Commitment">
          <p>
            Dukan.AI is built for small business owners across India. We believe your business data belongs to you — not us.
            This policy explains simply and clearly what we do (and don't do) with your information.
          </p>
        </Section>

        <Section title="What Data We Collect">
          <p className="font-semibold text-white">Information you provide:</p>
          <ul className="list-disc list-inside space-y-1 text-neutral-400 pl-1">
            <li>Your name and store name</li>
            <li>Store address and business category</li>
            <li>Products, inventory, and order records</li>
            <li>Onboarding answers (business context questions)</li>
            <li>Optional: email address if you create an account</li>
          </ul>
          <p className="font-semibold text-white mt-3">Automatically collected:</p>
          <ul className="list-disc list-inside space-y-1 text-neutral-400 pl-1">
            <li>None — we do not track usage analytics</li>
            <li>No advertising IDs or fingerprinting</li>
            <li>No cookies beyond what your browser requires</li>
          </ul>
        </Section>

        <Section title="How Your Data Is Stored">
          <p>
            All your data is stored <span className="text-white font-semibold">locally on your device</span> using your
            browser's localStorage. Nothing is sent to our servers unless you explicitly create an account
            and enable cloud sync.
          </p>
          <p className="text-neutral-400">
            If you enable cloud sync, your store profile is encrypted in transit and stored securely
            using Firebase (Google Cloud) with strict access controls. Only you can access your data.
          </p>
        </Section>

        <Section title="AI & Gemini API">
          <p>
            Dukan.AI uses Google's <span className="text-white font-semibold">Gemini AI</span> for:
          </p>
          <ul className="list-disc list-inside space-y-1 text-neutral-400 pl-1">
            <li>Generating personalised business insights</li>
            <li>Reading bill photos (OCR)</li>
            <li>Creating dynamic onboarding questions</li>
          </ul>
          <p className="text-neutral-400 mt-2">
            When AI features are used, minimal anonymised context (your business type and product names)
            may be sent to Google's Gemini API. This data is governed by{' '}
            <span className="text-[#E6E6FA]">Google's AI usage policies</span> and is not used to train models.
          </p>
        </Section>

        <Section title="Data Sharing">
          <p>
            We <span className="text-white font-semibold">do not sell, rent, or share</span> your personal data
            with any third parties for advertising or marketing purposes. Period.
          </p>
          <p className="text-neutral-400">
            The only third-party service we use is Firebase (for optional cloud sync) and Google Gemini
            (for AI features), both governed by Google's privacy policies.
          </p>
        </Section>

        <Section title="Your Rights">
          <ul className="list-disc list-inside space-y-1 text-neutral-400 pl-1">
            <li>Delete all your local data anytime by clearing browser storage</li>
            <li>Request deletion of your cloud account by contacting us</li>
            <li>Opt out of AI features (app works fully offline)</li>
            <li>Use the app as a guest with no account required</li>
          </ul>
        </Section>

        <Section title="Children's Privacy">
          <p className="text-neutral-400">
            Dukan.AI is designed for business owners aged 18 and above. We do not knowingly
            collect data from minors.
          </p>
        </Section>

        <Section title="Contact Us">
          <p>If you have any questions about this policy:</p>
          <div className="mt-2 space-y-2">
            <a
              href="mailto:support@dukan.ai"
              className="flex items-center gap-3 text-[#E6E6FA] font-semibold"
            >
              <span className="material-symbols-outlined text-lg">mail</span>
              support@dukan.ai
            </a>
          </div>
          <p className="text-neutral-500 text-xs mt-4">
            Dukan.AI is a product of Breeze'26 at Shiv Nadar University, supported by Masters' Union.
          </p>
        </Section>

      </div>
    </div>
  );
};

export default PrivacyPolicyScreen;
