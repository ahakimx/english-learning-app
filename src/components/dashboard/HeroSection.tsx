/**
 * HeroSection component for unauthenticated visitors
 * Displays value proposition, CTAs, and trust indicators
 * 
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 10.1, 10.2, 10.5
 */
interface HeroSectionProps {
  onStartPractice: () => void
  onRegister: () => void
}

export default function HeroSection({ onStartPractice, onRegister }: HeroSectionProps) {
  return (
    <section className="bg-surface-container-low p-6 md:p-10 rounded-2xl">
      {/* Beta Badge */}
      <div className="flex justify-start mb-6">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-tertiary/10 text-tertiary text-xs font-bold rounded-full uppercase tracking-wider">
          <span className="w-2 h-2 bg-tertiary rounded-full animate-pulse" />
          Beta
        </span>
      </div>

      {/* Main Content */}
      <div className="text-center max-w-3xl mx-auto">
        {/* Headline */}
        <h1 className="font-headline font-extrabold text-3xl md:text-4xl lg:text-5xl text-primary mb-4 leading-tight">
          AI-Powered English Interview Preparation
        </h1>

        {/* Subheadline - targeting Indonesian professionals */}
        <p className="text-on-surface-variant text-base md:text-lg mb-8 max-w-2xl mx-auto">
          Platform latihan interview bahasa Inggris untuk profesional Indonesia yang ingin sukses di interview kerja internasional
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
          {/* Primary CTA */}
          <button
            type="button"
            onClick={onStartPractice}
            className="px-8 py-3 bg-primary text-white text-base font-bold rounded-lg hover:bg-primary/90 transition-colors shadow-lg hover:shadow-xl active:scale-[0.98] duration-150"
          >
            Mulai Latihan Gratis
          </button>

          {/* Secondary CTA */}
          <button
            type="button"
            onClick={onRegister}
            className="px-8 py-3 bg-secondary-container text-on-secondary-container text-base font-bold rounded-lg hover:bg-tertiary hover:text-white transition-colors active:scale-[0.98] duration-150"
          >
            Daftar Sekarang
          </button>
        </div>

        {/* Trust Indicators */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6 border-t border-outline-variant/30">
          {/* Powered by Claude Badge */}
          <div className="flex items-center gap-2 px-4 py-2 bg-surface-container rounded-full">
            <svg 
              viewBox="0 0 24 24" 
              className="w-5 h-5 text-[#D97706]"
              fill="currentColor"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-sm font-semibold text-on-surface">Powered by Claude</span>
          </div>

          {/* Tech Stack Indicators */}
          <div className="flex items-center gap-3 text-on-surface-variant text-sm">
            <div className="flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M18.75 11.35a4.32 4.32 0 0 1-.79-.08 3.9 3.9 0 0 1-.73-.23l-.17-.07h-.12l-.08.08-.06.12a3.37 3.37 0 0 1-.7 1.03 3.42 3.42 0 0 1-2.75 1.12 3.37 3.37 0 0 1-2.75-1.12 3.37 3.37 0 0 1-.7-1.03l-.06-.12-.08-.08h-.12l-.17.07a3.9 3.9 0 0 1-.73.23 4.32 4.32 0 0 1-.79.08 4.46 4.46 0 0 1-3.24-1.35A4.46 4.46 0 0 1 4 6.76a4.46 4.46 0 0 1 1.35-3.24A4.46 4.46 0 0 1 8.59 2.17a4.32 4.32 0 0 1 .79.08 3.9 3.9 0 0 1 .73.23l.17.07h.12l.08-.08.06-.12A3.37 3.37 0 0 1 11.24 1.32a3.42 3.42 0 0 1 2.75 1.12 3.37 3.37 0 0 1 .7 1.03l.06.12.08.08h.12l.17-.07a3.9 3.9 0 0 1 .73-.23 4.32 4.32 0 0 1 .79-.08 4.46 4.46 0 0 1 3.24 1.35A4.46 4.46 0 0 1 21 6.88a4.46 4.46 0 0 1-1.35 3.24 4.46 4.46 0 0 1-3.24 1.35" />
              </svg>
              <span>AWS</span>
            </div>
            <span className="text-outline-variant">|</span>
            <div className="flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#61DAFB]" fill="currentColor">
                <path d="M12 10.11c1.03 0 1.87.84 1.87 1.89 0 1-.84 1.85-1.87 1.85S10.13 13 10.13 12c0-1.05.84-1.89 1.87-1.89M7.37 20c.63.38 2.01-.2 3.6-1.7-.52-.59-1.03-1.23-1.51-1.9a22.7 22.7 0 0 1-2.4-.36c-.51 2.14-.32 3.61.31 3.96m.71-5.74-.29-.51c-.11.29-.22.58-.29.86.27.06.57.11.88.16l-.3-.51m6.54-.76.81-1.5-.81-1.5c-.3-.53-.62-1-.91-1.47C13.17 9 12.6 9 12 9s-1.17 0-1.71.03c-.29.47-.61.94-.91 1.47L8.57 12l.81 1.5c.3.53.62 1 .91 1.47.54.03 1.11.03 1.71.03s1.17 0 1.71-.03c.29-.47.61-.94.91-1.47M12 6.78c-.19.22-.39.45-.59.72h1.18c-.2-.27-.4-.5-.59-.72m0 10.44c.19-.22.39-.45.59-.72h-1.18c.2.27.4.5.59.72M16.62 4c-.62-.38-2 .2-3.59 1.7.52.59 1.03 1.23 1.51 1.9.82.08 1.63.2 2.4.36.51-2.14.32-3.61-.32-3.96m-.7 5.74.29.51c.11-.29.22-.58.29-.86-.27-.06-.57-.11-.88-.16l.3.51m1.45-7.05c1.47.84 1.63 3.05 1.01 5.63 2.54.75 4.37 1.99 4.37 3.68s-1.83 2.93-4.37 3.68c.62 2.58.46 4.79-1.01 5.63-1.46.84-3.45-.12-5.37-1.95-1.92 1.83-3.91 2.79-5.38 1.95-1.46-.84-1.62-3.05-1-5.63-2.54-.75-4.37-1.99-4.37-3.68s1.83-2.93 4.37-3.68c-.62-2.58-.46-4.79 1-5.63 1.47-.84 3.46.12 5.38 1.95 1.92-1.83 3.91-2.79 5.37-1.95M17.08 12c.34.75.64 1.5.89 2.26 2.1-.63 3.28-1.53 3.28-2.26s-1.18-1.63-3.28-2.26c-.25.76-.55 1.51-.89 2.26M6.92 12c-.34-.75-.64-1.5-.89-2.26-2.1.63-3.28 1.53-3.28 2.26s1.18 1.63 3.28 2.26c.25-.76.55-1.51.89-2.26m9 2.26-.3.51c.31-.05.61-.1.88-.16-.07-.28-.18-.57-.29-.86l-.29.51m-9.82 1.35c.88.06 1.77.08 2.65.08s1.77-.02 2.65-.08c.52-.61.99-1.25 1.4-1.88.41.63.88 1.27 1.4 1.88.88-.06 1.77-.08 2.65-.08s1.77.02 2.65.08c.52.61.99 1.25 1.4 1.88-.41-.63-.88-1.27-1.4-1.88.41-.63.88-1.27 1.4-1.88-.52-.61-.99-1.25-1.4-1.88-.41.63-.88 1.27-1.4 1.88-.88.06-1.77.08-2.65.08s-1.77-.02-2.65-.08c-.52-.61-.99-1.25-1.4-1.88-.41.63-.88 1.27-1.4 1.88.52.61.99 1.25 1.4 1.88-.41-.63-.88-1.27-1.4-1.88-.52.61-.99 1.25-1.4 1.88.41-.63.88-1.27 1.4-1.88M15.91 13.74l.3.51c-.31.05-.61.1-.88.16.07.28.18.57.29.86l.29-.51z" />
              </svg>
              <span>React</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
