import React from 'react';

/**
 * The shell for pages a customer or a reviewer can open without signing in.
 *
 * Same surfaces as the consent page (black canvas, charcoal card, off-white
 * accent). The footer repeats on every public page so a reviewer who lands on
 * one can always reach the privacy policy, the terms, and support.
 */
const PublicShell: React.FC<{
  title: string;
  intro?: string;
  updated?: string;
  children: React.ReactNode;
}> = ({ title, intro, updated, children }) => (
  <main className="min-h-screen w-full bg-black px-4 py-8 text-white sm:py-12">
    <section className="mx-auto w-full max-w-2xl">
      <header className="mb-6 flex items-center gap-3">
        <a
          href="/"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E6E6FA] font-manrope text-xl font-extrabold text-black"
          aria-label="Dukaan home"
        >
          D
        </a>
        <div className="min-w-0">
          <a href="/" className="text-base font-bold leading-tight tracking-tight text-[#E6E6FA]">
            Dukaan.AI
          </a>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Order from the shop around the corner
          </p>
        </div>
      </header>

      <div className="rounded-2xl border border-neutral-800 bg-[#1A1A1A] p-5 sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
        {intro && <p className="mt-2 text-sm leading-relaxed text-neutral-400">{intro}</p>}
        {updated && <p className="mt-2 text-[11px] text-neutral-400">Last updated {updated}</p>}
        <div className="mt-5 space-y-5">{children}</div>
      </div>

      <nav className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-neutral-400">
        <a href="/privacy" className="hover:text-neutral-200">Privacy</a>
        <a href="/terms" className="hover:text-neutral-200">Terms</a>
        <a href="/support" className="hover:text-neutral-200">Support</a>
        <a href="/connect" className="hover:text-neutral-200">Connect an assistant</a>
      </nav>
    </section>
  </main>
);

export const PublicSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section>
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#E6E6FA]">{title}</h2>
    <div className="mt-2 space-y-2 text-sm leading-relaxed text-neutral-300">{children}</div>
  </section>
);

export default PublicShell;
