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

import { routeAction, INTRODUCTION_QUESTIONS } from '../lambda/chat/index';
import { SeniorityLevel } from '../lib/types';

// --- Generators ---

const seniorityArb = fc.constantFrom<SeniorityLevel>('junior', 'mid', 'senior', 'lead');

const jobPositionArb = fc.stringOf(
  fc.char().filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127 && c.trim().length > 0),
  { minLength: 1, maxLength: 80 }
);

const categoryArb = fc.constantFrom('general' as const, 'technical' as const);

// ============================================================================
// Property 1: Self-introduction question matches seniority template
// Feature: interview-flow-restructure, Property 1: Self-introduction question matches seniority template
// **Validates: Requirements 1.1, 1.2**
// ============================================================================
describe('Feature: interview-flow-restructure, Property 1: Self-introduction question matches seniority template', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';

    // DynamoDB PutCommand succeeds
    mockSend.mockImplementation((command: { _type?: string }) => {
      return Promise.resolve({});
    });
  });

  test('For any valid seniority level, handleStartSession returns question text matching INTRODUCTION_QUESTIONS template and does NOT call Bedrock', async () => {
    const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

    await fc.assert(
      fc.asyncProperty(
        seniorityArb,
        jobPositionArb,
        categoryArb,
        async (seniority, jobPosition, category) => {
          jest.clearAllMocks();

          mockSend.mockImplementation(() => Promise.resolve({}));

          const response = await routeAction('test-user', {
            action: 'start_session',
            jobPosition,
            seniorityLevel: seniority,
            questionCategory: category,
          });

          // Response content must exactly match the hardcoded template
          expect(response.content).toBe(INTRODUCTION_QUESTIONS[seniority]);

          // Bedrock must NOT have been called
          expect(InvokeModelCommand).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 2: First question is stored and returned as introduction type
// Feature: interview-flow-restructure, Property 2: First question is stored and returned as introduction type
// **Validates: Requirements 1.3, 1.4**
// ============================================================================
describe('Feature: interview-flow-restructure, Property 2: First question is stored and returned as introduction type', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';

    mockSend.mockImplementation(() => Promise.resolve({}));
  });

  test('For any seniority and position, both the ChatResponse and DynamoDB record contain questionType introduction', async () => {
    const { PutCommand } = require('@aws-sdk/lib-dynamodb');

    await fc.assert(
      fc.asyncProperty(
        seniorityArb,
        jobPositionArb,
        categoryArb,
        async (seniority, jobPosition, category) => {
          jest.clearAllMocks();

          mockSend.mockImplementation(() => Promise.resolve({}));

          const response = await routeAction('test-user', {
            action: 'start_session',
            jobPosition,
            seniorityLevel: seniority,
            questionCategory: category,
          });

          // ChatResponse must have questionType 'introduction'
          expect(response.questionType).toBe('introduction');

          // DynamoDB PutCommand must have been called with questionType 'introduction'
          expect(PutCommand).toHaveBeenCalledTimes(1);
          const putCall = PutCommand.mock.calls[0][0];
          const storedQuestions = putCall.Item.questions;
          expect(Array.isArray(storedQuestions)).toBe(true);
          expect(storedQuestions).toHaveLength(1);
          expect(storedQuestions[0].questionType).toBe('introduction');
          expect(storedQuestions[0].questionText).toBe(INTRODUCTION_QUESTIONS[seniority]);
        }
      ),
      { numRuns: 100 }
    );
  });
});
