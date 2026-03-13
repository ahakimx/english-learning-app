import fc from 'fast-check';

// Mock AWS SDK clients before importing handler
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({ send: mockSend })),
  },
  PutCommand: jest.fn((params: unknown) => ({ _type: 'PutCommand', params })),
  GetCommand: jest.fn((params: unknown) => ({ _type: 'GetCommand', params })),
  UpdateCommand: jest.fn((params: unknown) => ({ _type: 'UpdateCommand', params })),
}));

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => ({ send: mockSend })),
  InvokeModelCommand: jest.fn((params: unknown) => ({ _type: 'InvokeModelCommand', params })),
}));

import { buildContextualPrompt } from '../lambda/chat/index';
import { SeniorityLevel, QuestionCategory } from '../lib/types';

// --- Shared generators ---

const seniorityArb = fc.constantFrom<SeniorityLevel>('junior', 'mid', 'senior', 'lead');
const categoryArb = fc.constantFrom<QuestionCategory>('general', 'technical');

// Printable non-empty strings for readable test output
const nonEmptyStringArb = fc.stringOf(
  fc.char().filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127 && c.trim().length > 0),
  { minLength: 1, maxLength: 60 }
);

const jobPositionArb = nonEmptyStringArb;

const previousQuestionsArb = fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 5 });

// ============================================================================
// Feature: interview-flow-restructure, Property 4: Contextual prompt uses most recent available transcription
// **Validates: Requirements 2.3, 3.1, 3.3, 5.1**
// ============================================================================
describe('Feature: interview-flow-restructure, Property 4: Contextual prompt uses most recent available transcription', () => {
  test('For any session with at least one transcription, the most recent available transcription appears in the prompt output', () => {
    // Generator: array of questions where at least one has a transcription
    const questionWithTranscriptionArb = fc.record({
      questionText: nonEmptyStringArb,
      transcription: nonEmptyStringArb,
    });

    const questionWithoutTranscriptionArb = fc.record({
      questionText: nonEmptyStringArb,
      transcription: fc.constant(undefined),
    });

    const questionMixedArb = fc.oneof(
      questionWithTranscriptionArb,
      questionWithoutTranscriptionArb
    ) as fc.Arbitrary<{ questionText: string; transcription?: string }>;

    // Ensure at least 1 question has a transcription by prepending one
    const questionsWithAtLeastOneTranscriptionArb = fc.tuple(
      questionWithTranscriptionArb,
      fc.array(questionMixedArb, { minLength: 0, maxLength: 9 })
    ).map(([guaranteed, rest]) => {
      // Shuffle the guaranteed transcription into a random position
      const all = [...rest, guaranteed];
      // We don't shuffle to keep it deterministic — the guaranteed one is at the end
      // but we can place it anywhere. Let's just use the array as-is since
      // the property should hold regardless of position.
      return all;
    });

    fc.assert(
      fc.property(
        jobPositionArb,
        seniorityArb,
        categoryArb,
        questionsWithAtLeastOneTranscriptionArb,
        previousQuestionsArb,
        (jobPosition, seniority, category, questions, previousQuestions) => {
          const result = buildContextualPrompt(
            jobPosition,
            seniority,
            category,
            questions,
            previousQuestions
          );

          // Find the most recent question with a transcription
          const answeredPairs = questions.filter(
            (q) => q.transcription !== undefined && q.transcription !== ''
          );
          const mostRecentTranscription = answeredPairs[answeredPairs.length - 1].transcription!;

          // The prompt must contain the most recent available transcription
          expect(result).toContain(mostRecentTranscription);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Feature: interview-flow-restructure, Property 5: No-transcription fallback produces general position prompt
// **Validates: Requirements 3.2, 5.2**
// ============================================================================
describe('Feature: interview-flow-restructure, Property 5: No-transcription fallback produces general position prompt', () => {
  test('For any session where no questions have transcriptions, the prompt contains jobPosition and seniorityLevel but no Q&A pairs', () => {
    // Generator: array of questions with NO transcriptions
    const questionNoTranscriptionArb = fc.record({
      questionText: nonEmptyStringArb,
      transcription: fc.constant(undefined as string | undefined),
    });

    const questionsNoTranscriptionArb = fc.array(questionNoTranscriptionArb, {
      minLength: 1,
      maxLength: 10,
    });

    fc.assert(
      fc.property(
        jobPositionArb,
        seniorityArb,
        categoryArb,
        questionsNoTranscriptionArb,
        previousQuestionsArb,
        (jobPosition, seniority, category, questions, previousQuestions) => {
          const result = buildContextualPrompt(
            jobPosition,
            seniority,
            category,
            questions,
            previousQuestions
          );

          // Prompt must contain jobPosition and seniorityLevel
          expect(result).toContain(jobPosition);
          expect(result).toContain(seniority);

          // Prompt must NOT contain Q&A pair patterns
          const qaPairPattern = /Q\d+:/;
          expect(result).not.toMatch(qaPairPattern);

          const answerPattern = /A\d+:/;
          expect(result).not.toMatch(answerPattern);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Feature: interview-flow-restructure, Property 6: Contextual prompt caps Q&A pairs at 3
// **Validates: Requirements 5.3**
// ============================================================================
describe('Feature: interview-flow-restructure, Property 6: Contextual prompt caps Q&A pairs at 3', () => {
  test('For any session with 1-10 questions that have transcriptions, the prompt contains at most 3 Q&A pairs', () => {
    // Generator: array of questions where ALL have transcriptions
    const questionWithTranscriptionArb = fc.record({
      questionText: nonEmptyStringArb,
      transcription: nonEmptyStringArb,
    });

    const questionsAllTranscribedArb = fc.array(questionWithTranscriptionArb, {
      minLength: 1,
      maxLength: 10,
    });

    fc.assert(
      fc.property(
        jobPositionArb,
        seniorityArb,
        categoryArb,
        questionsAllTranscribedArb,
        previousQuestionsArb,
        (jobPosition, seniority, category, questions, previousQuestions) => {
          const result = buildContextualPrompt(
            jobPosition,
            seniority,
            category,
            questions,
            previousQuestions
          );

          // Count Q&A pair patterns in the output
          const qaMatches = result.match(/Q\d+:/g) || [];
          const answerMatches = result.match(/A\d+:/g) || [];

          // Must have at most 3 Q&A pairs
          expect(qaMatches.length).toBeLessThanOrEqual(3);
          expect(answerMatches.length).toBeLessThanOrEqual(3);

          // Q and A counts should match
          expect(qaMatches.length).toBe(answerMatches.length);

          // When there are more than 3 questions, exactly 3 pairs should appear
          if (questions.length > 3) {
            expect(qaMatches.length).toBe(3);
          } else {
            // When 3 or fewer, all should appear
            expect(qaMatches.length).toBe(questions.length);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
