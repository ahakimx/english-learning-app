// Unit tests for Session Manager (Task 5.3)
// Tests: createSession, getSession, updateSession, endSession, autoAbandonActiveSessions, checkSessionExpiry

// Set env var before module import so the top-level const captures it
process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';

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

import {
  createSession,
  getSession,
  updateSession,
  endSession,
  autoAbandonActiveSessions,
  checkSessionExpiry,
} from '../lambda/websocket/nova-sonic/sessionManager';
import type { SessionRecord, SummaryReport } from '../lib/types';

describe('Session Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- createSession ---

  describe('createSession', () => {
    test('creates a session with status "active" and architecture "hybrid"', async () => {
      const { PutCommand } = require('@aws-sdk/lib-dynamodb');
      mockSend.mockResolvedValueOnce({});

      const result = await createSession('user-1', {
        jobPosition: 'Software Engineer',
        seniorityLevel: 'mid',
        questionCategory: 'technical',
      });

      expect(result.userId).toBe('user-1');
      expect(result.sessionId).toBeDefined();
      expect(result.status).toBe('active');
      expect(result.architecture).toBe('hybrid');
      expect(result.type).toBe('speaking');
      expect(result.jobPosition).toBe('Software Engineer');
      expect(result.seniorityLevel).toBe('mid');
      expect(result.questionCategory).toBe('technical');
      expect(result.questions).toEqual([]);
      expect(result.conversationHistory).toEqual([]);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();

      expect(PutCommand).toHaveBeenCalledTimes(1);
      const putParams = PutCommand.mock.calls[0][0];
      expect(putParams.TableName).toBe('test-sessions-table');
      expect(putParams.Item.status).toBe('active');
      expect(putParams.Item.architecture).toBe('hybrid');
    });

    test('generates a unique sessionId', async () => {
      mockSend.mockResolvedValue({});

      const result1 = await createSession('user-1', {
        jobPosition: 'Designer',
        seniorityLevel: 'junior',
        questionCategory: 'general',
      });
      const result2 = await createSession('user-1', {
        jobPosition: 'Designer',
        seniorityLevel: 'junior',
        questionCategory: 'general',
      });

      expect(result1.sessionId).not.toBe(result2.sessionId);
    });
  });

  // --- getSession ---

  describe('getSession', () => {
    test('returns session record with defaults for old-format records', async () => {
      const { GetCommand } = require('@aws-sdk/lib-dynamodb');

      // Old-format record: no architecture, connectionId, or conversationHistory
      mockSend.mockResolvedValueOnce({
        Item: {
          userId: 'user-1',
          sessionId: 'session-old',
          type: 'speaking',
          status: 'active',
          jobPosition: 'Analyst',
          seniorityLevel: 'mid',
          questionCategory: 'general',
          questions: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      });

      const result = await getSession('user-1', 'session-old');

      expect(result).not.toBeNull();
      expect(result!.architecture).toBe('pipeline');
      expect(result!.connectionId).toBeUndefined();
      expect(result!.conversationHistory).toEqual([]);

      expect(GetCommand).toHaveBeenCalledTimes(1);
      expect(GetCommand.mock.calls[0][0].Key).toEqual({
        userId: 'user-1',
        sessionId: 'session-old',
      });
    });

    test('returns hybrid session record with all fields', async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          userId: 'user-1',
          sessionId: 'session-new',
          type: 'speaking',
          status: 'active',
          jobPosition: 'Engineer',
          seniorityLevel: 'senior',
          questionCategory: 'technical',
          questions: [],
          createdAt: '2024-06-01T00:00:00.000Z',
          updatedAt: '2024-06-01T00:00:00.000Z',
          architecture: 'hybrid',
          connectionId: 'conn-abc',
          conversationHistory: [
            { role: 'assistant', text: 'Hello', questionId: 'q1' },
          ],
        },
      });

      const result = await getSession('user-1', 'session-new');

      expect(result).not.toBeNull();
      expect(result!.architecture).toBe('hybrid');
      expect(result!.connectionId).toBe('conn-abc');
      expect(result!.conversationHistory).toHaveLength(1);
    });

    test('returns null when session not found', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await getSession('user-1', 'nonexistent');
      expect(result).toBeNull();
    });
  });

  // --- updateSession ---

  describe('updateSession', () => {
    test('updates specified fields and sets updatedAt', async () => {
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      mockSend.mockResolvedValueOnce({});

      await updateSession('user-1', 'session-1', {
        connectionId: 'conn-xyz',
        status: 'active',
      });

      expect(UpdateCommand).toHaveBeenCalledTimes(1);
      const params = UpdateCommand.mock.calls[0][0];
      expect(params.Key).toEqual({ userId: 'user-1', sessionId: 'session-1' });
      expect(params.UpdateExpression).toContain('updatedAt');
      expect(params.UpdateExpression).toContain('#connectionId');
      expect(params.UpdateExpression).toContain('#status');
      expect(params.ExpressionAttributeValues[':connectionId']).toBe('conn-xyz');
      expect(params.ExpressionAttributeValues[':status']).toBe('active');
    });

    test('skips undefined values', async () => {
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      mockSend.mockResolvedValueOnce({});

      await updateSession('user-1', 'session-1', {
        connectionId: 'conn-1',
        totalDurationSeconds: undefined,
      });

      const params = UpdateCommand.mock.calls[0][0];
      expect(params.UpdateExpression).not.toContain('totalDurationSeconds');
      expect(params.ExpressionAttributeValues[':totalDurationSeconds']).toBeUndefined();
    });
  });

  // --- endSession ---

  describe('endSession', () => {
    test('sets status to "completed" and stores summaryReport', async () => {
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      mockSend.mockResolvedValueOnce({});

      const summaryReport: SummaryReport = {
        overallScore: 75,
        criteriaScores: {
          grammar: 80,
          vocabulary: 70,
          relevance: 75,
          fillerWords: 65,
          coherence: 85,
        },
        performanceTrend: [{ questionNumber: 1, score: 75 }],
        topImprovementAreas: ['vocabulary', 'filler words', 'structure'],
        recommendations: ['Practice reducing filler words'],
      };

      await endSession('user-1', 'session-1', summaryReport);

      expect(UpdateCommand).toHaveBeenCalledTimes(1);
      const params = UpdateCommand.mock.calls[0][0];
      expect(params.ExpressionAttributeValues[':completed']).toBe('completed');
      expect(params.ExpressionAttributeValues[':summaryReport']).toEqual(summaryReport);
      expect(params.UpdateExpression).toContain('#status = :completed');
      expect(params.UpdateExpression).toContain('summaryReport = :summaryReport');
    });
  });

  // --- autoAbandonActiveSessions ---

  describe('autoAbandonActiveSessions', () => {
    test('abandons all active speaking sessions for a user', async () => {
      const { QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'QueryCommand') {
          return Promise.resolve({
            Items: [
              { userId: 'user-1', sessionId: 'sess-1' },
              { userId: 'user-1', sessionId: 'sess-2' },
            ],
          });
        }
        return Promise.resolve({});
      });

      const count = await autoAbandonActiveSessions('user-1');

      expect(count).toBe(2);
      expect(QueryCommand).toHaveBeenCalledTimes(1);
      expect(UpdateCommand).toHaveBeenCalledTimes(2);

      // Verify each update sets status to "abandoned"
      for (const call of UpdateCommand.mock.calls) {
        expect(call[0].ExpressionAttributeValues[':abandoned']).toBe('abandoned');
      }
    });

    test('returns 0 when no active sessions exist', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const count = await autoAbandonActiveSessions('user-1');
      expect(count).toBe(0);
    });

    test('continues abandoning remaining sessions when one fails', async () => {
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      let updateCallCount = 0;
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'QueryCommand') {
          return Promise.resolve({
            Items: [
              { userId: 'user-1', sessionId: 'sess-ok' },
              { userId: 'user-1', sessionId: 'sess-fail' },
              { userId: 'user-1', sessionId: 'sess-ok2' },
            ],
          });
        }
        if (command._type === 'UpdateCommand') {
          updateCallCount++;
          if (updateCallCount === 2) {
            return Promise.reject(new Error('DynamoDB error'));
          }
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const count = await autoAbandonActiveSessions('user-1');

      // 2 succeeded, 1 failed
      expect(count).toBe(2);
      expect(UpdateCommand).toHaveBeenCalledTimes(3);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    test('queries with correct filter for active speaking sessions', async () => {
      const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
      mockSend.mockResolvedValueOnce({ Items: [] });

      await autoAbandonActiveSessions('user-42');

      const params = QueryCommand.mock.calls[0][0];
      expect(params.KeyConditionExpression).toContain('userId = :uid');
      expect(params.FilterExpression).toContain('#status = :active');
      expect(params.FilterExpression).toContain('#type = :speaking');
      expect(params.ExpressionAttributeValues[':uid']).toBe('user-42');
      expect(params.ExpressionAttributeValues[':active']).toBe('active');
      expect(params.ExpressionAttributeValues[':speaking']).toBe('speaking');
    });
  });

  // --- checkSessionExpiry ---

  describe('checkSessionExpiry', () => {
    const baseSession: SessionRecord = {
      userId: 'user-1',
      sessionId: 'session-1',
      type: 'speaking',
      status: 'active',
      jobPosition: 'Engineer',
      seniorityLevel: 'mid',
      questionCategory: 'general',
      questions: [],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    test('returns true when session is older than 24 hours', () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const session = { ...baseSession, updatedAt: oldDate };

      expect(checkSessionExpiry(session)).toBe(true);
    });

    test('returns false when session is within 24 hours', () => {
      const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      const session = { ...baseSession, updatedAt: recentDate };

      expect(checkSessionExpiry(session)).toBe(false);
    });

    test('returns false when session was just created', () => {
      const now = new Date().toISOString();
      const session = { ...baseSession, updatedAt: now };

      expect(checkSessionExpiry(session)).toBe(false);
    });

    test('returns true for exactly 24 hours + 1ms', () => {
      const exactExpiry = new Date(
        Date.now() - 24 * 60 * 60 * 1000 - 1
      ).toISOString();
      const session = { ...baseSession, updatedAt: exactExpiry };

      expect(checkSessionExpiry(session)).toBe(true);
    });

    test('returns false for exactly 24 hours', () => {
      // At exactly 24h, now - updatedAt === SESSION_EXPIRY_MS, which is NOT > so should be false
      const exactBoundary = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();
      const session = { ...baseSession, updatedAt: exactBoundary };

      expect(checkSessionExpiry(session)).toBe(false);
    });

    test('returns true for invalid updatedAt', () => {
      const session = { ...baseSession, updatedAt: 'not-a-date' };
      expect(checkSessionExpiry(session)).toBe(true);
    });

    test('handles old-format sessions without architecture field', () => {
      const recentDate = new Date(Date.now() - 1000).toISOString();
      const oldFormatSession = {
        userId: 'user-1',
        sessionId: 'old-session',
        type: 'speaking' as const,
        status: 'active' as const,
        jobPosition: 'Analyst',
        seniorityLevel: 'junior' as const,
        questionCategory: 'general' as const,
        questions: [],
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: recentDate,
        // No architecture, connectionId, or conversationHistory
      };

      expect(checkSessionExpiry(oldFormatSession)).toBe(false);
    });
  });
});
