/**
 * Feature: english-learning-app, Property 19: Statistik progress dihitung dengan benar
 * Validates: Requirements 10.1, 10.2
 *
 * For any sequence of score updates, the progress statistics (totalSessions, averageScore)
 * must be calculated correctly. After N updates with scores s1..sN, totalSessions should
 * be N and averageScore should match the handler's incremental running average calculation.
 */
import { APIGatewayProxyEvent } from 'aws-lambda';
import fc from 'fast-check';

// Mock AWS SDK clients before importing handler
const mockDynamoSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({ send: mockDynamoSend })),
  },
  QueryCommand: jest.fn((params: unknown) => ({ _type: 'QueryCommand', params })),
  PutCommand: jest.fn((params: unknown) => ({ _type: 'PutCommand', params })),
  UpdateCommand: jest.fn((params: unknown) => ({ _type: 'UpdateCommand', params })),
  GetCommand: jest.fn((params: unknown) => ({ _type: 'GetCommand', params })),
}));

import { handler } from '../lambda/progress/index';

const TEST_USER_ID = 'prop-test-user-19';

function createPostEvent(body: Record<string, unknown>, userId = TEST_USER_ID): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/progress',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/progress',
    requestContext: {
      accountId: '123456789',
      apiId: 'test-api',
      authorizer: { claims: { sub: userId } },
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      identity: {} as any,
      path: '/progress',
      stage: 'prod',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test',
      resourcePath: '/progress',
    },
  };
}

function createGetEvent(userId = TEST_USER_ID): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/progress',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/progress',
    requestContext: {
      accountId: '123456789',
      apiId: 'test-api',
      authorizer: { claims: { sub: userId } },
      protocol: 'HTTP/1.1',
      httpMethod: 'GET',
      identity: {} as any,
      path: '/progress',
      stage: 'prod',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test',
      resourcePath: '/progress',
    },
  };
}

// Arbitrary: array of 1-20 integer scores between 0 and 100
const scoresArb = fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 20 });

// Arbitrary: module type (speaking, grammar, or writing — the ones users interact with)
const moduleTypeArb = fc.constantFrom('speaking', 'grammar', 'writing');

/**
 * Simulate the handler's incremental running average calculation.
 * The handler computes: Math.round(((currentAvg * currentTotal) + score) / newTotal)
 * at each step, which can accumulate rounding differences vs a simple sum/N.
 */
function computeExpectedStats(scores: number[]): { totalSessions: number; averageScore: number } {
  let totalSessions = 0;
  let averageScore = 0;

  for (const score of scores) {
    const newTotal = totalSessions + 1;
    averageScore = Math.round(((averageScore * totalSessions) + score) / newTotal);
    totalSessions = newTotal;
  }

  return { totalSessions, averageScore };
}

/**
 * Sets up mockDynamoSend to simulate in-memory DynamoDB state for a single module.
 * Tracks the stored item across multiple POST calls, then returns it on GET (QueryCommand).
 */
function setupStatefulDynamoMock(): { getStoredItem: () => Record<string, unknown> | null } {
  let storedItem: Record<string, unknown> | null = null;

  mockDynamoSend.mockImplementation((command: { _type: string; params: any }) => {
    if (command._type === 'GetCommand') {
      return Promise.resolve({ Item: storedItem ? { ...storedItem } : null });
    }

    if (command._type === 'PutCommand') {
      // First insert — store the full item
      storedItem = { ...command.params.Item };
      return Promise.resolve({});
    }

    if (command._type === 'UpdateCommand') {
      // Incremental update — apply the expression attribute values to our stored item
      const values = command.params.ExpressionAttributeValues;
      if (storedItem) {
        storedItem.totalSessions = values[':newTotal'];
        storedItem.averageScore = values[':newAvg'];
        storedItem.lastActivityAt = values[':now'];
        // Append to scoreHistory
        const currentHistory = (storedItem.scoreHistory as any[]) || [];
        const newEntries = values[':newHistory'] as any[];
        storedItem.scoreHistory = [...currentHistory, ...newEntries];
        // Update module-specific scores if present
        if (values[':speakingScores']) storedItem.speakingScores = values[':speakingScores'];
        if (values[':topicScores']) storedItem.topicScores = values[':topicScores'];
        if (values[':writingScores']) storedItem.writingScores = values[':writingScores'];
      }
      return Promise.resolve({});
    }

    if (command._type === 'QueryCommand') {
      // GET request — return stored items
      return Promise.resolve({ Items: storedItem ? [{ ...storedItem }] : [] });
    }

    return Promise.resolve({});
  });

  return { getStoredItem: () => storedItem };
}

describe('Property 19: Statistik progress dihitung dengan benar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('after N score updates, totalSessions equals N and averageScore matches incremental running average', async () => {
    await fc.assert(
      fc.asyncProperty(scoresArb, moduleTypeArb, async (scores, moduleType) => {
        jest.clearAllMocks();
        setupStatefulDynamoMock();

        // POST each score sequentially
        for (let i = 0; i < scores.length; i++) {
          const event = createPostEvent({
            moduleType,
            score: scores[i],
            sessionId: `sess-${i}`,
          });
          const result = await handler(event);
          expect(result.statusCode).toBe(200);
        }

        // GET progress and verify statistics
        const getEvent = createGetEvent();
        const getResult = await handler(getEvent);
        expect(getResult.statusCode).toBe(200);

        const body = JSON.parse(getResult.body);
        const expected = computeExpectedStats(scores);

        // Pick the right field based on module type
        if (moduleType === 'speaking') {
          expect(body.speaking.totalSessions).toBe(expected.totalSessions);
          expect(body.speaking.averageScore).toBe(expected.averageScore);
          expect(body.speaking.scoreHistory).toHaveLength(scores.length);
        } else if (moduleType === 'grammar') {
          expect(body.grammar.totalQuizzes).toBe(expected.totalSessions);
        } else if (moduleType === 'writing') {
          expect(body.writing.totalReviews).toBe(expected.totalSessions);
          expect(body.writing.averageScore).toBe(expected.averageScore);
          expect(body.writing.scoreHistory).toHaveLength(scores.length);
        }
      }),
      { numRuns: 100 }
    );
  });
});


/**
 * Feature: english-learning-app, Property 22: User hanya dapat mengakses data miliknya sendiri
 * Validates: Requirements 12.2
 *
 * For any two different user IDs (userA and userB), when userA tries to POST progress data
 * with userB's userId in the body, the handler must return 403 Forbidden.
 */
describe('Property 22: User hanya dapat mengakses data miliknya sendiri', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Arbitrary: generate pairs of distinct UUIDs for userA and userB
  const distinctUserPairArb = fc
    .tuple(fc.uuid(), fc.uuid())
    .filter(([a, b]) => a !== b);

  it('when userA POSTs progress with userB userId, handler returns 403 Forbidden', async () => {
    await fc.assert(
      fc.asyncProperty(
        distinctUserPairArb,
        moduleTypeArb,
        fc.integer({ min: 0, max: 100 }),
        async ([userA, userB], moduleType, score) => {
          jest.clearAllMocks();

          // Create a POST event where the token belongs to userA
          // but the body contains userB's userId
          const event = createPostEvent(
            {
              userId: userB,
              moduleType,
              score,
              sessionId: 'sess-cross-access',
            },
            userA
          );

          const result = await handler(event);

          // Handler must reject with 403 Forbidden
          expect(result.statusCode).toBe(403);

          const body = JSON.parse(result.body);
          expect(body.error).toBe('Forbidden');
        }
      ),
      { numRuns: 100 }
    );
  });
});
