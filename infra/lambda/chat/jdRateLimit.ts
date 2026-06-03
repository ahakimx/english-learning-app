import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Parameters for the JD rate-limit helpers.
 *
 * All callers must pass the shared `docClient` and `tableName` (the Sessions
 * table) so this module stays free of global state and can be unit-tested with
 * `aws-sdk-client-mock`. The optional `now` parameter exists solely for tests
 * that need a deterministic clock; production call sites should let it default.
 */
export interface JdRateLimitParams {
  docClient: DynamoDBDocumentClient;
  tableName: string;
  userId: string;
  limit: number;
  now?: Date;
}

/** 48 hours, in seconds — DynamoDB TTL horizon for the daily counter item. */
const TTL_HORIZON_SECONDS = 48 * 3600;

/**
 * Derive the `rate:jd:YYYY-MM-DD` sessionId used as the DynamoDB sort key for
 * the per-user / per-UTC-day counter item.
 */
function buildRateLimitKey(userId: string, now: Date): { userId: string; sessionId: string } {
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return { userId, sessionId: `rate:jd:${day}` };
}

/**
 * Atomically increment the JD rate-limit counter for today.
 *
 * - Creates the counter item on first write with `count = 1` and a 48h TTL.
 * - On subsequent writes, increments `count` as long as it is strictly less
 *   than `limit`; when the counter has already reached `limit`, the
 *   ConditionExpression fails and this function returns `false` without
 *   mutating DynamoDB.
 *
 * @returns `true` on a successful increment; `false` when the daily limit has
 *          been reached.
 * @throws Any DynamoDB error other than `ConditionalCheckFailedException`.
 */
export async function incrementJdRateLimit(params: JdRateLimitParams): Promise<boolean> {
  const { docClient, tableName, userId, limit } = params;
  const now = params.now ?? new Date();
  const key = buildRateLimitKey(userId, now);
  const ttl = Math.floor(now.getTime() / 1000) + TTL_HORIZON_SECONDS;

  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: 'ADD #count :one SET #ttl = if_not_exists(#ttl, :ttl)',
        ConditionExpression: 'attribute_not_exists(#count) OR #count < :limit',
        ExpressionAttributeNames: {
          '#count': 'count',
          '#ttl': 'ttl',
        },
        ExpressionAttributeValues: {
          ':one': 1,
          ':limit': limit,
          ':ttl': ttl,
        },
      }),
    );
    return true;
  } catch (err) {
    if (isConditionalCheckFailed(err)) {
      return false;
    }
    throw err;
  }
}

/**
 * Compensation decrement used when a call that already incremented the
 * counter subsequently fails before returning a response to the client.
 *
 * Best-effort: the `ConditionExpression` guards against `count` ever dropping
 * below zero. If the counter is already at zero (or the item has expired via
 * TTL), `ConditionalCheckFailedException` is swallowed and `false` is
 * returned; all other DynamoDB errors propagate to the caller so they can be
 * surfaced in the existing error path.
 *
 * @returns `true` if the decrement happened; `false` if the counter was at
 *          zero (or absent) and no mutation was applied.
 * @throws Any DynamoDB error other than `ConditionalCheckFailedException`.
 */
export async function decrementJdRateLimit(params: JdRateLimitParams): Promise<boolean> {
  const { docClient, tableName, userId } = params;
  const now = params.now ?? new Date();
  const key = buildRateLimitKey(userId, now);

  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: 'ADD #count :neg',
        ConditionExpression: '#count > :zero',
        ExpressionAttributeNames: {
          '#count': 'count',
        },
        ExpressionAttributeValues: {
          ':neg': -1,
          ':zero': 0,
        },
      }),
    );
    return true;
  } catch (err) {
    if (isConditionalCheckFailed(err)) {
      return false;
    }
    throw err;
  }
}

/**
 * AWS SDK v3 surfaces DynamoDB condition failures with
 * `name === 'ConditionalCheckFailedException'`. We check both `name` and
 * `__type` to stay robust against minor SDK shape differences across versions
 * and in mocked clients.
 */
function isConditionalCheckFailed(err: unknown): boolean {
  if (err === null || typeof err !== 'object') {
    return false;
  }
  const maybe = err as { name?: unknown; __type?: unknown };
  return (
    maybe.name === 'ConditionalCheckFailedException' ||
    maybe.__type === 'ConditionalCheckFailedException'
  );
}
