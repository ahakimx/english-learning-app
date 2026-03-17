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

const jobPositionArb = fc.constantFrom('Software Engineer', 'Product Manager', 'Data Analyst', 'DevOps Engineer');
const seniorityArb = fc.constantFrom('junior' as const, 'mid' as const, 'senior' as const, 'lead' as const);
const categoryArb = fc.constantFrom('general' as const, 'technical' as const);

/** Generate a timestamp within the last 12 hours (well within 24h expiry) */
const recentTimestampArb = fc.integer({ min: 1, max: 12 * 60 * 60 * 1000 }).map(
  (msAgo) => new Date(Date.now() - msAgo).toISOString()
);

const sessionRecordArb = fc.record({
  sessionId: fc.uuid(),
  jobPosition: jobPositionArb,
  seniorityLevel: seniorityArb,
  questionCategory: categoryArb,
  status: fc.constant('active'),
  type: fc.constant('speaking'),
  questions: fc.constant([
    { questionId: 'q1', questionText: 'Tell me about yourself', questionType: 'introduction' },
  ]),
  createdAt: fc.constant(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  updatedAt: recentTimestampArb,
});

const sessionsArrayArb = fc.array(sessionRecordArb, { minLength: 1, maxLength: 5 });

// ============================================================================
// Property 1: Most recent active session is selected
// Feature: speaking-session-resume, Property 1: Most recent active session is selected
// **Validates: Requirements 1.3**
// ============================================================================
describe('Feature: speaking-session-resume, Property 1: Most recent active session is selected', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  test('For any set of 1-5 active speaking sessions, handleResumeSession returns the session with the latest updatedAt', async () => {
    await fc.assert(
      fc.asyncProperty(sessionsArrayArb, async (sessions) => {
        jest.clearAllMocks();

        // Find the expected most recent session
        const expectedSession = sessions.reduce((latest, s) =>
          new Date(s.updatedAt).getTime() > new Date(latest.updatedAt).getTime() ? s : latest
        );

        // Mock DynamoDB QueryCommand to return these sessions
        mockSend.mockImplementation((command: { _type?: string }) => {
          if (command._type === 'QueryCommand') {
            return Promise.resolve({ Items: sessions });
          }
          return Promise.resolve({});
        });

        const response = await routeAction('test-user', {
          action: 'resume_session',
        });

        expect(response.type).toBe('session_resumed');
        expect(response.sessionData).toBeDefined();
        expect(response.sessionData!.sessionId).toBe(expectedSession.sessionId);
      }),
      { numRuns: 100 }
    );
  });
});
