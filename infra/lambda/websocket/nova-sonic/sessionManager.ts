// Session Manager for Nova Sonic hybrid architecture
// Manages session lifecycle in DynamoDB: create, get, update, end, auto-abandon, expiry check.
// Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 10.4

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  SessionRecord,
  SessionConfig,
  SummaryReport,
  ConversationTurn,
} from '../../../lib/types';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const SESSIONS_TABLE_NAME = process.env.SESSIONS_TABLE_NAME ?? '';

/** 24 hours in milliseconds */
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Creates a new speaking session with hybrid architecture fields.
 *
 * Generates a unique sessionId, sets status to "active" and architecture to "hybrid",
 * and stores all config fields in DynamoDB.
 *
 * @param userId - The authenticated user's ID
 * @param config - Session configuration (jobPosition, seniorityLevel, questionCategory)
 * @returns The created SessionRecord
 */
export async function createSession(
  userId: string,
  config: SessionConfig
): Promise<SessionRecord> {
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  const record: SessionRecord = {
    userId,
    sessionId,
    type: 'speaking',
    status: 'active',
    jobPosition: config.jobPosition,
    seniorityLevel: config.seniorityLevel,
    questionCategory: config.questionCategory,
    questions: [],
    createdAt: now,
    updatedAt: now,
    architecture: 'hybrid',
    conversationHistory: [],
  };

  await docClient.send(
    new PutCommand({
      TableName: SESSIONS_TABLE_NAME,
      Item: record,
    })
  );

  return record;
}

/**
 * Retrieves a session record from DynamoDB.
 *
 * Handles backward compatibility with old-format records that may be missing
 * the `architecture`, `connectionId`, and `conversationHistory` fields by
 * providing sensible defaults.
 *
 * @param userId - The user's ID (partition key)
 * @param sessionId - The session's ID (sort key)
 * @returns The SessionRecord with defaults applied, or null if not found
 */
export async function getSession(
  userId: string,
  sessionId: string
): Promise<SessionRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: SESSIONS_TABLE_NAME,
      Key: { userId, sessionId },
    })
  );

  if (!result.Item) {
    return null;
  }

  // Apply defaults for old-format records (backward compatibility — Req 10.4)
  const item = result.Item as Record<string, unknown>;
  return {
    ...item,
    architecture: item.architecture ?? 'pipeline',
    connectionId: item.connectionId ?? undefined,
    conversationHistory: (item.conversationHistory as ConversationTurn[]) ?? [],
  } as SessionRecord;
}

/**
 * Updates specific fields on an existing session record.
 *
 * Automatically sets `updatedAt` to the current timestamp.
 *
 * @param userId - The user's ID (partition key)
 * @param sessionId - The session's ID (sort key)
 * @param updates - Partial SessionRecord fields to update
 */
export async function updateSession(
  userId: string,
  sessionId: string,
  updates: Partial<
    Pick<
      SessionRecord,
      | 'status'
      | 'connectionId'
      | 'conversationHistory'
      | 'questions'
      | 'totalDurationSeconds'
      | 'summaryReport'
    >
  >
): Promise<void> {
  const now = new Date().toISOString();

  // Build dynamic UpdateExpression from the provided updates
  const expressionParts: string[] = ['updatedAt = :updatedAt'];
  const expressionValues: Record<string, unknown> = { ':updatedAt': now };
  const expressionNames: Record<string, string> = {};

  const entries = Object.entries(updates) as [string, unknown][];
  for (const [key, value] of entries) {
    if (value === undefined) continue;

    const placeholder = `:${key}`;
    // Use expression attribute names for reserved words
    const nameAlias = `#${key}`;
    expressionNames[nameAlias] = key;
    expressionParts.push(`${nameAlias} = ${placeholder}`);
    expressionValues[placeholder] = value;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: SESSIONS_TABLE_NAME,
      Key: { userId, sessionId },
      UpdateExpression: `SET ${expressionParts.join(', ')}`,
      ExpressionAttributeValues: expressionValues,
      ...(Object.keys(expressionNames).length > 0
        ? { ExpressionAttributeNames: expressionNames }
        : {}),
    })
  );
}

/**
 * Ends a session by setting its status to "completed" and storing the summary report.
 *
 * @param userId - The user's ID (partition key)
 * @param sessionId - The session's ID (sort key)
 * @param summaryReport - The final summary report for the session
 */
export async function endSession(
  userId: string,
  sessionId: string,
  summaryReport: SummaryReport
): Promise<void> {
  const now = new Date().toISOString();

  await docClient.send(
    new UpdateCommand({
      TableName: SESSIONS_TABLE_NAME,
      Key: { userId, sessionId },
      UpdateExpression:
        'SET #status = :completed, summaryReport = :summaryReport, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':completed': 'completed',
        ':summaryReport': summaryReport,
        ':updatedAt': now,
      },
    })
  );
}

/**
 * Abandons all active speaking sessions for a user.
 *
 * This is called before creating a new session to ensure only one active
 * speaking session exists per user at a time (Req 7.6).
 *
 * @param userId - The user's ID
 * @returns The number of sessions that were abandoned
 */
export async function autoAbandonActiveSessions(
  userId: string
): Promise<number> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: SESSIONS_TABLE_NAME,
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: '#status = :active AND #type = :speaking',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#type': 'type',
      },
      ExpressionAttributeValues: {
        ':uid': userId,
        ':active': 'active',
        ':speaking': 'speaking',
      },
    })
  );

  const activeSessions = result.Items ?? [];
  const now = new Date().toISOString();
  let abandonedCount = 0;

  for (const session of activeSessions) {
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: SESSIONS_TABLE_NAME,
          Key: {
            userId,
            sessionId: session.sessionId as string,
          },
          UpdateExpression: 'SET #status = :abandoned, updatedAt = :now',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':abandoned': 'abandoned',
            ':now': now,
          },
        })
      );
      abandonedCount++;
    } catch (error) {
      console.error(
        `[SessionManager] Failed to abandon session ${session.sessionId}:`,
        error
      );
    }
  }

  return abandonedCount;
}

/**
 * Checks whether a session has expired (updatedAt older than 24 hours).
 *
 * Handles old-format records gracefully — if `updatedAt` is missing or invalid,
 * the session is considered expired.
 *
 * @param session - The session record to check
 * @returns true if the session is expired, false otherwise
 */
export function checkSessionExpiry(session: SessionRecord): boolean {
  const updatedAt = new Date(session.updatedAt).getTime();

  // If updatedAt is invalid (NaN), treat as expired for safety
  if (isNaN(updatedAt)) {
    return true;
  }

  const now = Date.now();
  return now - updatedAt > SESSION_EXPIRY_MS;
}
