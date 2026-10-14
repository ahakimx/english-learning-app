/**
 * HeroSection Component
 *
 * Above-the-fold section for the landing page with:
 * - Outcome-focused headline and subheadline
 * - Primary CTA (register) and secondary CTA (jump to sample feedback)
 * - Product preview: an illustrated interview session with feedback
 * - "Dibangun dengan" technology strip
 *
 * Requirements: 9.1, 12.4
 */

import { FEEDBACK_EXAMPLES, PRIMARY_CTA_LABEL, TECH_STACK } from './data';
import type { SectionProps } from './types';

interface HeroSectionProps extends SectionProps {
  /** Callback when the primary CTA is clicked */
  onStartPractice: () => void;
  /** Section id the secondary CTA scrolls to */
  demoSectionId?: string;
}

const PREVIEW = FEEDBACK_EXAMPLES[0];

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-on-surface-variant mb-1">
        <span>{label}</span>
        <span className="font-semibold text-on-surface">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-container-high">
        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/**
 * Static illustration of an interview session, built from the first feedback example
 */
function InterviewPreview() {
  const correction = PREVIEW.corrections[0];
  const overall = Math.round(
    (PREVIEW.scores.grammar + PREVIEW.scores.vocabulary + PREVIEW.scores.relevance + PREVIEW.scores.coherence) / 4
  );

  return (
    <figure className="relative w-full max-w-md mx-auto lg:mx-0" aria-label="Ilustrasi sesi interview di SpeakReady">
      {/* Session window */}
      <div className="bg-surface-container-lowest rounded-3xl shadow-2xl ring-1 ring-black/5 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-container-high">
          <div className="flex items-center gap-2 text-xs font-semibold text-on-surface">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping motion-reduce:animate-none" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            Sesi Interview
          </div>
          <span className="text-[11px] text-on-surface-variant">Backend Developer · Mid-level</span>
        </div>

        <div className="p-5 space-y-4">
          {/* AI question */}
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-lg">smart_toy</span>
            </div>
            <div className="bg-surface-container rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-on-surface">
              {PREVIEW.question}
            </div>
          </div>

          {/* User answer with an inline correction */}
          <div className="flex gap-3 justify-end">
            <div className="bg-primary/5 border border-primary/10 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-on-surface leading-relaxed">
              …and I <span className="line-through decoration-red-500 decoration-2 text-red-700">{correction.original.replace('I ', '')}</span>{' '}
              <span className="bg-green-100 text-green-800 rounded px-1 font-medium">{correction.correction.replace('I ', '')}</span>{' '}
              from Universitas Indonesia in 2022.
            </div>
            <div className="w-8 h-8 rounded-full bg-accent-soft text-accent-strong flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-lg">mic</span>
            </div>
          </div>

          {/* Feedback card */}
          <div className="rounded-2xl border border-surface-container-high p-4">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-full bg-primary text-on-primary flex flex-col items-center justify-center shrink-0">
                <span className="text-lg font-bold leading-none">{overall}</span>
                <span className="text-[9px] uppercase tracking-wide opacity-80">skor</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-on-surface">Feedback jawaban</p>
                <p className="text-xs text-on-surface-variant">
                  {PREVIEW.corrections.length} koreksi grammar · {PREVIEW.fillerWords.length} filler words
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <ScoreBar label="Grammar" value={PREVIEW.scores.grammar} />
              <ScoreBar label="Vocabulary" value={PREVIEW.scores.vocabulary} />
              <ScoreBar label="Relevansi" value={PREVIEW.scores.relevance} />
              <ScoreBar label="Koherensi" value={PREVIEW.scores.coherence} />
            </div>
          </div>
        </div>
      </div>

      {/* Floating tip */}
      <div className="hidden sm:flex absolute -left-6 -bottom-6 items-center gap-2 bg-accent text-on-accent text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg">
        <span className="material-symbols-outlined text-base">lightbulb</span>
        Contoh jawaban lebih baik tersedia
      </div>

      <figcaption className="sr-only">Ilustrasi tampilan aplikasi, bukan data pengguna nyata.</figcaption>
    </figure>
  );
}

/**
 * Hero section with headline, CTAs, product preview, and tech strip
 */
export function HeroSection({
  id,
  className,
  onStartPractice,
  demoSectionId = 'feedback-demo',
}: HeroSectionProps) {
  const handleSeeDemo = () => {
    document.getElementById(demoSectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section
      id={id}
      className={`relative overflow-hidden px-4 pt-12 pb-20 md:pt-20 md:pb-28 bg-gradient-to-b from-primary-fixed/40 via-surface to-surface ${className || ''}`}
    >
      {/* Decorative background */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-0 w-[28rem] h-[28rem] rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-[28rem] h-[28rem] rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto grid lg:grid-cols-[1.15fr_1fr] gap-14 lg:gap-10 items-center">
        {/* Copy */}
        <div className="text-center lg:text-left space-y-7">
          <span className="inline-flex items-center gap-2 bg-surface-container-lowest/80 ring-1 ring-primary/10 text-primary text-xs md:text-sm font-semibold px-4 py-1.5 rounded-full shadow-sm">
            <span className="material-symbols-outlined text-base text-accent-strong">auto_awesome</span>
            Latihan Interview Bahasa Inggris dengan AI
          </span>

          <h1 className="font-headline text-4xl md:text-5xl xl:text-[3.5rem] font-extrabold text-on-surface leading-[1.1] tracking-tight">
            Jawab interview bahasa Inggris dengan{' '}
            <span className="relative whitespace-nowrap text-primary">
              percaya diri
              <svg aria-hidden="true" viewBox="0 0 200 12" preserveAspectRatio="none" className="absolute left-0 -bottom-2 w-full h-3 text-accent">
                <path d="M2 9c40-6 120-8 196-3" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
              </svg>
            </span>
          </h1>

          <p className="text-lg text-on-surface-variant max-w-xl mx-auto lg:mx-0 leading-relaxed">
            AI interviewer bertanya sesuai posisi yang Anda incar. Setelah setiap jawaban, Anda
            langsung mendapat koreksi grammar, skor, dan contoh jawaban yang lebih baik.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
            <button
              type="button"
              onClick={onStartPractice}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap px-6 py-4 bg-primary text-on-primary font-semibold rounded-full hover:bg-primary-container transition-colors shadow-lg shadow-primary/20 text-base md:text-lg"
            >
              {PRIMARY_CTA_LABEL}
              <span className="material-symbols-outlined text-xl" aria-hidden="true">arrow_forward</span>
            </button>
            <button
              type="button"
              onClick={handleSeeDemo}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap px-6 py-4 bg-surface-container-lowest text-primary font-semibold rounded-full ring-1 ring-outline-variant hover:ring-primary/40 hover:bg-primary-fixed/30 transition text-base md:text-lg"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">play_circle</span>
              Lihat Contoh Feedback
            </button>
          </div>

          <p className="flex flex-wrap justify-center lg:justify-start gap-x-4 gap-y-1 text-sm text-on-surface-variant">
            <span className="inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-base text-green-600" aria-hidden="true">check_circle</span>
              Tanpa kartu kredit
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-base text-green-600" aria-hidden="true">check_circle</span>
              5 sesi gratis per bulan
            </span>
          </p>
        </div>

        {/* Product preview */}
        <InterviewPreview />
      </div>

      {/* Built with strip */}
      <div className="relative max-w-6xl mx-auto mt-16 md:mt-20 flex flex-col md:flex-row items-center gap-4 md:gap-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant shrink-0">Dibangun dengan</p>
        <ul className="flex flex-wrap justify-center md:justify-start gap-2">
          {TECH_STACK.map((tech) => (
            <li
              key={tech.id}
              title={tech.description}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-lowest ring-1 ring-outline-variant/60 text-sm text-on-surface"
            >
              <span className="material-symbols-outlined text-base text-primary" aria-hidden="true">{tech.icon}</span>
              {tech.name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
