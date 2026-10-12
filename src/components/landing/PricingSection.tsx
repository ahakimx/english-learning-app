/**
 * PricingSection Component
 *
 * Displays pricing tiers for the platform with clear feature comparison.
 *
 * Features:
 * - 2 pricing tiers: Gratis (Free) and Premium
 * - Features with included/excluded indicators (checkmark/x icons)
 * - Visually distinguished recommended tier (Premium) with badge and border
 * - Prices in IDR format (Rp 0, Rp 99.000/bulan)
 * - CTA button for each tier
 * - Free tier shows 5 sessions/month limit
 * - Responsive: 1-column mobile, 2-column desktop
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */

import { PRICING_TIERS } from './data';
import type { SectionProps, PricingTier, PricingFeature } from './types';

interface PricingSectionProps extends SectionProps {
  /** Callback when a tier CTA is clicked */
  onSelectTier: (tierId: string) => void;
  /** Optional tiers override - defaults to PRICING_TIERS */
  tiers?: PricingTier[];
}

/**
 * Feature list item with included/excluded indicator
 */
function FeatureItem({ feature }: { feature: PricingFeature }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`material-symbols-outlined text-lg mt-0.5 flex-shrink-0 ${
          feature.included ? 'text-green-600' : 'text-on-surface/30'
        }`}
      >
        {feature.included ? 'check_circle' : 'cancel'}
      </span>
      <span
        className={`text-sm ${
          feature.included ? 'text-on-surface' : 'text-on-surface/50 line-through'
        }`}
      >
        {feature.text}
      </span>
    </li>
  );
}

/**
 * Individual pricing card component
 */
function PricingCard({
  tier,
  onSelect,
}: {
  tier: PricingTier;
  onSelect: () => void;
}) {
  const isRecommended = tier.recommended === true;

  return (
    <div
      className={`relative flex flex-col rounded-2xl p-6 md:p-8 transition-all duration-200 ${
        isRecommended
          ? 'bg-primary-container border-2 border-primary shadow-xl scale-[1.02]'
          : 'bg-surface-container border border-outline-variant shadow-sm hover:shadow-md'
      }`}
    >
      {/* Recommended badge */}
      {isRecommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-on-primary text-xs font-semibold px-4 py-1.5 rounded-full flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm">star</span>
          <span>Populer</span>
        </div>
      )}

      {/* Tier name */}
      <h3
        className={`text-xl font-bold mb-2 ${
          isRecommended ? 'text-on-primary-container' : 'text-on-surface'
        }`}
      >
        {tier.name}
      </h3>

      {/* Price display */}
      <div className="mb-4">
        <span
          className={`text-4xl md:text-5xl font-bold ${
            isRecommended ? 'text-primary' : 'text-on-surface'
          }`}
        >
          {tier.priceDisplay}
        </span>
      </div>

      {/* Description */}
      <p
        className={`text-sm mb-6 ${
          isRecommended ? 'text-on-primary-container/80' : 'text-on-surface-variant'
        }`}
      >
        {tier.description}
      </p>

      {/* Session limit indicator for free tier */}
      {tier.sessionLimit && (
        <div
          className={`inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full mb-4 w-fit ${
            isRecommended
              ? 'bg-primary/10 text-primary'
              : 'bg-amber-100 text-amber-700'
          }`}
        >
          <span className="material-symbols-outlined text-sm">info</span>
          <span>{tier.sessionLimit} sesi per bulan</span>
        </div>
      )}

      {/* Features list */}
      <ul className="space-y-3 mb-8 flex-grow">
        {tier.features.map((feature, index) => (
          <FeatureItem key={`${tier.id}-feature-${index}`} feature={feature} />
        ))}
      </ul>

      {/* CTA button */}
      <button
        onClick={onSelect}
        className={`w-full py-3 px-6 rounded-full font-semibold text-base transition-all duration-200 ${
          isRecommended
            ? 'bg-primary text-on-primary hover:bg-primary/90 shadow-md hover:shadow-lg'
            : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest border border-outline-variant'
        }`}
      >
        {tier.ctaLabel}
      </button>
    </div>
  );
}

/**
 * Pricing section displaying tier options
 * Responsive: 1 column mobile, 2 columns desktop
 */
export function PricingSection({
  id,
  className,
  onSelectTier,
  tiers = PRICING_TIERS,
}: PricingSectionProps) {
  // Don't render if no tiers available
  if (!tiers || tiers.length === 0) {
    return null;
  }

  return (
    <section
      id={id}
      className={`py-16 md:py-24 px-4 bg-surface ${className || ''}`}
    >
      <div className="max-w-4xl mx-auto">
        {/* Section headline */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-on-surface mb-4">
            Pilih Paket Anda
          </h2>
          <p className="text-on-surface-variant max-w-2xl mx-auto">
            Mulai gratis atau upgrade ke Premium untuk pengalaman latihan tanpa batas
          </p>
        </div>

        {/* Pricing cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-start">
          {tiers.map((tier) => (
            <PricingCard
              key={tier.id}
              tier={tier}
              onSelect={() => onSelectTier(tier.id)}
            />
          ))}
        </div>

        {/* Money-back guarantee note */}
        <div className="mt-10 text-center">
          <div className="inline-flex items-center gap-2 text-on-surface-variant text-sm">
            <span className="material-symbols-outlined text-green-600">
              verified_user
            </span>
            <span>Tidak ada komitmen jangka panjang. Cancel kapan saja.</span>
          </div>
        </div>
      </div>
    </section>
  );
}
