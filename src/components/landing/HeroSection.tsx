/**
 * HeroSection Component
 *
 * Full viewport hero section for the landing page with:
 * - Headline and subheadline
 * - Primary and secondary CTA buttons
 * - Trust badges (Powered by Claude, AWS)
 * - Scroll indicator
 *
 * Requirements: 9.1, 12.4
 */

import type { SectionProps } from './types';

interface HeroSectionProps extends SectionProps {
  /** Callback when "Mulai Latihan Gratis" button is clicked */
  onStartPractice: () => void;
}

/**
 * Hero section with full viewport height, headline, CTAs, and trust indicators
 */
export function HeroSection({
  id,
  className,
  onStartPractice,
}: HeroSectionProps) {
  /**
   * Smooth scroll to next section when "Pelajari Lebih Lanjut" is clicked
   */
  const handleScrollToNextSection = () => {
    const heroElement = document.getElementById(id);
    if (heroElement) {
      const nextSection = heroElement.nextElementSibling;
      if (nextSection) {
        nextSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  return (
    <section
      id={id}
      className={`min-h-screen flex flex-col justify-center items-center relative px-4 py-16 bg-gradient-to-b from-surface to-surface-container ${className || ''}`}
    >
      {/* Main content container */}
      <div className="max-w-4xl mx-auto text-center space-y-8">
        {/* Headline */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-on-surface leading-tight">
          Latihan Interview Bahasa Inggris dengan{' '}
          <span className="text-primary">AI</span>
        </h1>

        {/* Subheadline / Value Proposition */}
        <p className="text-lg md:text-xl text-on-surface-variant max-w-2xl mx-auto leading-relaxed">
          Persiapkan interview kerja Anda dengan AI interviewer yang memberikan
          feedback real-time. Tingkatkan kepercayaan diri dan kemampuan bahasa
          Inggris Anda untuk karir impian.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
          {/* Primary CTA */}
          <button
            onClick={onStartPractice}
            className="w-full sm:w-auto px-8 py-4 bg-primary text-on-primary font-semibold rounded-full hover:bg-primary/90 transition-colors shadow-lg hover:shadow-xl text-lg"
          >
            Mulai Latihan Gratis
          </button>

          {/* Secondary CTA */}
          <button
            onClick={handleScrollToNextSection}
            className="w-full sm:w-auto px-8 py-4 bg-surface-container-high text-on-surface font-semibold rounded-full hover:bg-surface-container-highest transition-colors text-lg border border-outline-variant"
          >
            Pelajari Lebih Lanjut
          </button>
        </div>

        {/* Trust Badges */}
        <div className="pt-8 space-y-4">
          <p className="text-sm text-on-surface-variant">
            Dipercaya oleh profesional Indonesia
          </p>
          <div className="flex flex-wrap justify-center items-center gap-6">
            {/* Powered by Claude Badge */}
            <div className="flex items-center gap-2 px-4 py-2 bg-surface-container rounded-full">
              <span className="material-symbols-outlined text-primary text-xl">
                smart_toy
              </span>
              <span className="text-sm font-medium text-on-surface">
                Powered by Claude
              </span>
            </div>

            {/* AWS Badge */}
            <div className="flex items-center gap-2 px-4 py-2 bg-surface-container rounded-full">
              <span className="material-symbols-outlined text-tertiary text-xl">
                cloud
              </span>
              <span className="text-sm font-medium text-on-surface">
                AWS Infrastructure
              </span>
            </div>

            {/* Amazon Bedrock Badge */}
            <div className="flex items-center gap-2 px-4 py-2 bg-surface-container rounded-full">
              <span className="material-symbols-outlined text-secondary text-xl">
                psychology
              </span>
              <span className="text-sm font-medium text-on-surface">
                Amazon Bedrock
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
        <button
          onClick={handleScrollToNextSection}
          className="flex flex-col items-center gap-2 text-on-surface-variant hover:text-primary transition-colors"
          aria-label="Scroll ke bawah"
        >
          <span className="text-xs uppercase tracking-wider">Scroll</span>
          <span className="material-symbols-outlined text-3xl">
            keyboard_arrow_down
          </span>
        </button>
      </div>
    </section>
  );
}
