import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { ChatRequest, SeniorityLevel, QuestionCategory } from './index';

/**
 * Feature: interview-position-enhancement
 * Property 10: ChatRequest type accepts valid seniority and category values
 *
 * Validates: Requirements 5.1, 5.2
 */
describe('Feature: interview-position-enhancement, Property 10: ChatRequest type accepts valid seniority and category values', () => {
  const validSeniorityLevels: SeniorityLevel[] = ['junior', 'mid', 'senior', 'lead'];
  const validQuestionCategories: QuestionCategory[] = ['general', 'technical'];

  it('should accept any valid seniority level on ChatRequest.seniorityLevel', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...validSeniorityLevels),
        (seniority: SeniorityLevel) => {
          const request: ChatRequest = {
            action: 'start_session',
            seniorityLevel: seniority,
          };
          expect(request.seniorityLevel).toBe(seniority);
          expect(validSeniorityLevels).toContain(request.seniorityLevel);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should accept any valid question category on ChatRequest.questionCategory', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...validQuestionCategories),
        (category: QuestionCategory) => {
          const request: ChatRequest = {
            action: 'start_session',
            questionCategory: category,
          };
          expect(request.questionCategory).toBe(category);
          expect(validQuestionCategories).toContain(request.questionCategory);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should accept any valid combination of seniority level and question category', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...validSeniorityLevels),
        fc.constantFrom(...validQuestionCategories),
        (seniority: SeniorityLevel, category: QuestionCategory) => {
          const request: ChatRequest = {
            action: 'start_session',
            jobPosition: 'software-engineer',
            seniorityLevel: seniority,
            questionCategory: category,
          };
          expect(request.seniorityLevel).toBe(seniority);
          expect(request.questionCategory).toBe(category);
          expect(validSeniorityLevels).toContain(request.seniorityLevel);
          expect(validQuestionCategories).toContain(request.questionCategory);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should allow seniorityLevel and questionCategory to be omitted (optional fields)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ChatRequest['action']>(
          'start_session', 'analyze_answer', 'next_question', 'end_session',
          'grammar_quiz', 'grammar_explain', 'writing_prompt', 'writing_review',
        ),
        (action) => {
          const request: ChatRequest = { action };
          expect(request.seniorityLevel).toBeUndefined();
          expect(request.questionCategory).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });
});
