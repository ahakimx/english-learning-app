/**
 * StatsSection Component
 *
 * Displays platform metrics in a responsive grid:
 * - 2x2 grid on mobile
 * - 4-column row on desktop
 *
 * Each stat card shows:
 * - Material Symbol icon
 * - Large numeric value
 * - Indonesian label
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 11.6
 */

import { PLATFORM_STATS } from './data';
import type { SectionProps, PlatformStat } from './types';

interface StatsSectionProps extends SectionProps {
  /** Optional stats override - defaults to PLATFORM_STATS */
  stats?: PlatformStat[];
}

/**
 * Individual stat card component
 */
function StatCard({ stat }: { stat: PlatformStat }) {
  return (
    <div className="flex flex-col items-center text-center p-6 bg-surface-container rounded-2xl">
      {/* Icon */}
      <span className="material-symbols-outlined text-4xl text-primary mb-4">
        {stat.icon}
      </span>

      {/* Large numeric value */}
      <span className="text-4xl md:text-5xl font-bold text-on-surface mb-2">
        {stat.value}
      </span>

      {/* Indonesian label */}
      <span className="text-sm md:text-base text-on-surface-variant">
        {stat.label}
      </span>
    </div>
  );
}

/**
 * Platform statistics section displaying key metrics
 */
export function StatsSection({
  id,
  className,
  stats = PLATFORM_STATS,
}: StatsSectionProps) {
  // Don't render if no stats available
  if (!stats || stats.length === 0) {
    return null;
  }

  return (
    <section
      id={id}
      className={`py-16 md:py-24 px-4 bg-surface ${className || ''}`}
    >
      <div className="max-w-6xl mx-auto">
        {/* Section headline */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-on-surface mb-4">
            SpeakReady dalam Angka
          </h2>
          <p className="text-on-surface-variant max-w-2xl mx-auto">
            Platform terpercaya untuk mempersiapkan interview bahasa Inggris
          </p>
        </div>

        {/* Stats grid: 2x2 on mobile, 4-column on desktop */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {stats.map((stat) => (
            <StatCard key={stat.id} stat={stat} />
          ))}
        </div>
      </div>
    </section>
  );
}
