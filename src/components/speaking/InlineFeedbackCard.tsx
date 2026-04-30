import { useState } from 'react';
import type { InlineFeedbackCardProps } from '../../types';

const criteriaLabels: Record<string, string> = {
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  relevance: 'Relevance',
  fillerWords: 'Filler Words',
  coherence: 'Coherence',
};

/**
 * Maps a score (0–100) to a semantic color name.
 *   >= 80 → green (tertiary)
 *   >= 60 → blue (primary)
 *   >= 40 → gray (outline)
 *    < 40 → red (error)
 */
export function scoreColor(score: number): string {
  if (score >= 80) return 'green';
  if (score >= 60) return 'blue';
  if (score >= 40) return 'gray';
  return 'red';
}

/** Bar color class based on score, with special handling for filler words */
function barColorClass(score: number, isFillerWords = false): string {
  if (isFillerWords && score < 60) return 'bg-error';
  if (score >= 80) return 'bg-tertiary';
  if (score >= 60) return 'bg-primary';
  if (score >= 40) return 'bg-outline';
  return 'bg-error';
}

/** Text color class based on score, with special handling for filler words */
function textColorClass(score: number, isFillerWords = false): string {
  if (isFillerWords && score < 60) return 'text-error';
  if (score >= 80) return 'text-tertiary';
  if (score >= 60) return 'text-primary';
  if (score >= 40) return 'text-outline';
  return 'text-error';
}

/** Category badge color mapping for collapsed state */
function badgeStyle(key: string, score: number): string {
  if (score >= 80) return 'bg-tertiary-container text-tertiary-fixed';
  if (key === 'fillerWords' && score < 60) return 'bg-error-container text-on-error-container';
  return 'bg-secondary-container text-on-secondary-container';
}

/** Short label for category badges */
const badgeLabels: Record<string, string> = {
  grammar: 'Grammar',
  vocabulary: 'Vocab',
  relevance: 'Relevance',
  fillerWords: 'Filler',
  coherence: 'Coherence',
};

/** Guess a category label for grammar corrections based on the rule text */
function correctionCategoryLabel(rule: string): string {
  const lower = rule.toLowerCase();
  if (lower.includes('tone') || lower.includes('formal') || lower.includes('professional')) return 'Professional Tone';
  if (lower.includes('agreement') || lower.includes('subject')) return 'Subject-Verb';
  if (lower.includes('verb') || lower.includes('action')) return 'Action Verbs';
  if (lower.includes('comparative') || lower.includes('superlative')) return 'Comparatives';
  if (lower.includes('tense')) return 'Verb Tense';
  return 'Grammar';
}

/** SVG circular score indicator */
function CircularScore({ score, size }: { score: number; size: 'sm' | 'lg' }) {
  const dim = size === 'sm' ? 48 : 64;
  const cx = dim / 2;
  const cy = dim / 2;
  const strokeWidth = size === 'sm' ? 4 : 4;
  const r = cx - strokeWidth - 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const gradientId = `score-grad-${size}`;

  return (
    <div className={`relative flex items-center justify-center`} style={{ width: dim, height: dim }}>
      <svg className="w-full h-full transform -rotate-90" viewBox={`0 0 ${dim} ${dim}`}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#003461" />
            <stop offset="100%" stopColor="#49d08f" />
          </linearGradient>
        </defs>
        <circle
          className="text-surface-variant"
          cx={cx} cy={cy} r={r}
          fill="transparent" stroke="currentColor" strokeWidth={strokeWidth}
        />
        <circle
          cx={cx} cy={cy} r={r}
          fill="transparent"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className={`absolute font-extrabold text-primary ${size === 'sm' ? 'text-[10px]' : 'text-sm'}`}>
        {score}
      </span>
    </div>
  );
}

export default function InlineFeedbackCard({
  feedbackReport,
  expanded,
  onToggleExpand,
}: InlineFeedbackCardProps) {
  const { scores, grammarErrors, fillerWordsDetected, suggestions, improvedAnswer } =
    feedbackReport;

  const [grammarExpanded, setGrammarExpanded] = useState(false);

  // --- COLLAPSED STATE ---
  if (!expanded) {
    return (
      <div
        className="mx-2 my-2 bg-surface-container-lowest rounded-lg overflow-hidden"
        style={{ boxShadow: '0 10px 24px -4px rgba(25, 28, 29, 0.04)' }}
        data-testid="inline-feedback-card"
      >
        <button
          type="button"
          className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-surface-container/60 transition-colors group cursor-pointer"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          data-testid="feedback-toggle"
        >
          <div className="flex items-center gap-6 flex-1 min-w-0">
            {/* Circular score indicator */}
            <CircularScore score={scores.overall} size="sm" />

            {/* Category badges */}
            <div className="flex gap-2 flex-wrap" data-testid="overall-score">
              {Object.entries(badgeLabels).map(([key, label]) => {
                const score = scores[key as keyof typeof scores];
                return (
                  <span
                    key={key}
                    className={`px-2 py-1 text-[10px] rounded-md font-semibold ${badgeStyle(key, score)}`}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Show Details button */}
          <span className="text-primary text-xs font-bold flex items-center gap-1 group-hover:underline whitespace-nowrap">
            Show Details
            <span className="material-symbols-outlined text-sm">expand_more</span>
          </span>
        </button>
      </div>
    );
  }

  // --- EXPANDED STATE ---
  return (
    <div
      className="mx-2 my-2 bg-surface-container-lowest rounded-lg border-l-4 border-primary overflow-hidden"
      style={{ boxShadow: '0 24px 48px -12px rgba(25, 28, 29, 0.08)' }}
      data-testid="inline-feedback-card"
    >
      {/* Expandable header */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-surface-container/60 transition-colors"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        data-testid="feedback-toggle"
      >
        <div className="flex items-center gap-6 flex-1">
          <CircularScore score={scores.overall} size="lg" />
          <div>
            <h4 className="text-primary font-headline font-bold" data-testid="overall-score">Session Analytics</h4>
            <p className="text-xs text-on-surface-variant">Overall Score: {scores.overall}</p>
          </div>
        </div>
        <span className="material-symbols-outlined text-on-surface-variant text-sm rotate-180">
          expand_more
        </span>
      </button>

      {/* Expanded detail section */}
      <div className="px-6 pb-6 space-y-6" data-testid="feedback-details">
        {/* 2-column criteria scores grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4" data-testid="criteria-scores">
          {Object.entries(criteriaLabels).map(([key, label]) => {
            const score = scores[key as keyof typeof scores];
            const isFiller = key === 'fillerWords';
            return (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-[11px] font-bold mb-1 uppercase tracking-wider">
                  <span className="text-on-surface">{label}</span>
                  <span className={textColorClass(score, isFiller)}>{score}%</span>
                </div>
                <div
                  className="h-1 w-full bg-surface-variant rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuenow={score}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${label} score`}
                >
                  <div
                    className={`h-full ${barColorClass(score, isFiller)} rounded-full`}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Grammar corrections — table style from stitch design */}
        {grammarErrors.length > 0 && (
          <div data-testid="grammar-errors-section">
            <button
              type="button"
              className="flex items-center gap-2 w-full text-left py-1 mb-2"
              onClick={() => setGrammarExpanded((prev) => !prev)}
              aria-expanded={grammarExpanded}
              data-testid="grammar-errors-toggle"
            >
              <span className="text-sm font-extrabold uppercase tracking-widest text-on-surface-variant">
                Grammar Corrections
              </span>
              <span className="text-xs text-on-surface-variant ml-1">({grammarErrors.length})</span>
              <span
                className={`material-symbols-outlined text-on-surface-variant text-sm ml-auto transition-transform ${grammarExpanded ? 'rotate-180' : ''}`}
              >
                expand_more
              </span>
            </button>

            {grammarExpanded && (
              <div className="bg-surface-container-low rounded-lg overflow-hidden" data-testid="grammar-errors-list">
                {grammarErrors.map((err, i) => (
                  <div
                    key={i}
                    role="listitem"
                    className={`p-4 flex items-center justify-between ${i < grammarErrors.length - 1 ? 'border-b border-white/20' : ''}`}
                  >
                    <div className="flex-1 space-y-1">
                      <span className="line-through text-on-surface-variant text-sm italic">
                        &ldquo;{err.original}&rdquo;
                      </span>
                      <div className="text-tertiary font-semibold text-sm">
                        &ldquo;{err.correction}&rdquo;
                      </div>
                    </div>
                    <div className="ml-4 px-3 py-1 bg-surface-container-highest rounded text-[10px] font-bold text-primary whitespace-nowrap">
                      {correctionCategoryLabel(err.rule)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Filler words detected — red accent border */}
        {fillerWordsDetected.length > 0 && (
          <div data-testid="filler-words-section">
            <div className="p-3 bg-error-container/20 rounded-lg border-l-2 border-error">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-error text-sm">record_voice_over</span>
                <span className="text-[10px] font-bold uppercase text-error">Filler Words Detected</span>
              </div>
              <div className="flex flex-wrap gap-1" data-testid="filler-words-list">
                {fillerWordsDetected.map((fw, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 bg-error-container rounded-full px-2 py-0.5 text-[11px] text-on-error-container font-medium"
                  >
                    &ldquo;{fw.word}&rdquo;
                    <span className="bg-error text-on-error rounded-full px-1 text-[10px] font-bold">
                      {fw.count}×
                    </span>
                  </span>
                ))}
              </div>
              <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
                Focus on pausing for a breath instead of vocalizing fillers during technical explanations.
              </p>
            </div>
          </div>
        )}

        {/* 3-column suggestion cards with border-left accent */}
        {suggestions.length > 0 && (
          <div data-testid="suggestions-section">
            <h5 className="text-sm font-extrabold uppercase tracking-widest text-on-surface-variant mb-3">
              Suggestions
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="suggestions-list">
              {suggestions.map((s, i) => {
                const titles = ['Executive Presence', 'Quantify Impact', 'STAR Method'];
                const title = titles[i % titles.length];
                return (
                  <div
                    key={i}
                    role="listitem"
                    className="p-4 bg-surface-container-low rounded-lg border-l-4 border-primary"
                  >
                    <p className="text-xs font-bold text-primary mb-2">{title}</p>
                    <p className="text-xs text-on-surface-variant leading-relaxed">{s}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Improved answer block */}
        {improvedAnswer && (
          <div data-testid="improved-answer-section">
            <div className="p-4 bg-tertiary/5 rounded-lg border border-tertiary-fixed-dim/20">
              <div className="flex items-center gap-2 mb-2 text-tertiary">
                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                <span className="text-xs font-black uppercase tracking-widest">Model Executive Answer</span>
              </div>
              <blockquote
                className="text-sm italic text-tertiary font-medium leading-relaxed"
                data-testid="improved-answer"
              >
                &ldquo;{improvedAnswer}&rdquo;
              </blockquote>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-4 pt-4 border-t border-surface-container">
          <button
            type="button"
            className="flex-1 bg-gradient-to-br from-primary to-primary-container text-white py-3 rounded-md font-bold text-sm shadow-md active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            data-testid="next-question-button"
          >
            Next Question
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
          <button
            type="button"
            className="px-6 py-3 border border-outline-variant text-on-surface-variant rounded-md font-bold text-sm hover:bg-surface-variant transition-colors"
            data-testid="end-session-inline-button"
          >
            End Session
          </button>
        </div>
      </div>
    </div>
  );
}
