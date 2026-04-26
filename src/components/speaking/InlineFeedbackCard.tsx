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
 * Maps a score (0–100) to a Tailwind color token.
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

function barColorClass(score: number): string {
  if (score >= 80) return 'bg-tertiary';
  if (score >= 60) return 'bg-primary';
  if (score >= 40) return 'bg-outline';
  return 'bg-error';
}

function textColorClass(score: number): string {
  if (score >= 80) return 'text-tertiary';
  if (score >= 60) return 'text-primary';
  if (score >= 40) return 'text-outline';
  return 'text-error';
}

export default function InlineFeedbackCard({
  feedbackReport,
  expanded,
  onToggleExpand,
}: InlineFeedbackCardProps) {
  const { scores, grammarErrors, fillerWordsDetected, suggestions, improvedAnswer } =
    feedbackReport;

  const [grammarExpanded, setGrammarExpanded] = useState(false);

  return (
    <div
      className="mx-2 my-2 bg-surface-container-low border border-outline-variant/20 rounded-xl overflow-hidden"
      data-testid="inline-feedback-card"
    >
      {/* Compact header — always visible */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-container/60 transition-colors"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        data-testid="feedback-toggle"
      >
        <span className="material-symbols-outlined text-sm text-primary">assessment</span>
        <span className="text-xs font-bold text-primary uppercase tracking-wider">Feedback</span>

        {/* Overall score badge */}
        <span
          className={`ml-auto text-lg font-headline font-extrabold ${textColorClass(scores.overall)}`}
          data-testid="overall-score"
        >
          {scores.overall}
        </span>
        <span className="text-[10px] text-on-surface-variant">/100</span>

        <span
          className={`material-symbols-outlined text-on-surface-variant text-sm transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          expand_more
        </span>
      </button>

      {/* Expanded detail section */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4" data-testid="feedback-details">
          {/* Criteria scores */}
          <div className="space-y-2" data-testid="criteria-scores">
            {Object.entries(criteriaLabels).map(([key, label]) => {
              const score = scores[key as keyof typeof scores];
              return (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-on-surface">{label}</span>
                    <span className={`text-xs font-bold ${textColorClass(score)}`}>{score}</span>
                  </div>
                  <div
                    className="h-1 w-full bg-surface-container-highest rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={score}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${label} score`}
                  >
                    <div
                      className={`h-full ${barColorClass(score)} rounded-full`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Grammar errors — collapsible */}
          {grammarErrors.length > 0 && (
            <div data-testid="grammar-errors-section">
              <button
                type="button"
                className="flex items-center gap-2 w-full text-left py-1"
                onClick={() => setGrammarExpanded((prev) => !prev)}
                aria-expanded={grammarExpanded}
                data-testid="grammar-errors-toggle"
              >
                <span className="material-symbols-outlined text-error text-sm">spellcheck</span>
                <span className="text-xs font-bold text-on-surface">
                  Grammar Errors ({grammarErrors.length})
                </span>
                <span
                  className={`material-symbols-outlined text-on-surface-variant text-sm ml-auto transition-transform ${grammarExpanded ? 'rotate-180' : ''}`}
                >
                  expand_more
                </span>
              </button>

              {grammarExpanded && (
                <ul className="mt-1 space-y-2" data-testid="grammar-errors-list">
                  {grammarErrors.map((err, i) => (
                    <li
                      key={i}
                      className="p-2 bg-error-container/40 border border-error/10 rounded-lg text-xs list-none"
                    >
                      <p>
                        <span className="line-through text-error">{err.original}</span>
                        {' → '}
                        <span className="font-medium text-tertiary">{err.correction}</span>
                      </p>
                      <p className="text-on-surface-variant mt-0.5">{err.rule}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Filler words */}
          {fillerWordsDetected.length > 0 && (
            <div data-testid="filler-words-section">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-secondary text-sm">
                  record_voice_over
                </span>
                <span className="text-xs font-bold text-on-surface">Filler Words</span>
              </div>
              <div className="flex flex-wrap gap-1" data-testid="filler-words-list">
                {fillerWordsDetected.map((fw, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 bg-secondary-container rounded-full px-2 py-0.5 text-[11px] text-on-secondary-container"
                  >
                    {fw.word}
                    <span className="bg-on-secondary-container text-secondary-container rounded-full px-1 text-[10px] font-medium">
                      {fw.count}×
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div data-testid="suggestions-section">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-primary text-sm">lightbulb</span>
                <span className="text-xs font-bold text-on-surface">Suggestions</span>
              </div>
              <ul className="space-y-1" data-testid="suggestions-list">
                {suggestions.map((s, i) => (
                  <li
                    key={i}
                    className="text-xs text-on-surface-variant pl-3 border-l-2 border-primary/30 list-none"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Improved answer */}
          {improvedAnswer && (
            <div data-testid="improved-answer-section">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-tertiary text-sm">
                  auto_awesome
                </span>
                <span className="text-xs font-bold text-on-surface">Improved Answer</span>
              </div>
              <blockquote
                className="text-xs text-on-surface-variant italic pl-3 border-l-2 border-tertiary/30 leading-relaxed"
                data-testid="improved-answer"
              >
                &ldquo;{improvedAnswer}&rdquo;
              </blockquote>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
