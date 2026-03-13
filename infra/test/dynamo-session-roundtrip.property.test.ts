import { APIGatewayProxyEvent } from 'aws-lambda';
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

import { handler } from '../lambda/chat/index';

// --- Helpers ---

function createEvent(body: Record<string, unknown>, userId = 'test-user-id-123'): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/chat',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/chat',
    requestContext: {
      accountId: '123456789',
      apiId: 'test-api',
      authorizer: { claims: { sub: userId } },
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      identity: {} as any,
      path: '/chat',
      stage: 'prod',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test',
      resourcePath: '/chat',
    },
  };
}

// --- Generators ---

const seniorityLevelArb = fc.constantFrom('junior' as const, 'mid' as const, 'senior' as const, 'lead' as const);
const questionCategoryArb = fc.constantFrom('general' as const, 'technical' as const);
const jobPositionArb = fc.constantFrom(
  'software-engineer',
  'product-manager',
  'data-analyst',
  'marketing-manager',
  'ui-ux-designer',
  'devops-engineer',
  'cloud-engineer'
);

// Feature: interview-position-enhancement, Property 7: Session context round-trip through DynamoDB
// **Validates: Requirements 4.4, 4.5**
describe('Property 7: Session context round-trip through DynamoDB', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  test('For any valid seniority and category, start_session stores them in DynamoDB and next_question retrieves and uses them in the prompt', async () => {
    const { PutCommand } = require('@aws-sdk/lib-dynamodb');
    const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

    await fc.assert(
      fc.asyncProperty(
        jobPositionArb,
        seniorityLevelArb,
        questionCategoryArb,
        async (jobPosition, seniorityLevel, questionCategory) => {
          jest.clearAllMocks();

          // Track what gets stored in DynamoDB via PutCommand
          let capturedPutItem: Record<string, unknown> | null = null;

          mockSend.mockImplementation((command: { _type?: string; params?: any }) => {
            if (command._type === 'InvokeModelCommand') {
              return Promise.resolve({
                body: new TextEncoder().encode(
                  JSON.stringify({ content: [{ text: 'Tell me about your experience.' }] })
                ),
              });
            }
            if (command._type === 'PutCommand') {
              capturedPutItem = command.params?.Item;
              return Promise.resolve({});
            }
            return Promise.resolve({});
          });

          // --- Phase 1: start_session ---
          const startEvent = createEvent({
            action: 'start_session',
            jobPosition,
            seniorityLevel,
            questionCategory,
          });

          const startResult = await handler(startEvent);
          expect(startResult.statusCode).toBe(200);

          // Verify PutCommand was called and captured the item
          expect(PutCommand).toHaveBeenCalledTimes(1);
          expect(capturedPutItem).not.toBeNull();

          // Verify stored values match request values (Requirement 4.4)
          expect(capturedPutItem!.seniorityLevel).toBe(seniorityLevel);
          expect(capturedPutItem!.questionCategory).toBe(questionCategory);
          expect(capturedPutItem!.jobPosition).toBe(jobPosition);

          // Extract the sessionId from the stored item for next_question
          const storedSessionId = capturedPutItem!.sessionId as string;
          expect(storedSessionId).toBeDefined();

          // --- Phase 2: next_question ---
          jest.clearAllMocks();

          // Mock DynamoDB GetCommand to return a session with the stored values
          mockSend.mockImplementation((command: { _type?: string; params?: any }) => {
            if (command._type === 'InvokeModelCommand') {
              return Promise.resolve({
                body: new TextEncoder().encode(
                  JSON.stringify({ content: [{ text: 'Describe a challenging project.' }] })
                ),
              });
            }
            if (command._type === 'GetCommand') {
              return Promise.resolve({
                Item: {
                  userId: 'test-user-id-123',
                  sessionId: storedSessionId,
                  type: 'speaking',
                  status: 'active',
                  jobPosition,
                  seniorityLevel,
                  questionCategory,
                  questions: [{ questionId: 'q1', questionText: 'Tell me about your experience.' }],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              });
            }
            // UpdateCommand for appending the new question
            return Promise.resolve({});
          });

          const nextEvent = createEvent({
            action: 'next_question',
            sessionId: storedSessionId,
          });

          const nextResult = await handler(nextEvent);
          expect(nextResult.statusCode).toBe(200);

          // Verify the Bedrock prompt uses the same seniority and category (Requirement 4.5)
          expect(InvokeModelCommand).toHaveBeenCalledTimes(1);
          const bedrockCall = InvokeModelCommand.mock.calls[0][0];
          const body = JSON.parse(bedrockCall.body);
          const prompt: string = body.messages[0].content;

          // The prompt must contain the originally stored seniority level
          expect(prompt).toContain(seniorityLevel);

          // The prompt must contain category-appropriate instructions matching the stored category
          if (questionCategory === 'general') {
            const hasGeneralKeywords =
              prompt.toLowerCase().includes('behavioral') ||
              prompt.toLowerCase().includes('soft skills') ||
              prompt.toLowerCase().includes('motivation');
            expect(hasGeneralKeywords).toBe(true);
          } else {
            expect(prompt.toLowerCase()).toContain('technical');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
