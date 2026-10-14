/**
 * FeedbackDemoSection Component
 *
 * Interactive showcase of the feedback a learner gets after one answer:
 * - Tabs for common interview questions
 * - Original answer, scores, grammar corrections, filler words
 * - Improved answer and tips
 *
 * Content is illustrative (FEEDBACK_EXAMPLES) and labelled as such.
 */

import { useState } from 'react';
import { FEEDBACK_EXAMPLES, PRIMARY_CTA_LABEL } from './data';
import type { SectionProps, FeedbackExample } from './types';

interface FeedbackDemoSectionProps extends SectionProps {
  /** Callback for the CTA below the demo */
  onCTAClick: () => void;
  /** Optional examples override - defaults to FEEDBACK_EXAMPLES */
  examples?: FeedbackExample[];
}

const SCORE_LABELS: Record<keyof FeedbackExample['scores'], string> = {
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  relevance: 'Relevansi',
  coherence: 'Koherensi',
};

function scoreColor(value: number): string {
  if (value >= 80) return 'bg-green-600';
  if (value >= 65) return 'bg-accent';
  return 'bg-red-500';
}

function ExamplePanel({ example }: { example: FeedbackExample }) {
  return (
    <div className="grid lg:grid-cols-5 gap-6">
      {/* Left: question, answer, scores */}
      <div className="lg:col-span-2 space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">Pertanyaan</p>
          <p className="font-headline text-lg font-bold text-on-surface">“{example.question}”</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">Jawaban Anda</p>
          <p className="text-on-surface-variant leading-relaxed bg-surface-container-low rounded-xl p-4 text-sm">
            {example.answer}
          </p>
        </div>

        <div className="space-y-3">
          {(Object.keys(SCORE_LABELS) as (keyof FeedbackExample['scores'])[]).map((key) => (
            <div key={key}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-on-surface-variant">{SCORE_LABELS[key]}</span>
                <span className="font-semibold text-on-surface">{example.scores[key]}/100</span>
              </div>
              <div className="h-2 rounded-full bg-surface-container-high">
                <div
                  className={`h-2 rounded-full ${scoreColor(example.scores[key])} transition-[width] duration-500`}
                  style={{ width: `${example.scores[key]}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {example.fillerWords.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">Filler words</p>
            <div className="flex flex-wrap gap-2">
              {example.fillerWords.map((f) => (
                <span key={f.word} className="text-xs font-medium bg-accent-soft text-accent-strong px-2.5 py-1 rounded-full">
                  “{f.word}” × {f.count}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: corrections, improved answer, tips */}
      <div className="lg:col-span-3 space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">
            Koreksi grammar ({example.corrections.length})
          </p>
          <ul className="space-y-2">
            {example.corrections.map((c) => (
              <li key={c.original} className="rounded-xl border border-surface-container-high p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="line-through decoration-red-500 decoration-2 text-red-700">{c.original}</span>
                  <span className="material-symbols-outlined text-base text-on-surface-variant" aria-hidden="true">arrow_forward</span>
                  <span className="bg-green-100 text-green-800 font-medium rounded px-1.5">{c.correction}</span>
                </div>
                <p className="text-xs text-on-surface-variant mt-1.5">{c.rule}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl bg-primary text-on-primary p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary-fixed-dim mb-2">
            <span className="material-symbols-outlined text-base" aria-hidden="true">auto_awesome</span>
            Contoh jawaban yang lebih baik
          </p>
          <p className="leading-relaxed text-sm md:text-base">{example.improvedAnswer}</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">Tips</p>
          <ul className="space-y-2">
            {example.tips.map((tip) => (
              <li key={tip} className="flex gap-2 text-sm text-on-surface">
                <span className="material-symbols-outlined text-base text-accent-strong mt-0.5" aria-hidden="true">lightbulb</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function FeedbackDemoSection({
  id,
  className,
  onCTAClick,
  examples = FEEDBACK_EXAMPLES,
}: FeedbackDemoSectionProps) {
  const [activeId, setActiveId] = useState(examples[0]?.id);
  const active = examples.find((e) => e.id === activeId) ?? examples[0];

  if (!active) {
    return null;
  }

  return (
    <section id={id} className={`py-16 md:py-24 px-4 bg-surface-container-low scroll-mt-16 ${className || ''}`}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-sm font-semibold text-accent-strong mb-3">Contoh Feedback</p>
          <h2 className="font-headline text-3xl md:text-4xl font-bold text-on-surface mb-4">
            Lihat apa yang Anda dapat setelah satu jawaban
          </h2>
          <p className="text-on-surface-variant max-w-2xl mx-auto">
            Pilih pertanyaan interview di bawah. Ini contoh feedback yang muncul setelah Anda menjawab.
          </p>
        </div>

        {/* Tabs */}
        <div role="tablist" aria-label="Contoh pertanyaan interview" className="flex gap-2 overflow-x-auto pb-2 mb-6 md:justify-center">
          {examples.map((e) => {
            const selected = e.id === active.id;
            return (
              <button
                key={e.id}
                type="button"
                role="tab"
                id={`tab-${e.id}`}
                aria-selected={selected}
                aria-controls={`panel-${e.id}`}
                onClick={() => setActiveId(e.id)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                  selected
                    ? 'bg-primary text-on-primary shadow-md'
                    : 'bg-surface-container-lowest text-on-surface-variant ring-1 ring-outline-variant hover:text-primary'
                }`}
              >
                {e.label}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`panel-${active.id}`}
          aria-labelledby={`tab-${active.id}`}
          className="bg-surface-container-lowest rounded-3xl shadow-sm ring-1 ring-black/5 p-5 md:p-8"
        >
          <ExamplePanel example={active} />
        </div>

        <p className="text-center text-xs text-on-surface-variant mt-4">
          Contoh ilustrasi. Feedback asli dibuat oleh AI berdasarkan jawaban Anda sendiri.
        </p>

        <div className="text-center mt-8">
          <button
            type="button"
            onClick={onCTAClick}
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary text-on-primary font-semibold rounded-full hover:bg-primary-container transition-colors shadow-md"
          >
            {PRIMARY_CTA_LABEL}
            <span className="material-symbols-outlined text-xl" aria-hidden="true">arrow_forward</span>
          </button>
        </div>
      </div>
    </section>
  );
}
