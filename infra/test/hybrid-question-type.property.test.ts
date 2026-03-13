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

import { determineQuestionType, buildContextualPrompt, routeAction } from '../lambda/chat/index';

// --- Generators ---

const printableStringArb = fc.stringOf(
  fc.char().filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127 && c.trim().length > 0),
  { minLength: 1, maxLength: 80 }
);

const answeredQuestionArb = fc.record({
  questionText: printableStringArb,
  transcription: printableStringArb,
  questionType: fc.constantFrom('contextual' as const, 'random' as const),
});

const unansweredQuestionArb = fc.record({
  questionText: printableStringArb,
  questionType: fc.constantFrom('contextual' as const, 'random' as const),
});

const seniorityArb = fc.constantFrom('junior' as const, 'mid' as const, 'senior' as const, 'lead' as const);
const categoryArb = fc.constantFrom('general' as const, 'technical' as const);

// ============================================================================
// Property 1: Contextual prompt includes labeled Q&A pairs capped at 3
// **Validates: Requirements 1.1, 6.1, 6.2**
// ============================================================================
describe('Feature: hybrid-interview-questions, Property 1: contextual prompt includes labeled Q&A pairs capped at 3', () => {
  test('For any session with 1-10 answered questions, buildContextualPrompt includes at most 3 labeled Q&A pairs', () => {
    fc.assert(
      fc.property(
        fc.array(answeredQuestionArb, { minLength: 1, maxLength: 10 }),
        printableStringArb,
        seniorityArb,
        categoryArb,
        (questions, jobPosition, seniority, category) => {
          const previousTexts = questions.map(q => q.questionText);
          const prompt = buildContextualPrompt(jobPosition, seniority, category, questions, previousTexts);

          const qLabels = prompt.match(/Q\d+:/g) || [];
          const aLabels = prompt.match(/A\d+:/g) || [];

          expect(qLabels.length).toBe(aLabels.length);
          expect(qLabels.length).toBeLessThanOrEqual(3);

          const expectedCount = Math.min(questions.length, 3);
          expect(qLabels.length).toBe(expectedCount);

          for (let i = 1; i <= qLabels.length; i++) {
            expect(prompt).toContain(`Q${i}:`);
            expect(prompt).toContain(`A${i}:`);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 2: Contextual prompt contains follow-up instructions
// **Validates: Requirements 1.2, 6.3**
// ============================================================================
describe('Feature: hybrid-interview-questions, Property 2: contextual prompt contains follow-up instructions', () => {
  test('For any non-empty conversation context, buildContextualPrompt contains follow-up instruction keywords', () => {
    fc.assert(
      fc.property(
        fc.array(answeredQuestionArb, { minLength: 1, maxLength: 10 }),
        printableStringArb,
        seniorityArb,
        categoryArb,
        (questions, jobPosition, seniority, category) => {
          const previousTexts = questions.map(q => q.questionText);
          const prompt = buildContextualPrompt(jobPosition, seniority, category, questions, previousTexts);

          expect(prompt).toContain('most recent answer');
          expect(prompt).toContain('follow-up question');

          const hasProbeDeeper = prompt.includes('Probes deeper');
          const hasClarification = prompt.includes('clarification');
          const hasRelatedAspect = prompt.includes('related aspect');
          expect(hasProbeDeeper || hasClarification || hasRelatedAspect).toBe(true);

          expect(prompt).toContain('Reference specific details');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 3: No-transcription fallback to random
// **Validates: Requirements 1.3**
// ============================================================================
describe('Feature: hybrid-interview-questions, Property 3: no-transcription fallback to random', () => {
  test('For any session where the last question has no transcription, determineQuestionType returns random', () => {
    fc.assert(
      fc.property(
        fc.array(answeredQuestionArb, { minLength: 0, maxLength: 8 }),
        unansweredQuestionArb,
        (answeredQuestions, lastQuestion) => {
          const questions = [
            ...answeredQuestions,
            { questionText: lastQuestion.questionText, questionType: lastQuestion.questionType, transcription: undefined as string | undefined },
          ];
          const result = determineQuestionType(questions);
          expect(result).toBe('random');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('For empty questions array, determineQuestionType returns random', () => {
    const result = determineQuestionType([]);
    expect(result).toBe('random');
  });
});

// ============================================================================
// Property 4: Random prompt contains previous questions, seniority, and category
// **Validates: Requirements 2.2, 2.3**
// ============================================================================
describe('Feature: hybrid-interview-questions, Property 4: random prompt contains previous questions, seniority, and category', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  test('For any valid combination, the random prompt sent to Bedrock contains previous questions, seniority, and category instruction', async () => {
    const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

    await fc.assert(
      fc.asyncProperty(
        printableStringArb,
        seniorityArb,
        categoryArb,
        fc.array(printableStringArb, { minLength: 1, maxLength: 5 }),
        async (jobPosition, seniority, category, previousQuestionTexts) => {
          jest.clearAllMocks();

          const questions = previousQuestionTexts.map((text, i) => ({
            questionId: `q${i}`,
            questionText: text,
            questionType: 'random' as const,
            ...(i < previousQuestionTexts.length - 1 ? { transcription: 'some answer' } : {}),
          }));

          mockSend.mockImplementation((command: { _type?: string }) => {
            if (command._type === 'GetCommand') {
              return Promise.resolve({
                Item: {
                  userId: 'test-user',
                  sessionId: 'session-1',
                  jobPosition,
                  seniorityLevel: seniority,
                  questionCategory: category,
                  questions,
                },
              });
            }
            if (command._type === 'InvokeModelCommand') {
              return Promise.resolve({
                body: new TextEncoder().encode(
                  JSON.stringify({ content: [{ text: 'A new question?' }] })
                ),
              });
            }
            return Promise.resolve({});
          });

          const response = await routeAction('test-user', {
            action: 'next_question',
            sessionId: 'session-1',
          });

          expect(response.questionType).toBe('random');

          expect(InvokeModelCommand).toHaveBeenCalledTimes(1);
          const bedrockCall = InvokeModelCommand.mock.calls[0][0];
          const body = JSON.parse(bedrockCall.body);
          const prompt: string = body.messages[0].content;

          expect(prompt).toContain(seniority);
          expect(prompt).toContain(jobPosition);

          for (const q of previousQuestionTexts) {
            expect(prompt).toContain(q);
          }

          if (category === 'general') {
            expect(prompt).toContain('behavioral');
          } else {
            expect(prompt).toContain('technical');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 5: Question type classification is always valid
// **Validates: Requirements 3.1, 7.1**
// ============================================================================
describe('Feature: hybrid-interview-questions, Property 5: question type classification is always valid', () => {
  test('For any questions array, determineQuestionType returns exactly contextual or random', () => {
    const questionArb = fc.record({
      questionType: fc.option(fc.constantFrom('contextual' as const, 'random' as const), { nil: undefined }),
      transcription: fc.option(printableStringArb, { nil: undefined }),
    });

    fc.assert(
      fc.property(
        fc.array(questionArb, { minLength: 0, maxLength: 15 }),
        (questions) => {
          const result = determineQuestionType(questions);
          expect(['contextual', 'random']).toContain(result);
          expect(typeof result).toBe('string');
          expect(result).not.toBeUndefined();
          expect(result).not.toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 6: Question type selection respects target ratio
// **Validates: Requirements 3.2, 3.4**
// ============================================================================
describe('Feature: hybrid-interview-questions, Property 6: question type selection respects target ratio', () => {
  test('When contextual ratio is below 0.5 and last question has transcription, returns contextual', () => {
    const lowRatioSessionArb = fc.integer({ min: 2, max: 20 }).chain(totalCount => {
      const maxContextual = Math.ceil(totalCount * 0.5) - 1;
      return fc.integer({ min: 0, max: Math.max(0, maxContextual) }).map(contextualCount => {
        const questions: Array<{ questionType: 'contextual' | 'random'; transcription: string }> = [];
        for (let i = 0; i < contextualCount; i++) {
          questions.push({ questionType: 'contextual', transcription: 'answer' });
        }
        for (let i = contextualCount; i < totalCount; i++) {
          questions.push({ questionType: 'random', transcription: 'answer' });
        }
        return questions;
      });
    });

    fc.assert(
      fc.property(lowRatioSessionArb, (questions) => {
        const contextualCount = questions.filter(q => q.questionType === 'contextual').length;
        const ratio = contextualCount / questions.length;
        if (ratio >= 0.5) return;

        const result = determineQuestionType(questions);
        expect(result).toBe('contextual');
      }),
      { numRuns: 100 }
    );
  });

  test('When contextual ratio is above 0.6 and last question has transcription, returns random', () => {
    const highRatioSessionArb = fc.integer({ min: 2, max: 20 }).chain(totalCount => {
      const minContextual = Math.floor(totalCount * 0.6) + 1;
      return fc.integer({ min: Math.min(minContextual, totalCount), max: totalCount }).map(contextualCount => {
        const questions: Array<{ questionType: 'contextual' | 'random'; transcription: string }> = [];
        for (let i = 0; i < contextualCount; i++) {
          questions.push({ questionType: 'contextual', transcription: 'answer' });
        }
        for (let i = contextualCount; i < totalCount; i++) {
          questions.push({ questionType: 'random', transcription: 'answer' });
        }
        return questions;
      });
    });

    fc.assert(
      fc.property(highRatioSessionArb, (questions) => {
        const contextualCount = questions.filter(q => q.questionType === 'contextual').length;
        const ratio = contextualCount / questions.length;
        if (ratio <= 0.6) return;

        const result = determineQuestionType(questions);
        expect(result).toBe('random');
      }),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 7: Question type stored in session record (mocked DynamoDB)
// **Validates: Requirements 4.1**
// ============================================================================
describe('Feature: hybrid-interview-questions, Property 7: question type stored in session record', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  test('For any next_question call, the DynamoDB update includes questionType as contextual or random', async () => {
    const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');

    await fc.assert(
      fc.asyncProperty(
        printableStringArb,
        seniorityArb,
        categoryArb,
        fc.array(answeredQuestionArb, { minLength: 1, maxLength: 5 }),
        async (jobPosition, seniority, category, prevQuestions) => {
          jest.clearAllMocks();

          const questions = prevQuestions.map((q, i) => ({
            questionId: `q${i}`,
            questionText: q.questionText,
            questionType: q.questionType,
            transcription: q.transcription,
          }));

          mockSend.mockImplementation((command: { _type?: string }) => {
            if (command._type === 'GetCommand') {
              return Promise.resolve({
                Item: {
                  userId: 'test-user',
                  sessionId: 'session-1',
                  jobPosition,
                  seniorityLevel: seniority,
                  questionCategory: category,
                  questions,
                },
              });
            }
            if (command._type === 'InvokeModelCommand') {
              return Promise.resolve({
                body: new TextEncoder().encode(
                  JSON.stringify({ content: [{ text: 'Generated question?' }] })
                ),
              });
            }
            return Promise.resolve({});
          });

          const response = await routeAction('test-user', {
            action: 'next_question',
            sessionId: 'session-1',
          });

          expect(['contextual', 'random']).toContain(response.questionType);

          expect(UpdateCommand).toHaveBeenCalledTimes(1);
          const updateCall = UpdateCommand.mock.calls[0][0];

          const newQuestion = updateCall.ExpressionAttributeValues[':newQuestion'];
          expect(Array.isArray(newQuestion)).toBe(true);
          expect(newQuestion).toHaveLength(1);
          expect(['contextual', 'random']).toContain(newQuestion[0].questionType);
          expect(newQuestion[0].questionType).toBe(response.questionType);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('For start_session, the DynamoDB put includes questionType random on the first question', async () => {
    const { PutCommand } = require('@aws-sdk/lib-dynamodb');

    await fc.assert(
      fc.asyncProperty(
        printableStringArb,
        async (jobPosition) => {
          jest.clearAllMocks();

          mockSend.mockImplementation((command: { _type?: string }) => {
            if (command._type === 'InvokeModelCommand') {
              return Promise.resolve({
                body: new TextEncoder().encode(
                  JSON.stringify({ content: [{ text: 'First question?' }] })
                ),
              });
            }
            return Promise.resolve({});
          });

          const response = await routeAction('test-user', {
            action: 'start_session',
            jobPosition,
          });

          expect(response.questionType).toBe('random');

          expect(PutCommand).toHaveBeenCalledTimes(1);
          const putCall = PutCommand.mock.calls[0][0];
          const storedQuestions = putCall.Item.questions;
          expect(Array.isArray(storedQuestions)).toBe(true);
          expect(storedQuestions.length).toBeGreaterThanOrEqual(1);
          expect(storedQuestions[0].questionType).toBe('random');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 8: Backward compatibility with missing questionType
// **Validates: Requirements 4.2**
// ============================================================================
describe('Feature: hybrid-interview-questions, Property 8: backward compatibility with missing questionType', () => {
  test('For any session with questions missing questionType, determineQuestionType returns a valid result', () => {
    const oldFormatQuestionArb = fc.record({
      transcription: fc.option(printableStringArb, { nil: undefined }),
    });

    fc.assert(
      fc.property(
        fc.array(oldFormatQuestionArb, { minLength: 0, maxLength: 15 }),
        (questions) => {
          const result = determineQuestionType(questions);
          expect(['contextual', 'random']).toContain(result);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Questions without questionType are treated as random for ratio calculation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (count) => {
          const questions: Array<{ transcription: string }> = [];
          for (let i = 0; i < count; i++) {
            questions.push({ transcription: 'some answer' });
          }
          const result = determineQuestionType(questions);
          // No questionType => contextualCount = 0, ratio = 0 < 0.5 => contextual
          expect(result).toBe('contextual');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Mixed sessions with some questions having questionType and some not still produce valid results', () => {
    const mixedQuestionArb = fc.record({
      questionType: fc.option(fc.constantFrom('contextual' as const, 'random' as const), { nil: undefined }),
      transcription: fc.option(printableStringArb, { nil: undefined }),
    });

    fc.assert(
      fc.property(
        fc.array(mixedQuestionArb, { minLength: 1, maxLength: 15 }),
        (questions) => {
          const result = determineQuestionType(questions);
          expect(['contextual', 'random']).toContain(result);
        }
      ),
      { numRuns: 100 }
    );
  });
});
