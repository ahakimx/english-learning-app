// JD Retention Cleanup Lambda
//
// Scheduled Lambda (invoked daily by EventBridge) that removes the
// `jdContext` field from Session_Records whose `updatedAt` timestamp is
// strictly older than `JD_RETENTION_DAYS`. The surrounding Session_Record
// is left intact — only the `jdContext` attribute is removed.
//
// Privacy: this handler NEVER logs JD content (neither `jdRawText` nor
// any field of `jdContext`). Logs contain only aggregate counts, the
// computed cutoff timestamp, and non-sensitive diagnostic identifiers.
//
// Requirements: 11.1, 11.2, 11.4, 11.5, 11.6

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const DEFAULT_RETENTION_DAYS = 30;
const MS_PER_DAY = 86_400_000;

function readRetentionDays(): number {
  const raw = process.env.JD_RETENTION_DAYS;
  if (raw === undefined || raw === '') return DEFAULT_RETENTION_DAYS;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RETENTION_DAYS;
  return parsed;
}

export const handler = async (): Promise<{ processed: number }> => {
  const tableName = process.env.SESSIONS_TABLE_NAME ?? 'EnglishLearningApp-Sessions';
  const retentionDays = readRetentionDays();
  const cutoff = new Date(Date.now() - retentionDays * MS_PER_DAY).toISOString();

  console.log(
    JSON.stringify({
      kind: 'jd_retention_cleanup',
      phase: 'start',
      retentionDays,
      cutoff,
    })
  );

  let processed = 0;
  let scanned = 0;
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const scanResult = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression:
          '#type = :sp AND #mode = :t AND attribute_exists(jdContext) AND updatedAt < :cutoff',
        ExpressionAttributeNames: {
          '#type': 'type',
          '#mode': 'mode',
        },
        ExpressionAttributeValues: {
          ':sp': 'speaking',
          ':t': 'targeted',
          ':cutoff': cutoff,
        },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    const items = scanResult.Items ?? [];
    scanned += items.length;

    for (const item of items) {
      const userId = item.userId as string | undefined;
      const sessionId = item.sessionId as string | undefined;
      if (!userId || !sessionId) continue;

      try {
        await docClient.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { userId, sessionId },
            UpdateExpression: 'REMOVE jdContext',
          })
        );
        processed += 1;
      } catch (updateError) {
        // Never log item content; only the error kind + key-less identifier.
        const errorName = (updateError as { name?: string }).name ?? 'Unknown';
        console.error(
          JSON.stringify({
            kind: 'jd_retention_cleanup',
            phase: 'update_failed',
            errorName,
          })
        );
      }
    }

    lastEvaluatedKey = scanResult.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);

  console.log(
    JSON.stringify({
      kind: 'jd_retention_cleanup',
      phase: 'end',
      retentionDays,
      cutoff,
      scanned,
      processed,
    })
  );

  return { processed };
};
