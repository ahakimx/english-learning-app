/**
 * PricingSection Component
 *
 * Displays pricing tiers for the platform with clear feature comparison.
 *
 * Features:
 * - 2 pricing tiers: Gratis (Free) and Premium
 * - Features with included/excluded indicators (checkmark/x icons)
 * - Recommended tier (Premium) on a dark card with an accent badge
 * - Prices in IDR with a per-day breakdown for paid tiers
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
function FeatureItem({ feature, onDark }: { feature: PricingFeature; onDark: boolean }) {
  const iconColor = !feature.included
    ? onDark ? 'text-white/30' : 'text-on-surface/30'
    : onDark ? 'text-tertiary-fixed-dim' : 'text-green-600';
  const textColor = !feature.included
    ? onDark ? 'text-white/40 line-through' : 'text-on-surface/50 line-through'
    : onDark ? 'text-white/90' : 'text-on-surface';

  return (
    <li className="flex items-start gap-3">
      <span className={`material-symbols-outlined text-lg mt-0.5 flex-shrink-0 ${iconColor}`} aria-hidden="true">
        {feature.included ? 'check_circle' : 'cancel'}
      </span>
      <span className={`text-sm ${textColor}`}>{feature.text}</span>
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
  const perDay = Math.round(tier.price / 30).toLocaleString('id-ID');

  return (
    <div
      className={`relative flex flex-col rounded-3xl p-6 md:p-8 transition-all duration-200 ${
        isRecommended
          ? 'bg-primary shadow-2xl shadow-primary/30 ring-4 ring-accent/40'
          : 'bg-surface-container-lowest ring-1 ring-outline-variant shadow-sm hover:shadow-md'
      }`}
    >
      {/* Recommended badge */}
      {isRecommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-on-accent text-xs font-bold px-4 py-1.5 rounded-full flex items-center gap-1.5 shadow">
          <span className="material-symbols-outlined text-sm" aria-hidden="true">star</span>
          <span>Populer</span>
        </div>
      )}

      {/* Tier name */}
      <h3 className={`text-xl font-bold mb-2 ${isRecommended ? 'text-white' : 'text-on-surface'}`}>
        {tier.name}
      </h3>

      {/* Price display */}
      <div className="flex items-baseline gap-1">
        <span
          className={`font-headline text-4xl md:text-5xl font-extrabold tracking-tight ${
            isRecommended ? 'text-white' : 'text-on-surface'
          }`}
        >
          {tier.priceDisplay}
        </span>
        {tier.price > 0 && (
          <span className={isRecommended ? 'text-white/70' : 'text-on-surface-variant'}>/bulan</span>
        )}
      </div>
      <p className={`text-xs mt-1 mb-4 ${isRecommended ? 'text-primary-fixed-dim' : 'text-on-surface-variant'}`}>
        {tier.price > 0 ? `Sekitar Rp ${perDay} per hari` : 'Gratis selamanya'}
      </p>

      {/* Description */}
      <p className={`text-sm mb-6 ${isRecommended ? 'text-white/80' : 'text-on-surface-variant'}`}>
        {tier.description}
      </p>

      {/* Session limit indicator for free tier */}
      {tier.sessionLimit && (
        <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full mb-4 w-fit bg-accent-soft text-accent-strong">
          <span className="material-symbols-outlined text-sm" aria-hidden="true">info</span>
          <span>{tier.sessionLimit} sesi per bulan</span>
        </div>
      )}

      {/* Features list */}
      <ul className="space-y-3 mb-8 flex-grow">
        {tier.features.map((feature, index) => (
          <FeatureItem key={`${tier.id}-feature-${index}`} feature={feature} onDark={isRecommended} />
        ))}
      </ul>

      {/* CTA button */}
      <button
        type="button"
        onClick={onSelect}
        className={`w-full py-3 px-6 rounded-full font-semibold text-base transition-all duration-200 ${
          isRecommended
            ? 'bg-accent text-on-accent hover:brightness-105 shadow-md hover:shadow-lg'
            : 'bg-primary text-on-primary hover:bg-primary-container'
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
      className={`py-16 md:py-24 px-4 bg-surface scroll-mt-16 ${className || ''}`}
    >
      <div className="max-w-4xl mx-auto">
        {/* Section headline */}
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-accent-strong mb-3">Harga</p>
          <h2 className="font-headline text-3xl md:text-4xl font-bold text-on-surface mb-4">
            Pilih Paket Anda
          </h2>
          <p className="text-on-surface-variant max-w-2xl mx-auto">
            Mulai gratis. Upgrade kapan saja saat Anda butuh latihan tanpa batas.
          </p>
        </div>

        {/* Pricing cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          {tiers.map((tier) => (
            <PricingCard
              key={tier.id}
              tier={tier}
              onSelect={() => onSelectTier(tier.id)}
            />
          ))}
        </div>

        {/* No-commitment note */}
        <div className="mt-10 text-center">
          <div className="inline-flex items-center gap-2 text-on-surface-variant text-sm">
            <span className="material-symbols-outlined text-green-600" aria-hidden="true">
              verified_user
            </span>
            <span>Tidak ada komitmen jangka panjang. Berhenti kapan saja.</span>
          </div>
        </div>
      </div>
    </section>
  );
}
