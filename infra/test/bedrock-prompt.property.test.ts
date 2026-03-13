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

const seniorityLevelArb = fc.constantFrom('junior', 'mid', 'senior', 'lead');
const questionCategoryArb = fc.constantFrom('general', 'technical');
const jobPositionArb = fc.constantFrom(
  'software-engineer',
  'product-manager',
  'data-analyst',
  'marketing-manager',
  'ui-ux-designer',
  'devops-engineer',
  'cloud-engineer'
);

// Feature: interview-position-enhancement, Property 6: Bedrock prompt incorporates seniority and category
// **Validates: Requirements 4.1, 4.2, 4.3**
describe('Property 6: Bedrock prompt incorporates seniority and category', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  test('For any valid combination of position, seniority, and category, the Bedrock prompt contains the seniority value and category-appropriate instructions', async () => {
    const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

    await fc.assert(
      fc.asyncProperty(
        jobPositionArb,
        seniorityLevelArb,
        questionCategoryArb,
        async (jobPosition, seniorityLevel, questionCategory) => {
          jest.clearAllMocks();

          // Mock Bedrock to return a question
          mockSend.mockImplementation((command: { _type?: string }) => {
            if (command._type === 'InvokeModelCommand') {
              return Promise.resolve({
                body: new TextEncoder().encode(
                  JSON.stringify({ content: [{ text: 'What is your experience with this role?' }] })
                ),
              });
            }
            // DynamoDB PutCommand
            return Promise.resolve({});
          });

          const event = createEvent({
            action: 'start_session',
            jobPosition,
            seniorityLevel,
            questionCategory,
          });

          const result = await handler(event);
          expect(result.statusCode).toBe(200);

          // Capture the prompt sent to Bedrock
          expect(InvokeModelCommand).toHaveBeenCalledTimes(1);
          const bedrockCall = InvokeModelCommand.mock.calls[0][0];
          const body = JSON.parse(bedrockCall.body);
          const prompt: string = body.messages[0].content;

          // Prompt must contain the seniority level value
          expect(prompt).toContain(seniorityLevel);

          // Prompt must contain the job position value
          expect(prompt).toContain(jobPosition);

          // Prompt must contain category-appropriate instructions
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
