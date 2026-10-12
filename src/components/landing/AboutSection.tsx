/**
 * AboutSection Component
 *
 * Displays company mission, founder information, and vision for Indonesian professionals.
 *
 * Features:
 * - Company mission statement
 * - Founder card with photo placeholder (initials avatar), name, title, bio
 * - Optional LinkedIn link
 * - Vision statement for Indonesian professionals in global job markets
 * - CTA encouraging visitors to join the mission
 * - Stacked layout on mobile, side-by-side on desktop
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { FOUNDER_INFO } from './data';
import type { SectionProps, FounderInfo } from './types';

interface AboutSectionProps extends SectionProps {
  /** Callback when "Bergabung Sekarang" CTA is clicked */
  onJoinMission: () => void;
  /** Optional founder info override - defaults to FOUNDER_INFO */
  founder?: FounderInfo;
}

/**
 * Generate initials from a name
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Founder avatar component - displays photo or initials placeholder
 */
function FounderAvatar({ founder }: { founder: FounderInfo }) {
  if (founder.photoUrl) {
    return (
      <img
        src={founder.photoUrl}
        alt={founder.name}
        className="w-24 h-24 md:w-32 md:h-32 rounded-full object-cover ring-4 ring-primary/20"
      />
    );
  }

  // Initials placeholder
  return (
    <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-primary flex items-center justify-center ring-4 ring-primary/20">
      <span className="text-2xl md:text-3xl font-bold text-on-primary">
        {getInitials(founder.name)}
      </span>
    </div>
  );
}

/**
 * Founder card component with avatar, name, title, bio, and optional LinkedIn
 */
function FounderCard({ founder }: { founder: FounderInfo }) {
  return (
    <div className="flex flex-col items-center text-center p-6 md:p-8 bg-surface-container rounded-2xl shadow-sm">
      {/* Avatar */}
      <FounderAvatar founder={founder} />

      {/* Name */}
      <h3 className="mt-4 text-xl md:text-2xl font-bold text-on-surface">
        {founder.name}
      </h3>

      {/* Title */}
      <p className="text-sm text-primary font-medium mt-1">{founder.title}</p>

      {/* Bio */}
      <p className="mt-4 text-on-surface-variant leading-relaxed">
        {founder.bio}
      </p>

      {/* LinkedIn link */}
      {founder.linkedInUrl && (
        <a
          href={founder.linkedInUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 text-primary hover:text-primary/80 font-medium transition-colors duration-200"
          aria-label={`LinkedIn profile of ${founder.name}`}
        >
          <svg
            className="w-5 h-5"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
          </svg>
          <span>LinkedIn</span>
        </a>
      )}
    </div>
  );
}

/**
 * About section displaying mission, founder info, vision, and join CTA
 * Responsive: stacked on mobile, side-by-side on desktop
 */
export function AboutSection({
  id,
  className,
  onJoinMission,
  founder = FOUNDER_INFO,
}: AboutSectionProps) {
  return (
    <section
      id={id}
      className={`py-16 md:py-24 px-4 bg-surface-container-low ${className || ''}`}
    >
      <div className="max-w-6xl mx-auto">
        {/* Section headline */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-on-surface mb-4">
            Tentang Kami
          </h2>
          <p className="text-on-surface-variant max-w-2xl mx-auto">
            Misi kami untuk membantu profesional Indonesia sukses di pasar kerja global
          </p>
        </div>

        {/* Main content - stacked mobile, side-by-side desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left: Mission & Vision */}
          <div className="space-y-6">
            {/* Mission statement */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-primary">
                  flag
                </span>
                <h3 className="text-lg font-semibold text-on-surface">
                  Misi Kami
                </h3>
              </div>
              <p className="text-on-surface-variant leading-relaxed">
                Menyediakan platform latihan interview bahasa Inggris yang
                accessible dan berkualitas tinggi untuk profesional Indonesia.
                Kami percaya bahwa kemampuan komunikasi dalam bahasa Inggris
                seharusnya bukan penghalang untuk sukses di karir internasional.
              </p>
            </div>

            {/* Vision statement */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-primary">
                  visibility
                </span>
                <h3 className="text-lg font-semibold text-on-surface">
                  Visi Kami
                </h3>
              </div>
              <p className="text-on-surface-variant leading-relaxed">
                Menjadi platform nomor satu di Indonesia untuk persiapan
                interview bahasa Inggris. Kami ingin setiap profesional
                Indonesia memiliki kepercayaan diri untuk bersaing di pasar
                kerja global, mendapatkan pekerjaan impian mereka di perusahaan
                multinasional, dan membuka pintu kesempatan internasional.
              </p>
            </div>

            {/* CTA button */}
            <div className="pt-4">
              <button
                onClick={onJoinMission}
                className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-full font-semibold hover:bg-primary/90 transition-all duration-200 shadow-md hover:shadow-lg"
              >
                <span className="material-symbols-outlined">rocket_launch</span>
                <span>Bergabung Sekarang</span>
              </button>
            </div>
          </div>

          {/* Right: Founder card */}
          <div className="flex justify-center lg:justify-end">
            <div className="w-full max-w-md">
              <FounderCard founder={founder} />
            </div>
          </div>
        </div>

        {/* Bottom note */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-2 text-on-surface-variant text-sm bg-surface-container px-4 py-2 rounded-full">
            <span className="material-symbols-outlined text-primary text-lg">
              handshake
            </span>
            <span>
              Dibangun dengan ❤️ untuk profesional Indonesia
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
