/**
 * ComparisonSection Component
 *
 * Displays differentiating features that contrast AI-powered feedback
 * with traditional interview preparation methods.
 *
 * Features:
 * - 4+ differentiating features
 * - Checkmark icons for advantages
 * - Visual emphasis for highlighted items
 * - Focus on Indonesian language support
 * - No competitor names mentioned
 * - Responsive layout: 1-2 columns mobile, 2-4 on desktop
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { DIFFERENTIATORS } from './data';
import type { SectionProps, Differentiator } from './types';

interface ComparisonSectionProps extends SectionProps {
  /** Optional differentiators override - defaults to DIFFERENTIATORS */
  differentiators?: Differentiator[];
}

/**
 * Individual differentiator card component
 */
function DifferentiatorCard({
  differentiator,
}: {
  differentiator: Differentiator;
}) {
  const isHighlighted = differentiator.highlight === true;

  return (
    <div
      className={`relative flex flex-col p-6 rounded-2xl transition-all duration-200 ${
        isHighlighted
          ? 'bg-primary-container border-2 border-primary shadow-lg'
          : 'bg-surface-container hover:bg-surface-container-high'
      }`}
    >
      {/* Highlight badge */}
      {isHighlighted && (
        <div className="absolute -top-3 left-4 bg-primary text-on-primary text-xs font-semibold px-3 py-1 rounded-full">
          Keunggulan Utama
        </div>
      )}

      {/* Icon */}
      <div
        className={`w-12 h-12 flex items-center justify-center rounded-xl mb-4 ${
          isHighlighted ? 'bg-primary text-on-primary' : 'bg-primary/10 text-primary'
        }`}
      >
        <span className="material-symbols-outlined text-2xl">
          {differentiator.icon}
        </span>
      </div>

      {/* Title with checkmark */}
      <div className="flex items-start gap-2 mb-2">
        <span
          className={`material-symbols-outlined text-lg ${
            isHighlighted ? 'text-primary' : 'text-green-600'
          }`}
        >
          check_circle
        </span>
        <h3
          className={`text-lg font-semibold ${
            isHighlighted ? 'text-on-primary-container' : 'text-on-surface'
          }`}
        >
          {differentiator.title}
        </h3>
      </div>

      {/* Description */}
      <p
        className={`text-sm leading-relaxed ${
          isHighlighted ? 'text-on-primary-container/80' : 'text-on-surface-variant'
        }`}
      >
        {differentiator.description}
      </p>
    </div>
  );
}

/**
 * Comparison section highlighting key differentiators
 */
export function ComparisonSection({
  id,
  className,
  differentiators = DIFFERENTIATORS,
}: ComparisonSectionProps) {
  // Don't render if no differentiators available
  if (!differentiators || differentiators.length === 0) {
    return null;
  }

  return (
    <section
      id={id}
      className={`py-16 md:py-24 px-4 bg-surface-variant ${className || ''}`}
    >
      <div className="max-w-6xl mx-auto">
        {/* Section headline */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-on-surface mb-4">
            Mengapa SpeakReady?
          </h2>
          <p className="text-on-surface-variant max-w-2xl mx-auto">
            Bukan sekedar latihan interview biasa. Kami menggabungkan teknologi AI
            terdepan dengan pemahaman kebutuhan profesional Indonesia.
          </p>
        </div>

        {/* Comparison subtitle - AI vs Traditional */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 mb-10">
          <div className="flex items-center gap-2 text-primary font-semibold">
            <span className="material-symbols-outlined">smart_toy</span>
            <span>AI-Powered Feedback</span>
          </div>
          <span className="hidden md:block text-on-surface-variant">vs</span>
          <div className="flex items-center gap-2 text-on-surface-variant line-through opacity-60">
            <span className="material-symbols-outlined">description</span>
            <span>Template Feedback Generik</span>
          </div>
        </div>

        {/* Differentiator cards grid: 1-2 columns mobile, 2-4 desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {differentiators.map((differentiator) => (
            <DifferentiatorCard
              key={differentiator.id}
              differentiator={differentiator}
            />
          ))}
        </div>

        {/* Bottom emphasis - Indonesian focus */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-3 bg-surface px-6 py-4 rounded-full shadow-sm">
            <span className="material-symbols-outlined text-primary">
              language
            </span>
            <span className="text-on-surface font-medium">
              100% Interface dalam Bahasa Indonesia
            </span>
            <span className="material-symbols-outlined text-green-600">
              verified
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
