/**
 * HowItWorksSection component
 *
 * Displays a 4-step user journey with numbered badges, icons, titles, and descriptions.
 * Features visual connectors between steps on desktop and a CTA button at the end.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { HOW_IT_WORKS_STEPS, PRIMARY_CTA_LABEL } from './data';
import type { SectionProps, HowItWorksStep } from './types';

interface HowItWorksSectionProps extends SectionProps {
  onCTAClick: () => void;
}

/**
 * Individual step card component
 */
function StepCard({ step }: { step: HowItWorksStep }) {
  return (
    <div className="flex flex-col items-center text-center">
      {/* Icon with number badge */}
      <div className="relative z-10 w-16 h-16 rounded-2xl bg-surface-container-lowest ring-1 ring-outline-variant/60 shadow-sm flex items-center justify-center mb-5">
        <span className="material-symbols-outlined text-3xl text-primary" aria-hidden="true">
          {step.icon}
        </span>
        <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-accent text-on-accent text-xs font-bold flex items-center justify-center">
          {step.stepNumber}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold text-on-surface mb-2">
        {step.title}
      </h3>

      {/* Description */}
      <p className="text-sm text-on-surface-variant leading-relaxed max-w-xs">
        {step.description}
      </p>
    </div>
  );
}

export function HowItWorksSection({
  id,
  className = '',
  onCTAClick,
}: HowItWorksSectionProps) {
  return (
    <section
      id={id}
      className={`py-16 md:py-24 bg-surface ${className}`}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section headline */}
        <div className="text-center mb-12 md:mb-16">
          <h2 className="font-headline text-3xl md:text-4xl font-bold text-on-surface mb-4">
            Bagaimana Cara Kerjanya?
          </h2>
          <p className="text-on-surface-variant text-base md:text-lg max-w-2xl mx-auto">
            Empat langkah sederhana, dari daftar sampai feedback pertama.
          </p>
        </div>

        {/* Steps layout */}
        {/* Mobile: Vertical stack */}
        <div className="md:hidden space-y-8">
          {HOW_IT_WORKS_STEPS.map((step, index) => (
            <div key={step.id}>
              <StepCard step={step} />
              {/* Vertical connector for mobile (except last) */}
              {index < HOW_IT_WORKS_STEPS.length - 1 && (
                <div className="flex justify-center mt-6">
                  <div className="flex flex-col items-center">
                    <div className="h-6 border-l-2 border-dashed border-outline-variant" />
                    <span className="material-symbols-outlined text-outline-variant text-lg">
                      keyboard_arrow_down
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Desktop: equal-width columns joined by a dashed line behind the icons */}
        <div className="hidden md:block relative max-w-5xl mx-auto">
          <div aria-hidden="true" className="absolute top-8 left-[12.5%] right-[12.5%] border-t-2 border-dashed border-outline-variant" />
          <div className="grid grid-cols-4 gap-6">
            {HOW_IT_WORKS_STEPS.map((step) => (
              <StepCard key={step.id} step={step} />
            ))}
          </div>
        </div>

        {/* CTA button */}
        <div className="text-center mt-12 md:mt-16">
          <button
            onClick={onCTAClick}
            className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-on-primary font-semibold rounded-full hover:bg-primary/90 transition-colors shadow-md hover:shadow-lg"
          >
            {PRIMARY_CTA_LABEL}
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              arrow_forward
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}

export default HowItWorksSection;
