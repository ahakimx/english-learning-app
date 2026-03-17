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
  QueryCommand: jest.fn((params: unknown) => ({ _type: 'QueryCommand', params })),
}));

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => ({ send: mockSend })),
  InvokeModelCommand: jest.fn((params: unknown) => ({ _type: 'InvokeModelCommand', params })),
}));

import { routeAction } from '../lambda/chat/index';

// --- Generators ---

const seniorityArb = fc.constantFrom('junior' as const, 'mid' as const, 'senior' as const, 'lead' as const);
const categoryArb = fc.constantFrom('general' as const, 'technical' as const);
const questionTypeArb = fc.constantFrom('introduction' as const, 'contextual' as const);

const feedbackArb = fc.record({
  scores: fc.record({
    grammar: fc.integer({ min: 0, max: 100 }),
    vocabulary: fc.integer({ min: 0, max: 100 }),
    relevance: fc.integer({ min: 0, max: 100 }),
    fillerWords: fc.integer({ min: 0, max: 100 }),
    coherence: fc.integer({ min: 0, max: 100 }),
    overall: fc.integer({ min: 0, max: 100 }),
  }),
  grammarErrors: fc.constant([]),
  fillerWordsDetected: fc.constant([]),
  suggestions: fc.constant(['Practice more']),
  improvedAnswer: fc.constant('Improved answer text'),
});

/** Generate a question with optional transcription and feedback */
const questionArb = fc.record({
  questionId: fc.uuid(),
  questionText: fc.constantFrom(
    'Tell me about yourself',
    'What are your strengths?',
    'Describe a challenging project',
    'Why do you want this role?',
    'Where do you see yourself in 5 years?'
  ),
  questionType: questionTypeArb,
}).chain((base) =>
  fc.record({
    hasTranscription: fc.boolean(),
    hasFeedback: fc.boolean(),
  }).chain(({ hasTranscription, hasFeedback }) => {
    const transcription = hasTranscription ? fc.constantFrom('My answer is...', 'I have experience in...') : fc.constant(undefined);
    const feedback = hasTranscription && hasFeedback ? feedbackArb.map(f => f as typeof f | undefined) : fc.constant(undefined as typeof undefined);
    const answeredAt = hasTranscription ? fc.constant(new Date().toISOString()) : fc.constant(undefined);

    return fc.record({
      questionId: fc.constant(base.questionId),
      questionText: fc.constant(base.questionText),
      questionType: fc.constant(base.questionType),
      transcription,
      feedback,
      answeredAt,
    });
  })
);

/** Generate a timestamp within the last 12 hours */
const recentTimestampArb = fc.integer({ min: 1, max: 12 * 60 * 60 * 1000 }).map(
  (msAgo) => new Date(Date.now() - msAgo).toISOString()
);

const sessionRecordArb = fc.record({
  sessionId: fc.uuid(),
  userId: fc.constant('test-user'),
  jobPosition: fc.constantFrom('Software Engineer', 'Product Manager', 'Data Analyst'),
  seniorityLevel: seniorityArb,
  questionCategory: categoryArb,
  status: fc.constant('active'),
  type: fc.constant('speaking'),
  questions: fc.array(questionArb, { minLength: 1, maxLength: 5 }),
  createdAt: fc.constant(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  updatedAt: recentTimestampArb,
});

// ============================================================================
// Property 2: Resumed session data completeness
// Feature: speaking-session-resume, Property 2: Resumed session data completeness
// **Validates: Requirements 1.5, 6.2**
// ============================================================================
describe('Feature: speaking-session-resume, Property 2: Resumed session data completeness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  test('For any valid active session, sessionData contains all required fields and preserves optional fields', async () => {
    await fc.assert(
      fc.asyncProperty(sessionRecordArb, async (session) => {
        jest.clearAllMocks();

        mockSend.mockImplementation((command: { _type?: string }) => {
          if (command._type === 'QueryCommand') {
            return Promise.resolve({ Items: [session] });
          }
          return Promise.resolve({});
        });

        const response = await routeAction('test-user', {
          action: 'resume_session',
        });

        expect(response.type).toBe('session_resumed');
        const sd = response.sessionData!;

        // All required fields must be present
        expect(sd.sessionId).toBe(session.sessionId);
        expect(sd.jobPosition).toBe(session.jobPosition);
        expect(sd.seniorityLevel).toBe(session.seniorityLevel);
        expect(sd.questionCategory).toBe(session.questionCategory);
        expect(sd.createdAt).toBe(session.createdAt);
        expect(sd.updatedAt).toBe(session.updatedAt);
        expect(sd.questions).toHaveLength(session.questions.length);

        // Each question must have questionId and questionText; optional fields preserved
        for (let i = 0; i < session.questions.length; i++) {
          const srcQ = session.questions[i];
          const resQ = sd.questions[i];

          expect(resQ.questionId).toBe(srcQ.questionId);
          expect(resQ.questionText).toBe(srcQ.questionText);

          if (srcQ.transcription !== undefined) {
            expect(resQ.transcription).toBe(srcQ.transcription);
          }
          if (srcQ.feedback !== undefined) {
            expect(resQ.feedback).toEqual(srcQ.feedback);
          }
          if (srcQ.answeredAt !== undefined) {
            expect(resQ.answeredAt).toBe(srcQ.answeredAt);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
