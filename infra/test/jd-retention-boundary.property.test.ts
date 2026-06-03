// Feature: jd-targeting
// Property 25: JD retention boundary correctness
// **Validates: Requirements 11.4, 11.5**
//
// For any Session_Record with `mode='targeted'`, a `jdContext`, and an
// `updatedAt` timestamp, after `jdRetentionCleanup` runs with the current
// time `now`:
//   - if (now - updatedAt) strictly exceeds JD_RETENTION_DAYS, jdContext
//     is absent from the stored item;
//   - otherwise jdContext is present and deep-equal to its pre-cleanup
//     value;
//   - all other fields of the Session_Record are unchanged.

import fc from 'fast-check';

// ----- In-memory DynamoDB simulator --------------------------------------
// The simulator handles the exact FilterExpression and UpdateExpression
// emitted by the retention handler; we do not attempt to be a general
// DynamoDB engine.

type Item = Record<string, unknown>;

// Shared across the closure the mocked `send` captures.
const store: { table: Map<string, Item> } = { table: new Map() };

function keyFor(userId: unknown, sessionId: unknown): string {
  return `${String(userId)}|${String(sessionId)}`;
}

function matchesRetentionFilter(
  item: Item,
  values: Record<string, unknown>
): boolean {
  // FilterExpression:
  //   #type = :sp AND #mode = :t AND attribute_exists(jdContext)
  //     AND updatedAt < :cutoff
  if (item.type !== values[':sp']) return false;
  if (item.mode !== values[':t']) return false;
  if (item.jdContext === undefined) return false;
  const updatedAt = item.updatedAt;
  const cutoff = values[':cutoff'];
  if (typeof updatedAt !== 'string' || typeof cutoff !== 'string') return false;
  return updatedAt < cutoff;
}

const mockSend = jest.fn(async (command: { _type?: string; params?: any }) => {
  if (command._type === 'ScanCommand') {
    const values = (command.params?.ExpressionAttributeValues ?? {}) as Record<
      string,
      unknown
    >;
    const matched = Array.from(store.table.values()).filter((it) =>
      matchesRetentionFilter(it, values)
    );
    // Single-page scan; no LastEvaluatedKey returned.
    return { Items: matched };
  }

  if (command._type === 'UpdateCommand') {
    const params = command.params ?? {};
    const k = keyFor(params.Key?.userId, params.Key?.sessionId);
    const existing = store.table.get(k);
    if (!existing) return {};
    if (params.UpdateExpression === 'REMOVE jdContext') {
      const { jdContext: _omit, ...rest } = existing as {
        jdContext?: unknown;
      } & Item;
      store.table.set(k, rest as Item);
    }
    return {};
  }

  return {};
});

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({ send: mockSend })),
  },
  ScanCommand: jest.fn((params: unknown) => ({ _type: 'ScanCommand', params })),
  UpdateCommand: jest.fn((params: unknown) => ({
    _type: 'UpdateCommand',
    params,
  })),
}));

// ----- Handler import (after mocks) --------------------------------------

const RETENTION_DAYS = 30;
const MS_PER_DAY = 86_400_000;

process.env.JD_RETENTION_DAYS = String(RETENTION_DAYS);
process.env.SESSIONS_TABLE_NAME = 'test-sessions';

// Fixed reference "now" used across the whole test so the boundary is
// deterministic. Chosen well away from daylight-saving edges.
const FIXED_NOW_ISO = '2024-06-15T12:00:00.000Z';
const FIXED_NOW_MS = Date.parse(FIXED_NOW_ISO);
const CUTOFF_ISO = new Date(FIXED_NOW_MS - RETENTION_DAYS * MS_PER_DAY).toISOString();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handler } = require('../lambda/chat/jdRetentionCleanup/index');

// ----- Generators --------------------------------------------------------

const seniorityArb = fc.constantFrom(
  'junior' as const,
  'mid' as const,
  'senior' as const,
  'lead' as const
);
const categoryArb = fc.constantFrom('general' as const, 'technical' as const);

const jdContextArb = fc.record({
  company: fc.string({ maxLength: 40 }),
  role: fc.string({ minLength: 1, maxLength: 40 }),
  technologies: fc.array(fc.string({ maxLength: 15 }), { maxLength: 5 }),
  responsibilities: fc.array(fc.string({ maxLength: 30 }), { maxLength: 5 }),
  requirements: fc.array(fc.string({ maxLength: 30 }), { maxLength: 5 }),
  softSkills: fc.array(fc.string({ maxLength: 15 }), { maxLength: 5 }),
  suggestedSeniority: seniorityArb,
  suggestedCategory: categoryArb,
  userNotes: fc.constant(''),
});

// Span of offsets that yields timestamps both strictly older than the
// cutoff (older than 30 days) and not-older-than the cutoff (<= 30 days).
// Range: [0, 60 days] before FIXED_NOW.
const updatedAtArb = fc
  .integer({ min: 0, max: 60 * MS_PER_DAY })
  .map((offsetMs) => new Date(FIXED_NOW_MS - offsetMs).toISOString());

const sessionRecordArb = fc.record({
  userId: fc.uuid(),
  sessionId: fc.uuid(),
  type: fc.constant('speaking'),
  mode: fc.constant('targeted'),
  status: fc.constantFrom('active' as const, 'completed' as const, 'abandoned' as const),
  createdAt: fc.constant(new Date(FIXED_NOW_MS - 90 * MS_PER_DAY).toISOString()),
  updatedAt: updatedAtArb,
  questions: fc.constant([] as unknown[]),
  jdContext: jdContextArb,
});

// Deduplicate by composite key so the simulator has one item per key.
const populationArb = fc
  .array(sessionRecordArb, { minLength: 0, maxLength: 15 })
  .map((items) => {
    const seen = new Set<string>();
    const unique: Item[] = [];
    for (const it of items) {
      const k = keyFor(it.userId, it.sessionId);
      if (seen.has(k)) continue;
      seen.add(k);
      unique.push(it as unknown as Item);
    }
    return unique;
  });

// ----- Property ----------------------------------------------------------

describe('Feature: jd-targeting, Property 25: JD retention boundary correctness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: FIXED_NOW_MS, doNotFake: ['nextTick'] });
    store.table = new Map();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('jdContext is removed iff updatedAt < cutoff; other fields unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(populationArb, async (population) => {
        // Fresh table per run.
        store.table = new Map();

        // Snapshot originals for deep-equality checks after cleanup.
        const originals = new Map<string, Item>();
        for (const it of population) {
          const k = keyFor(it.userId, it.sessionId);
          // Deep clone so later mutations cannot alias.
          const clone: Item = JSON.parse(JSON.stringify(it));
          store.table.set(k, clone);
          originals.set(k, JSON.parse(JSON.stringify(it)));
        }

        await handler();

        for (const [k, original] of originals.entries()) {
          const stored = store.table.get(k);
          expect(stored).toBeDefined();

          const wasStrictlyOlder =
            (original.updatedAt as string) < CUTOFF_ISO;

          if (wasStrictlyOlder) {
            // Boundary: strictly older than cutoff → jdContext removed.
            expect(stored!.jdContext).toBeUndefined();
          } else {
            // Within retention window → jdContext preserved deep-equal.
            expect(stored!.jdContext).toEqual(original.jdContext);
          }

          // All other fields must be unchanged regardless of the boundary.
          const fieldsToCheck = [
            'userId',
            'sessionId',
            'type',
            'mode',
            'status',
            'createdAt',
            'updatedAt',
            'questions',
          ] as const;
          for (const field of fieldsToCheck) {
            expect(stored![field]).toEqual(original[field]);
          }
        }
      }),
      { numRuns: 50 }
    );
  });
});
