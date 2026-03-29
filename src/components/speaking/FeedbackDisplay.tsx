import type { FeedbackReport } from '../../types';

interface FeedbackDisplayProps {
  feedbackReport: FeedbackReport;
}

const criteriaLabels: Record<string, string> = {
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  relevance: 'Relevance',
  fillerWords: 'Filler Words',
  coherence: 'Coherence',
};

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-tertiary';
  if (score >= 60) return 'bg-primary-fixed-dim';
  if (score >= 40) return 'bg-outline';
  return 'bg-error';
}

function scoreTextColor(score: number): string {
  if (score >= 80) return 'text-tertiary';
  if (score >= 60) return 'text-primary';
  if (score >= 40) return 'text-outline';
  return 'text-error';
}

function scoreBadgeLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Needs Improvement';
}

function scoreBadgeStyle(score: number): string {
  if (score >= 80) return 'bg-tertiary-container text-on-tertiary-container';
  if (score >= 60) return 'bg-primary-fixed text-primary';
  if (score >= 40) return 'bg-surface-container-high text-on-surface-variant';
  return 'bg-error-container text-on-error-container';
}

export default function FeedbackDisplay({ feedbackReport }: FeedbackDisplayProps) {
  const { scores, grammarErrors, fillerWordsDetected, suggestions, improvedAnswer } = feedbackReport;

  // SVG circular progress calculations
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (scores.overall / 100) * circumference;

  return (
    <div className="space-y-12" data-testid="feedback-display">
      {/* Hero Results Section: Asymmetric Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Score Card */}
        <div className="lg:col-span-4 bg-surface-container-lowest p-8 rounded-xl shadow-sm flex flex-col items-center justify-center text-center">
          <span className="text-xs font-bold text-primary tracking-[0.2em] uppercase mb-6">Overall Performance</span>
          <div className="relative w-48 h-48 flex items-center justify-center" data-testid="overall-score">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                className="text-surface-container"
                cx="96" cy="96" r={radius}
                fill="transparent" stroke="currentColor" strokeWidth="12"
              />
              <circle
                className={scoreTextColor(scores.overall)}
                cx="96" cy="96" r={radius}
                fill="transparent" stroke="currentColor" strokeWidth="12"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="font-headline text-5xl font-extrabold text-on-surface">{scores.overall}</span>
              <span className="text-on-surface-variant font-semibold">/100</span>
            </div>
          </div>
          <div className="mt-8">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${scoreBadgeStyle(scores.overall)}`}>
              {scoreBadgeLabel(scores.overall)}
            </span>
          </div>
        </div>

        {/* Criteria Breakdown */}
        <div className="lg:col-span-8 bg-surface-container-low p-8 rounded-xl">
          <h3 className="font-headline text-lg font-bold text-primary mb-6">Performance Breakdown</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
            {Object.entries(criteriaLabels).map(([key, label]) => {
              const score = scores[key as keyof typeof scores];
              const isLast = key === 'coherence';
              return (
                <div key={key} className={`space-y-2 ${isLast ? 'md:col-span-2' : ''}`}>
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-semibold text-on-surface">{label}</span>
                    <span className={`font-bold ${scoreTextColor(score)}`}>{score}</span>
                  </div>
                  <div
                    className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={score}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${label} score`}
                  >
                    <div className={`h-full ${scoreColor(score)} rounded-full`} style={{ width: `${score}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Speech Analysis Waveform */}
          <div className="mt-10 p-4 bg-surface-container-lowest rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-symbols-outlined text-primary text-sm">mic</span>
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Speech Analysis</span>
            </div>
            <div className="flex items-end gap-1 h-12 w-full">
              {[4, 8, 10, 6, 12, 8, 4, 10, 6, 12, 12, 8, 4, 10, 6, 12].map((h, i) => (
                <div key={i} className={`w-1 rounded-full ${i % 3 === 2 ? 'bg-tertiary-fixed' : 'bg-primary-fixed-dim'}`} style={{ height: `${(h / 12) * 100}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Deep Dive Content */}
      <div className="space-y-12">
        {/* Suggestions Section */}
        {suggestions.length > 0 && (
          <section>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 rounded bg-secondary-container flex items-center justify-center">
                <span className="material-symbols-outlined text-primary">lightbulb</span>
              </div>
              <h3 className="font-headline text-2xl font-bold text-on-surface">Saran Perbaikan</h3>
            </div>
            <ul className="space-y-4" data-testid="suggestions-list">
              {suggestions.map((s, i) => {
                const isWarning = i % 2 !== 0;
                return (
                  <li key={i} className={`p-5 bg-surface-container-low border-l-4 ${isWarning ? 'border-error' : 'border-primary'} rounded-r-xl flex gap-4 list-none`}>
                    <span className={`material-symbols-outlined ${isWarning ? 'text-error' : 'text-primary'} mt-1`}>
                      {isWarning ? 'warning' : 'check_circle'}
                    </span>
                    <div>
                      <p className="text-sm text-on-surface-variant leading-relaxed">{s}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Grammar Errors */}
        {grammarErrors.length > 0 && (
          <section>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 rounded bg-error-container flex items-center justify-center">
                <span className="material-symbols-outlined text-error">spellcheck</span>
              </div>
              <h3 className="font-headline text-2xl font-bold text-on-surface">Kesalahan Grammar</h3>
            </div>
            <ul className="space-y-4" data-testid="grammar-errors-list">
              {grammarErrors.map((err, i) => (
                <li key={i} className="p-5 bg-error-container border border-error/20 rounded-xl list-none">
                  <p className="text-sm">
                    <span className="line-through text-error">{err.original}</span>
                    {' → '}
                    <span className="font-medium text-tertiary">{err.correction}</span>
                  </p>
                  <p className="text-on-surface-variant mt-1 text-xs">{err.rule}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Filler Words */}
        {fillerWordsDetected.length > 0 && (
          <section>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 rounded bg-secondary-container flex items-center justify-center">
                <span className="material-symbols-outlined text-secondary">record_voice_over</span>
              </div>
              <h3 className="font-headline text-2xl font-bold text-on-surface">Filler Words Terdeteksi</h3>
            </div>
            <div className="flex flex-wrap gap-2" data-testid="filler-words-list">
              {fillerWordsDetected.map((fw, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 bg-secondary-container rounded-full px-3 py-1 text-sm text-on-secondary-container"
                >
                  {fw.word}
                  <span className="bg-on-secondary-container text-secondary-container rounded-full px-1.5 text-xs font-medium">
                    {fw.count}×
                  </span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Improved Answer — Stitch bordered card */}
        {improvedAnswer && (
          <section>
            <div className="bg-primary p-1 rounded-xl shadow-lg shadow-primary-container/20">
              <div className="bg-surface-container-lowest rounded-lg p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-10 h-10 rounded bg-tertiary-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-tertiary-fixed">auto_awesome</span>
                  </div>
                  <div>
                    <h3 className="font-headline text-2xl font-bold text-on-surface">Contoh Jawaban yang Lebih Baik</h3>
                    <p className="text-sm text-on-surface-variant font-medium">Model jawaban tingkat profesional</p>
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute -left-4 top-0 bottom-0 w-1 bg-surface-container-high" />
                  <blockquote className="italic text-lg text-on-surface leading-loose pl-6" data-testid="improved-answer">
                    &ldquo;{improvedAnswer}&rdquo;
                  </blockquote>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
