/**
 * FAQSection Component
 *
 * Displays frequently asked questions in an accordion format
 * with single expansion behavior and smooth animations.
 *
 * Features:
 * - 6+ FAQ items as accordion
 * - Click question to expand/show answer
 * - Click again to collapse
 * - Single expansion at a time (clicking new collapses previous)
 * - Chevron icons rotate on expand/collapse
 * - Smooth expand/collapse animation
 * - Questions about: pricing, free tier, AI technology, data privacy, supported languages, cancellation
 * - ARIA attributes for accessibility
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import { useState } from 'react';
import { FAQ_ITEMS } from './data';
import type { SectionProps, FAQItem } from './types';

interface FAQSectionProps extends SectionProps {
  /** Optional FAQ items override - defaults to FAQ_ITEMS */
  faqs?: FAQItem[];
}

/**
 * Individual FAQ accordion item component
 */
function FAQAccordionItem({
  faq,
  isExpanded,
  onToggle,
  index,
}: {
  faq: FAQItem;
  isExpanded: boolean;
  onToggle: () => void;
  index: number;
}) {
  const answerId = `faq-answer-${index}`;
  const questionId = `faq-question-${index}`;

  return (
    <div
      className="border-b border-outline-variant last:border-b-0"
      data-testid={`faq-item-${index}`}
    >
      {/* Question header - clickable */}
      <button
        id={questionId}
        type="button"
        role="button"
        className="w-full flex items-center justify-between py-5 px-4 text-left hover:bg-surface-container-high/50 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={answerId}
      >
        <span className="text-base md:text-lg font-medium text-on-surface pr-4">
          {faq.question}
        </span>
        <span
          className={`material-symbols-outlined text-on-surface-variant flex-shrink-0 transition-transform duration-300 ease-in-out ${
            isExpanded ? 'rotate-180' : 'rotate-0'
          }`}
        >
          expand_more
        </span>
      </button>

      {/* Answer panel - expandable */}
      <div
        id={answerId}
        role="region"
        aria-labelledby={questionId}
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
        data-testid={`faq-answer-${index}`}
      >
        <div className="px-4 pb-5 pt-1">
          <p className="text-on-surface-variant leading-relaxed">
            {faq.answer}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * FAQ section with accordion behavior
 */
export function FAQSection({
  id,
  className,
  faqs = FAQ_ITEMS,
}: FAQSectionProps) {
  // Track which FAQ item is currently expanded (null = all collapsed)
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Toggle item expansion - clicking same item collapses, clicking new expands and collapses previous
  const toggleItem = (itemId: string) => {
    setExpandedId(expandedId === itemId ? null : itemId);
  };

  // Don't render if no FAQ items available
  if (!faqs || faqs.length === 0) {
    return null;
  }

  return (
    <section
      id={id}
      className={`py-16 md:py-24 px-4 bg-surface ${className || ''}`}
    >
      <div className="max-w-3xl mx-auto">
        {/* Section headline */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-on-surface mb-4">
            Pertanyaan Umum
          </h2>
          <p className="text-on-surface-variant max-w-xl mx-auto">
            Jawaban untuk pertanyaan yang sering diajukan tentang SpeakReady.
          </p>
        </div>

        {/* FAQ accordion container */}
        <div className="bg-surface-container rounded-2xl shadow-sm overflow-hidden">
          {faqs.map((faq, index) => (
            <FAQAccordionItem
              key={faq.id}
              faq={faq}
              isExpanded={expandedId === faq.id}
              onToggle={() => toggleItem(faq.id)}
              index={index}
            />
          ))}
        </div>

        {/* Contact CTA for more questions */}
        <div className="mt-8 text-center">
          <p className="text-on-surface-variant mb-3">
            Masih punya pertanyaan lain?
          </p>
          <a
            href="mailto:hello@interviewprep.pro"
            className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-medium transition-colors duration-200"
          >
            <span className="material-symbols-outlined text-xl">mail</span>
            <span>Hubungi Kami</span>
          </a>
        </div>
      </div>
    </section>
  );
}
