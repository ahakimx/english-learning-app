/**
 * HowItWorksSection component
 *
 * Displays a 4-step user journey with numbered badges, icons, titles, and descriptions.
 * Features visual connectors between steps on desktop and a CTA button at the end.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { HOW_IT_WORKS_STEPS } from './data';
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
      {/* Number badge */}
      <div className="relative mb-4">
        <div className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center text-lg font-bold shadow-md">
          {step.stepNumber}
        </div>
      </div>

      {/* Icon */}
      <div className="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center mb-4">
        <span className="material-symbols-outlined text-3xl text-primary">
          {step.icon}
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

/**
 * Visual connector/arrow between steps (desktop only)
 */
function StepConnector() {
  return (
    <div className="hidden md:flex items-center justify-center px-2 lg:px-4">
      <div className="flex items-center">
        {/* Dashed line */}
        <div className="w-8 lg:w-12 border-t-2 border-dashed border-outline-variant" />
        {/* Arrow head */}
        <span className="material-symbols-outlined text-outline-variant text-xl">
          chevron_right
        </span>
      </div>
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
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-on-surface mb-4">
            Bagaimana Cara Kerjanya?
          </h2>
          <p className="text-on-surface-variant text-base md:text-lg max-w-2xl mx-auto">
            Mulai perjalanan Anda menuju interview bahasa Inggris yang sukses dalam 4 langkah mudah
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

        {/* Desktop: Horizontal row with connectors */}
        <div className="hidden md:flex items-start justify-center">
          {HOW_IT_WORKS_STEPS.map((step, index) => (
            <div key={step.id} className="flex items-start">
              <StepCard step={step} />
              {/* Connector between steps (except after last) */}
              {index < HOW_IT_WORKS_STEPS.length - 1 && <StepConnector />}
            </div>
          ))}
        </div>

        {/* CTA button */}
        <div className="text-center mt-12 md:mt-16">
          <button
            onClick={onCTAClick}
            className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-on-primary font-semibold rounded-full hover:bg-primary/90 transition-colors shadow-md hover:shadow-lg"
          >
            Daftar Sekarang
            <span className="material-symbols-outlined text-xl">
              arrow_forward
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}

export default HowItWorksSection;
