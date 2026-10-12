/**
 * FinalCTASection Component
 *
 * Prominent final conversion opportunity before the footer with:
 * - Distinct gradient background
 * - Compelling headline reinforcing value proposition
 * - Brief supporting text
 * - Primary CTA button
 *
 * Requirements: 9.4
 */

import type { SectionProps } from './types';

interface FinalCTASectionProps extends SectionProps {
  /** Callback when CTA button is clicked */
  onCTAClick: () => void;
}

/**
 * Final CTA section with distinct background and compelling call to action
 */
export function FinalCTASection({
  id,
  className,
  onCTAClick,
}: FinalCTASectionProps) {
  return (
    <section
      id={id}
      className={`relative py-20 md:py-28 px-4 bg-gradient-to-br from-primary via-primary/90 to-secondary overflow-hidden ${className || ''}`}
    >
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
      </div>

      {/* Content container */}
      <div className="max-w-4xl mx-auto text-center relative z-10 space-y-8">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm">
            <span className="material-symbols-outlined text-white text-3xl">
              rocket_launch
            </span>
          </div>
        </div>

        {/* Headline */}
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight">
          Siap Tingkatkan Kemampuan Interview Anda?
        </h2>

        {/* Supporting text */}
        <p className="text-lg md:text-xl text-white/90 max-w-2xl mx-auto leading-relaxed">
          Bergabung dengan ribuan profesional Indonesia yang sudah berlatih
          interview bahasa Inggris dengan AI. Mulai perjalanan Anda menuju karir
          impian sekarang.
        </p>

        {/* CTA Button */}
        <div className="pt-4">
          <button
            onClick={onCTAClick}
            className="inline-flex items-center gap-3 px-10 py-5 bg-white text-primary font-bold rounded-full hover:bg-white/90 transition-all shadow-2xl hover:shadow-xl hover:scale-105 text-lg"
          >
            <span>Mulai Latihan Gratis</span>
            <span className="material-symbols-outlined text-2xl">
              arrow_forward
            </span>
          </button>
        </div>

        {/* Trust indicator */}
        <p className="text-sm text-white/70 pt-4">
          <span className="material-symbols-outlined text-base align-middle mr-1">
            check_circle
          </span>
          Gratis selamanya untuk tier dasar • Tidak perlu kartu kredit
        </p>
      </div>
    </section>
  );
}
