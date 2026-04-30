// WebSocket Cleanup Lambda — handles $disconnect events
// Updates session status in DynamoDB when a WebSocket connection closes.
// Requirements: 7.4, 7.5

import type { APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

interface WebSocketDisconnectEvent {
  requestContext: {
    connectionId: string;
    routeKey: string;
    eventType?: string;
    requestId?: string;
    requestTimeEpoch?: number;
  };
}

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const SESSIONS_TABLE_NAME = process.env.SESSIONS_TABLE_NAME ?? '';

export const handler = async (
  event: WebSocketDisconnectEvent
): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId;
  const routeKey = event.requestContext.routeKey;

  console.log('[Cleanup] $disconnect event received', {
    connectionId,
    routeKey,
    requestId: event.requestContext.requestId,
    timestamp: new Date().toISOString(),
  });

  if (!SESSIONS_TABLE_NAME) {
    console.error('[Cleanup] SESSIONS_TABLE_NAME environment variable is not set');
    return { statusCode: 500, body: 'Server configuration error' };
  }

  try {
    // Scan for active sessions matching this connectionId.
    // No GSI on connectionId — Scan with FilterExpression is acceptable
    // because there is at most 1 active session per user (per design doc).
    const scanResult = await docClient.send(
      new ScanCommand({
        TableName: SESSIONS_TABLE_NAME,
        FilterExpression: '#connId = :connId AND #status = :active',
        ExpressionAttributeNames: {
          '#connId': 'connectionId',
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':connId': connectionId,
          ':active': 'active',
        },
      })
    );

    const activeSessions = scanResult.Items ?? [];

    console.log('[Cleanup] Scan result', {
      connectionId,
      activeSessionsFound: activeSessions.length,
    });

    if (activeSessions.length === 0) {
      console.log('[Cleanup] No active sessions found for connectionId, nothing to clean up', {
        connectionId,
      });
      return { statusCode: 200, body: 'Disconnected — no active sessions' };
    }

    // Update each matching active session to "abandoned"
    const now = new Date().toISOString();
    let updatedCount = 0;

    for (const session of activeSessions) {
      const userId = session.userId as string;
      const sessionId = session.sessionId as string;

      try {
        await docClient.send(
          new UpdateCommand({
            TableName: SESSIONS_TABLE_NAME,
            Key: { userId, sessionId },
            UpdateExpression: 'SET #status = :abandoned, updatedAt = :now',
            ConditionExpression: '#status = :active',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':abandoned': 'abandoned',
              ':now': now,
              ':active': 'active',
            },
          })
        );

        updatedCount++;
        console.log('[Cleanup] Session marked as abandoned', {
          connectionId,
          userId,
          sessionId,
        });
      } catch (updateError) {
        // ConditionalCheckFailedException means the session was already
        // updated by another process — safe to ignore.
        const errorName = (updateError as { name?: string }).name;
        if (errorName === 'ConditionalCheckFailedException') {
          console.log('[Cleanup] Session already updated (condition check failed), skipping', {
            connectionId,
            userId,
            sessionId,
          });
        } else {
          console.error('[Cleanup] Failed to update session status', {
            connectionId,
            userId,
            sessionId,
            error: updateError,
          });
        }
      }
    }

    console.log('[Cleanup] Cleanup complete', {
      connectionId,
      totalFound: activeSessions.length,
      totalUpdated: updatedCount,
    });

    return { statusCode: 200, body: 'Disconnected' };
  } catch (error) {
    console.error('[Cleanup] Unexpected error during cleanup', {
      connectionId,
      error,
    });

    // Return 200 even on error — API Gateway expects a successful response
    // from $disconnect handlers. The error is logged for debugging.
    return { statusCode: 200, body: 'Disconnected (with errors)' };
  }
};
