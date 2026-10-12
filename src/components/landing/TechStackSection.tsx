/**
 * TechStackSection Component
 *
 * Displays the technology stack powering SpeakReady:
 * - Prominent "Powered by Claude" badge with Anthropic emphasis
 * - AWS services: Bedrock, Transcribe, Polly, Lambda, DynamoDB
 * - Brief description for each technology's purpose
 * - Material Symbol icons for visual recognition
 * - Responsive grid: 2-column on mobile, 3-column on desktop
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { TECH_STACK } from './data';
import type { SectionProps, TechItem } from './types';

interface TechStackSectionProps extends SectionProps {
  /** Optional tech stack override - defaults to TECH_STACK */
  technologies?: TechItem[];
}

/**
 * Maps technology category to Material Symbol icon name
 */
function getCategoryIcon(category: TechItem['category']): string {
  switch (category) {
    case 'ai':
      return 'psychology';
    case 'speech':
      return 'record_voice_over';
    case 'infrastructure':
      return 'cloud';
    case 'database':
      return 'database';
    default:
      return 'code';
  }
}

/**
 * Individual technology card component
 */
function TechCard({ tech, isHighlighted }: { tech: TechItem; isHighlighted: boolean }) {
  const icon = tech.icon || getCategoryIcon(tech.category);

  return (
    <div
      className={`flex flex-col items-center text-center p-6 rounded-2xl transition-shadow hover:shadow-lg ${
        isHighlighted
          ? 'bg-primary-container border-2 border-primary'
          : 'bg-surface-container'
      }`}
    >
      {/* Icon */}
      <span
        className={`material-symbols-outlined text-4xl mb-4 ${
          isHighlighted ? 'text-primary' : 'text-on-surface-variant'
        }`}
      >
        {icon}
      </span>

      {/* Technology name */}
      <h3
        className={`text-lg font-semibold mb-2 ${
          isHighlighted ? 'text-on-primary-container' : 'text-on-surface'
        }`}
      >
        {tech.name}
      </h3>

      {/* Description */}
      <p
        className={`text-sm ${
          isHighlighted ? 'text-on-primary-container/80' : 'text-on-surface-variant'
        }`}
      >
        {tech.description}
      </p>

      {/* Category badge for highlighted items */}
      {isHighlighted && (
        <span className="mt-4 px-3 py-1 bg-primary text-on-primary text-xs font-medium rounded-full">
          AI Utama
        </span>
      )}
    </div>
  );
}

/**
 * Technology stack section showcasing AI and AWS technologies
 */
export function TechStackSection({
  id,
  className,
  technologies = TECH_STACK,
}: TechStackSectionProps) {
  // Don't render if no technologies available
  if (!technologies || technologies.length === 0) {
    return null;
  }

  // Claude is the primary AI - highlight it
  const claudeTech = technologies.find((tech) => tech.id === 'tech-claude');
  const otherTechs = technologies.filter((tech) => tech.id !== 'tech-claude');

  return (
    <section
      id={id}
      className={`py-16 md:py-24 px-4 bg-surface-variant ${className || ''}`}
    >
      <div className="max-w-6xl mx-auto">
        {/* Section header with prominent Claude emphasis */}
        <div className="text-center mb-12">
          {/* Powered by Claude badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-full text-sm font-medium mb-6">
            <span className="material-symbols-outlined text-xl">psychology</span>
            Powered by Claude
          </div>

          <h2 className="text-3xl md:text-4xl font-bold text-on-surface mb-4">
            Didukung Teknologi Terdepan
          </h2>
          <p className="text-on-surface-variant max-w-2xl mx-auto">
            AI generasi terbaru dari Anthropic dan infrastruktur enterprise AWS 
            untuk pengalaman belajar yang aman, cepat, dan akurat
          </p>
        </div>

        {/* Claude highlight card - full width on mobile, centered on desktop */}
        {claudeTech && (
          <div className="mb-8">
            <div className="max-w-md mx-auto">
              <TechCard tech={claudeTech} isHighlighted={true} />
            </div>
          </div>
        )}

        {/* AWS services grid: 2-column on mobile, 3-column on desktop */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          {otherTechs.map((tech) => (
            <TechCard key={tech.id} tech={tech} isHighlighted={false} />
          ))}
        </div>

        {/* AI differentiator callout */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-3 px-6 py-4 bg-surface-container rounded-2xl">
            <span className="material-symbols-outlined text-3xl text-primary">
              auto_awesome
            </span>
            <div className="text-left">
              <p className="font-semibold text-on-surface">
                100% AI-Powered Feedback
              </p>
              <p className="text-sm text-on-surface-variant">
                Setiap feedback di-generate khusus untuk jawaban Anda
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
