/**
 * SocialProofSection - Testimonials display for social proof
 * Displays user testimonials in a responsive grid layout
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { TESTIMONIALS } from './data';
import type { Testimonial, SectionProps } from './types';

/**
 * Extracts initials from a name (max 2 characters)
 * Example: "Rina Wijaya" -> "RW"
 */
const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

interface TestimonialCardProps {
  testimonial: Testimonial;
}

/**
 * Individual testimonial card component
 */
function TestimonialCard({ testimonial }: TestimonialCardProps) {
  const { name, jobTitle, company, quote, avatarUrl } = testimonial;

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
      {/* Quote */}
      <div className="mb-6">
        <span className="material-symbols-outlined text-primary/30 text-4xl mb-2 block">
          format_quote
        </span>
        <p className="text-on-surface/80 leading-relaxed">{quote}</p>
      </div>

      {/* User info */}
      <div className="flex items-center gap-4">
        {/* Avatar */}
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-primary font-semibold text-sm">
              {getInitials(name)}
            </span>
          </div>
        )}

        {/* Name and position */}
        <div>
          <h4 className="font-semibold text-on-surface">{name}</h4>
          <p className="text-sm text-on-surface/60">
            {jobTitle}, {company}
          </p>
        </div>
      </div>
    </div>
  );
}

interface SocialProofSectionProps extends SectionProps {}

/**
 * Social proof section displaying testimonials
 * Responsive grid: 1 column mobile, 2 columns tablet, 3 columns desktop
 */
export function SocialProofSection({
  id,
  className = '',
}: SocialProofSectionProps) {
  // Don't render if no testimonials
  if (!TESTIMONIALS || TESTIMONIALS.length === 0) {
    return null;
  }

  return (
    <section
      id={id}
      className={`py-16 md:py-24 bg-surface-variant ${className}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section headline */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-on-surface mb-4">
            Apa Kata Mereka?
          </h2>
          <p className="text-lg text-on-surface/70 max-w-2xl mx-auto">
            Bergabung dengan ribuan profesional Indonesia yang telah meningkatkan
            kemampuan interview bahasa Inggris mereka
          </p>
        </div>

        {/* Testimonials grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {TESTIMONIALS.map((testimonial) => (
            <TestimonialCard key={testimonial.id} testimonial={testimonial} />
          ))}
        </div>
      </div>
    </section>
  );
}
