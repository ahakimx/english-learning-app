import fc from 'fast-check';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { incrementJdRateLimit, decrementJdRateLimit } from '../lambda/chat/jdRateLimit';

/**
 * In-memory DynamoDB simulator that honors the two UpdateCommand shapes
 * produced by `jdRateLimit.ts`:
 *
 *   1. Increment (from `incrementJdRateLimit`):
 *        UpdateExpression: 'ADD #count :one SET #ttl = if_not_exists(#ttl, :ttl)'
 *        ConditionExpression: 'attribute_not_exists(#count) OR #count < :limit'
 *
 *   2. Decrement (from `decrementJdRateLimit`):
 *        UpdateExpression: 'ADD #count :neg'
 *        ConditionExpression: '#count > :zero'
 *
 * The simulator enforces the ConditionExpression, throws a
 * ConditionalCheckFailedException-shaped error on failure, and otherwise
 * mutates an in-memory `Map<string, { count, ttl }>` keyed by
 * `${userId}/${sessionId}`.
 *
 * Unsupported commands are rejected so the test suite stays honest — if the
 * implementation ever emits a different shape, the test will surface it.
 */
class InMemoryDynamoDb {
  private store = new Map<string, { count: number; ttl: number }>();

  /** Matches the DocumentClient `send(command)` surface that the helpers call. */
  send = async (command: unknown): Promise<unknown> => {
    if (!(command instanceof UpdateCommand)) {
      throw new Error(
        `InMemoryDynamoDb received unsupported command: ${(command as { constructor?: { name?: string } })?.constructor?.name}`,
      );
    }

    const input = command.input;
    const key = input.Key as { userId: string; sessionId: string };
    const storeKey = `${key.userId}/${key.sessionId}`;
    const existing = this.store.get(storeKey);

    const updateExpression = input.UpdateExpression ?? '';
    const values = (input.ExpressionAttributeValues ?? {}) as Record<string, number>;

    // --- Increment path ---
    if (updateExpression.includes('ADD #count :one') && updateExpression.includes('SET #ttl')) {
      const limit = values[':limit'];
      const conditionPassed = existing === undefined || existing.count < limit;
      if (!conditionPassed) {
        throw makeConditionalCheckFailed();
      }
      const delta = values[':one'];
      if (existing === undefined) {
        // First write: seed count + TTL via `if_not_exists(#ttl, :ttl)`.
        this.store.set(storeKey, { count: delta, ttl: values[':ttl'] });
      } else {
        // Subsequent writes: `if_not_exists` keeps the original TTL.
        this.store.set(storeKey, { count: existing.count + delta, ttl: existing.ttl });
      }
      return {};
    }

    // --- Decrement path ---
    if (updateExpression === 'ADD #count :neg') {
      const conditionPassed = existing !== undefined && existing.count > 0;
      if (!conditionPassed) {
        throw makeConditionalCheckFailed();
      }
      const delta = values[':neg'];
      this.store.set(storeKey, { count: existing!.count + delta, ttl: existing!.ttl });
      return {};
    }

    throw new Error(`InMemoryDynamoDb received unexpected UpdateExpression: ${updateExpression}`);
  };

  getCount(userId: string, sessionId: string): number {
    return this.store.get(`${userId}/${sessionId}`)?.count ?? 0;
  }

  hasItem(userId: string, sessionId: string): boolean {
    return this.store.has(`${userId}/${sessionId}`);
  }
}

function makeConditionalCheckFailed(): Error {
  const err = new Error('The conditional request failed');
  err.name = 'ConditionalCheckFailedException';
  return err;
}

/** Build the DynamoDB sort key the helper uses for a given UTC date. */
function rateKey(now: Date): string {
  return `rate:jd:${now.toISOString().slice(0, 10)}`;
}

// --- Generators ---

const userIdArb = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0);
const limitArb = fc.integer({ min: 1, max: 10 });
// Fixed UTC date (avoids flakiness from day boundaries while fc runs many cases).
const fixedDate = new Date('2025-01-15T12:00:00.000Z');

const TABLE = 'test-sessions-table';

// **Validates: Requirements 4.1, 4.2, 4.4, 4.5**
describe('Property 4: Rate limit counter equals net successful calls per user per day', () => {
  test('after N successful increments (all returning true), the stored count equals N', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        limitArb,
        fc.integer({ min: 0, max: 10 }),
        async (userId, limit, attempts) => {
          const db = new InMemoryDynamoDb();
          let successes = 0;
          for (let i = 0; i < attempts; i++) {
            const ok = await incrementJdRateLimit({
              docClient: db as any,
              tableName: TABLE,
              userId,
              limit,
              now: fixedDate,
            });
            if (ok) successes++;
          }
          expect(db.getCount(userId, rateKey(fixedDate))).toBe(successes);
          // Successes never exceed the limit.
          expect(successes).toBeLessThanOrEqual(limit);
          // Successes equal min(attempts, limit): every pre-limit attempt succeeds.
          expect(successes).toBe(Math.min(attempts, limit));
        },
      ),
      { numRuns: 100 },
    );
  });

  test('when count reaches the limit, the next increment returns false and does not mutate the count', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, limitArb, async (userId, limit) => {
        const db = new InMemoryDynamoDb();
        // Saturate the counter up to the limit.
        for (let i = 0; i < limit; i++) {
          const ok = await incrementJdRateLimit({
            docClient: db as any,
            tableName: TABLE,
            userId,
            limit,
            now: fixedDate,
          });
          expect(ok).toBe(true);
        }
        const preCount = db.getCount(userId, rateKey(fixedDate));
        expect(preCount).toBe(limit);

        // The very next increment must be rejected without side effects.
        const ok = await incrementJdRateLimit({
          docClient: db as any,
          tableName: TABLE,
          userId,
          limit,
          now: fixedDate,
        });
        expect(ok).toBe(false);
        expect(db.getCount(userId, rateKey(fixedDate))).toBe(preCount);

        // Further over-limit attempts also stay rejected and non-mutating.
        const ok2 = await incrementJdRateLimit({
          docClient: db as any,
          tableName: TABLE,
          userId,
          limit,
          now: fixedDate,
        });
        expect(ok2).toBe(false);
        expect(db.getCount(userId, rateKey(fixedDate))).toBe(preCount);
      }),
      { numRuns: 50 },
    );
  });

  test('a successful increment followed by a decrement returns the count to its pre-increment value', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        limitArb,
        fc.integer({ min: 0, max: 5 }),
        async (userId, limit, seed) => {
          const db = new InMemoryDynamoDb();
          const clampedSeed = Math.min(seed, limit);

          // Seed with `clampedSeed` successful increments.
          for (let i = 0; i < clampedSeed; i++) {
            const ok = await incrementJdRateLimit({
              docClient: db as any,
              tableName: TABLE,
              userId,
              limit,
              now: fixedDate,
            });
            expect(ok).toBe(true);
          }
          const before = db.getCount(userId, rateKey(fixedDate));

          // Only run the round-trip when an increment is actually possible.
          if (before < limit) {
            const inc = await incrementJdRateLimit({
              docClient: db as any,
              tableName: TABLE,
              userId,
              limit,
              now: fixedDate,
            });
            expect(inc).toBe(true);
            expect(db.getCount(userId, rateKey(fixedDate))).toBe(before + 1);

            const dec = await decrementJdRateLimit({
              docClient: db as any,
              tableName: TABLE,
              userId,
              limit,
              now: fixedDate,
            });
            expect(dec).toBe(true);
            expect(db.getCount(userId, rateKey(fixedDate))).toBe(before);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test('decrement with count === 0 returns false and does not drive the count below zero', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, limitArb, async (userId, limit) => {
        const db = new InMemoryDynamoDb();

        // Counter is absent → decrement must be a no-op.
        const onEmpty = await decrementJdRateLimit({
          docClient: db as any,
          tableName: TABLE,
          userId,
          limit,
          now: fixedDate,
        });
        expect(onEmpty).toBe(false);
        expect(db.hasItem(userId, rateKey(fixedDate))).toBe(false);
        expect(db.getCount(userId, rateKey(fixedDate))).toBe(0);

        // Increment once then decrement twice — the second decrement must
        // short-circuit without dropping the count below zero.
        const inc = await incrementJdRateLimit({
          docClient: db as any,
          tableName: TABLE,
          userId,
          limit,
          now: fixedDate,
        });
        expect(inc).toBe(true);
        expect(db.getCount(userId, rateKey(fixedDate))).toBe(1);

        const firstDec = await decrementJdRateLimit({
          docClient: db as any,
          tableName: TABLE,
          userId,
          limit,
          now: fixedDate,
        });
        expect(firstDec).toBe(true);
        expect(db.getCount(userId, rateKey(fixedDate))).toBe(0);

        const secondDec = await decrementJdRateLimit({
          docClient: db as any,
          tableName: TABLE,
          userId,
          limit,
          now: fixedDate,
        });
        expect(secondDec).toBe(false);
        expect(db.getCount(userId, rateKey(fixedDate))).toBe(0);
      }),
      { numRuns: 50 },
    );
  });

  test('different users have independent counters on the same day', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        userIdArb,
        limitArb,
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 10 }),
        async (userA, userB, limit, attemptsA, attemptsB) => {
          // Only run when the two users are distinct; otherwise their writes
          // target the same partition key and the property is vacuous.
          fc.pre(userA !== userB);

          const db = new InMemoryDynamoDb();

          let successesA = 0;
          for (let i = 0; i < attemptsA; i++) {
            if (
              await incrementJdRateLimit({
                docClient: db as any,
                tableName: TABLE,
                userId: userA,
                limit,
                now: fixedDate,
              })
            ) {
              successesA++;
            }
          }

          let successesB = 0;
          for (let i = 0; i < attemptsB; i++) {
            if (
              await incrementJdRateLimit({
                docClient: db as any,
                tableName: TABLE,
                userId: userB,
                limit,
                now: fixedDate,
              })
            ) {
              successesB++;
            }
          }

          expect(db.getCount(userA, rateKey(fixedDate))).toBe(successesA);
          expect(db.getCount(userB, rateKey(fixedDate))).toBe(successesB);
          // Each user was only ever capped by their own limit.
          expect(successesA).toBe(Math.min(attemptsA, limit));
          expect(successesB).toBe(Math.min(attemptsB, limit));
        },
      ),
      { numRuns: 50 },
    );
  });

  test('different UTC days use different sessionId keys, so the counter resets per day', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, limitArb, async (userId, limit) => {
        const db = new InMemoryDynamoDb();
        const dayOne = new Date('2025-01-15T23:59:00.000Z');
        const dayTwo = new Date('2025-01-16T00:01:00.000Z');

        // Saturate day one.
        for (let i = 0; i < limit; i++) {
          const ok = await incrementJdRateLimit({
            docClient: db as any,
            tableName: TABLE,
            userId,
            limit,
            now: dayOne,
          });
          expect(ok).toBe(true);
        }
        expect(db.getCount(userId, rateKey(dayOne))).toBe(limit);

        // Day one is now over-limit.
        const overDayOne = await incrementJdRateLimit({
          docClient: db as any,
          tableName: TABLE,
          userId,
          limit,
          now: dayOne,
        });
        expect(overDayOne).toBe(false);

        // Day two is untouched — the first day-two increment must succeed.
        const firstDayTwo = await incrementJdRateLimit({
          docClient: db as any,
          tableName: TABLE,
          userId,
          limit,
          now: dayTwo,
        });
        expect(firstDayTwo).toBe(true);
        expect(db.getCount(userId, rateKey(dayTwo))).toBe(1);
        // Day one's counter is unchanged by day-two writes.
        expect(db.getCount(userId, rateKey(dayOne))).toBe(limit);
        expect(rateKey(dayOne)).not.toEqual(rateKey(dayTwo));
      }),
      { numRuns: 50 },
    );
  });
});
