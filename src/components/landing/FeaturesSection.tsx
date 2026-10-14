/**
 * FeaturesSection Component
 *
 * Replaces the former FeatureShowcase + ComparisonSection + TechStackSection trio:
 * - Three module cards (Speaking, Grammar, Writing) with concrete bullet points
 * - A compact row of differentiators ("Kenapa SpeakReady")
 */

import { DIFFERENTIATORS, FEATURES } from './data';
import type { SectionProps, Feature, Differentiator } from './types';

interface FeaturesSectionProps extends SectionProps {
  features?: Feature[];
  differentiators?: Differentiator[];
}

const ICON_STYLES = ['bg-primary text-on-primary', 'bg-tertiary-container text-tertiary-fixed', 'bg-accent text-on-accent'];

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  return (
    <div className="flex flex-col bg-surface-container-lowest rounded-3xl p-6 md:p-8 ring-1 ring-black/5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 ${ICON_STYLES[index % ICON_STYLES.length]}`}>
        <span className="material-symbols-outlined text-2xl" aria-hidden="true">{feature.icon}</span>
      </div>
      <h3 className="font-headline text-xl font-bold text-on-surface mb-2">{feature.title}</h3>
      <p className="text-sm text-on-surface-variant leading-relaxed mb-5">{feature.description}</p>
      <ul className="space-y-2 mt-auto">
        {feature.points.map((point) => (
          <li key={point} className="flex items-start gap-2 text-sm text-on-surface">
            <span className="material-symbols-outlined text-base text-green-600 mt-0.5" aria-hidden="true">check</span>
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FeaturesSection({
  id,
  className,
  features = FEATURES,
  differentiators = DIFFERENTIATORS,
}: FeaturesSectionProps) {
  return (
    <section id={id} className={`py-16 md:py-24 px-4 bg-surface scroll-mt-16 ${className || ''}`}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-accent-strong mb-3">Fitur</p>
          <h2 className="font-headline text-3xl md:text-4xl font-bold text-on-surface mb-4">
            Satu tempat untuk latihan speaking, grammar, dan writing
          </h2>
          <p className="text-on-surface-variant max-w-2xl mx-auto">
            Semua yang Anda perlukan untuk siap menghadapi interview kerja berbahasa Inggris.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <FeatureCard key={feature.id} feature={feature} index={index} />
          ))}
        </div>

        {differentiators.length > 0 && (
          <div className="mt-16">
            <h3 className="text-center font-headline text-xl md:text-2xl font-bold text-on-surface mb-8">
              Kenapa SpeakReady?
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {differentiators.map((d) => (
                <div key={d.id} className="flex gap-3 p-5 rounded-2xl bg-surface-container-low">
                  <span className="material-symbols-outlined text-2xl text-primary shrink-0" aria-hidden="true">{d.icon}</span>
                  <div>
                    <p className="font-semibold text-on-surface mb-1">{d.title}</p>
                    <p className="text-sm text-on-surface-variant leading-relaxed">{d.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
