import fc from 'fast-check';

// Mock AWS SDK clients BEFORE importing the handler.
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

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => ({ send: mockSend })),
  InvokeModelCommand: jest.fn((params: unknown) => ({ _type: 'InvokeModelCommand', params })),
}));

import { routeAction } from '../lambda/chat/index';
import type { JobDescriptionContext, ChatRequest } from '../lib/types';

// ============================================================================
// In-memory DynamoDB document-client store.
//
// The store simulates the subset of DynamoDB semantics that the Chat Lambda's
// start/resume flow exercises:
//   - PutCommand: inserts (or replaces) an item by composite (userId, sessionId).
//   - QueryCommand: returns items filtered by userId, status, and type.
//   - UpdateCommand: applies a naive `SET <attr> = <value>` parse.
//
// A JSON-based deep clone is used on every write and read so that objects
// stored in the "table" are structurally — not referentially — equal to the
// inputs/outputs of the handler. This makes `toEqual` a real deep-equality
// check rather than a reference identity check.
// ============================================================================

type Item = Record<string, unknown>;

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

interface InMemoryStore {
  put(item: Item): void;
  queryByUserId(userId: string, filter?: { status?: string; type?: string }): Item[];
  update(userId: string, sessionId: string, updates: Record<string, unknown>): void;
}

function makeStore(): InMemoryStore {
  const byKey = new Map<string, Item>();
  const keyOf = (userId: string, sessionId: string): string => `${userId}#${sessionId}`;

  return {
    put(item) {
      const uid = item.userId as string;
      const sid = item.sessionId as string;
      byKey.set(keyOf(uid, sid), deepClone(item));
    },
    queryByUserId(userId, filter) {
      const matches: Item[] = [];
      for (const item of byKey.values()) {
        if (item.userId !== userId) continue;
        if (filter?.status !== undefined && item.status !== filter.status) continue;
        if (filter?.type !== undefined && item.type !== filter.type) continue;
        matches.push(deepClone(item));
      }
      return matches;
    },
    update(userId, sessionId, updates) {
      const key = keyOf(userId, sessionId);
      const existing = byKey.get(key);
      if (!existing) return;
      byKey.set(key, { ...existing, ...updates });
    },
  };
}

/**
 * Parse a naive `SET <attr> = <value> [, <attr> = <value> ...]` UpdateExpression.
 * Only handles the patterns used by `handleStartSession` / `handleResumeSession`
 * (status + updatedAt). Unknown expressions yield an empty diff.
 */
function parseSetUpdates(params: {
  UpdateExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: Record<string, unknown>;
}): Record<string, unknown> {
  const expr = params.UpdateExpression ?? '';
  const names = params.ExpressionAttributeNames ?? {};
  const values = params.ExpressionAttributeValues ?? {};

  const out: Record<string, unknown> = {};
  const setMatch = expr.match(/^\s*SET\s+(.+)$/i);
  if (!setMatch) return out;

  const assignments = setMatch[1].split(',').map((s) => s.trim());
  for (const assignment of assignments) {
    const eq = assignment.indexOf('=');
    if (eq < 0) continue;
    const lhsRaw = assignment.slice(0, eq).trim();
    const rhsRaw = assignment.slice(eq + 1).trim();
    const lhs = lhsRaw.startsWith('#') ? names[lhsRaw] ?? lhsRaw : lhsRaw;
    const value = rhsRaw.startsWith(':') ? values[rhsRaw] : rhsRaw;
    out[lhs] = value;
  }
  return out;
}

/**
 * Install the in-memory dispatcher on the shared mockSend. Returns the store
 * so individual tests can seed or inspect it when needed.
 */
function installInMemoryStore(): InMemoryStore {
  const store = makeStore();
  mockSend.mockImplementation((command: { _type?: string; params?: any }) => {
    const params = command.params ?? {};
    switch (command._type) {
      case 'PutCommand': {
        store.put(params.Item as Item);
        return Promise.resolve({});
      }
      case 'QueryCommand': {
        const values = params.ExpressionAttributeValues ?? {};
        const items = store.queryByUserId(values[':uid'] as string, {
          status: values[':active'] as string | undefined,
          type: values[':speaking'] as string | undefined,
        });
        return Promise.resolve({ Items: items });
      }
      case 'UpdateCommand': {
        const key = params.Key ?? {};
        const updates = parseSetUpdates(params);
        store.update(key.userId as string, key.sessionId as string, updates);
        return Promise.resolve({});
      }
      case 'GetCommand':
      default:
        return Promise.resolve({});
    }
  });
  return store;
}

// ============================================================================
// Generators
// ============================================================================

// List entries must be non-empty so that array-order preservation is observable.
// role must be non-empty after trim() (Requirement 6.5).
const jdContextArb: fc.Arbitrary<JobDescriptionContext> = fc.record({
  company: fc.string(),
  role: fc.string({ minLength: 1 }).filter((s) => s.trim() !== ''),
  technologies: fc.array(fc.string({ minLength: 1 })),
  responsibilities: fc.array(fc.string({ minLength: 1 })),
  requirements: fc.array(fc.string({ minLength: 1 })),
  softSkills: fc.array(fc.string({ minLength: 1 })),
  suggestedSeniority: fc.constantFrom(
    'junior' as const,
    'mid' as const,
    'senior' as const,
    'lead' as const,
  ),
  suggestedCategory: fc.constantFrom('general' as const, 'technical' as const),
  userNotes: fc.string(),
});

// ============================================================================
// Feature: jd-targeting, Property 29: JD context DynamoDB round-trip
// **Validates: Requirements 14.1, 14.2, 14.3**
//
// For any JobDescriptionContext `ctx`:
//   (a) A targeted start_session followed by resume_session for the same user
//       SHALL yield a sessionData.jdContext deep-equal to `ctx`, with array
//       order preserved across all four list fields.
//   (b) A quick-mode start_session (mode='quick' or mode omitted) followed by
//       resume_session SHALL yield sessionData.jdContext === undefined.
// ============================================================================
describe('Feature: jd-targeting, Property 29: JD context DynamoDB round-trip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions';
  });

  test('Targeted: for any JobDescriptionContext, handleStartSession → handleResumeSession returns a deeply-equal jdContext with list order preserved (Requirements 14.1, 14.2)', async () => {
    await fc.assert(
      fc.asyncProperty(jdContextArb, async (ctx) => {
        jest.clearAllMocks();
        installInMemoryStore();

        // Unique userId per run so we never leak state across runs even if the
        // mock is accidentally shared.
        const userId = `user-${Math.random().toString(36).slice(2, 10)}`;

        // --- Write phase: start_session with mode='targeted' and a jdContext.
        const startRequest: ChatRequest = {
          action: 'start_session',
          mode: 'targeted',
          jobPosition: ctx.role,
          jdContext: ctx,
        };
        const startResponse = await routeAction(userId, startRequest);
        expect(startResponse.type).toBe('question');

        // --- Read phase: resume_session for the same user.
        const resumeResponse = await routeAction(userId, { action: 'resume_session' });
        expect(resumeResponse.type).toBe('session_resumed');

        const sessionData = resumeResponse.sessionData;
        expect(sessionData).toBeDefined();

        // Requirement 14.1 — jdContext field values round-trip deeply equal.
        expect(sessionData!.jdContext).toBeDefined();
        expect(sessionData!.jdContext).toEqual(ctx);

        // Requirement 14.2 — array order is preserved for every list field.
        expect(sessionData!.jdContext!.technologies).toEqual(ctx.technologies);
        expect(sessionData!.jdContext!.responsibilities).toEqual(ctx.responsibilities);
        expect(sessionData!.jdContext!.requirements).toEqual(ctx.requirements);
        expect(sessionData!.jdContext!.softSkills).toEqual(ctx.softSkills);

        // The persisted mode must also surface as 'targeted' on resume so the
        // client can re-enter targeted-mode branches (Requirement 14.1 spirit).
        expect(sessionData!.mode).toBe('targeted');
      }),
      { numRuns: 50 },
    );
  });

  test('Quick: start_session with mode=quick or no mode persists no jdContext, so resume returns sessionData.jdContext === undefined (Requirement 14.3)', async () => {
    // Two equivalent quick-mode shapes: explicit 'quick' and omitted entirely.
    const quickModeArb = fc.oneof(
      fc.constant<'quick' | undefined>('quick'),
      fc.constant<'quick' | undefined>(undefined),
    );

    const jobPositionArb = fc.constantFrom(
      'software-engineer',
      'product-manager',
      'data-analyst',
      'marketing-manager',
      'ui-ux-designer',
    );

    await fc.assert(
      fc.asyncProperty(quickModeArb, jobPositionArb, async (mode, jobPosition) => {
        jest.clearAllMocks();
        installInMemoryStore();

        const userId = `user-${Math.random().toString(36).slice(2, 10)}`;

        const startRequest: ChatRequest = {
          action: 'start_session',
          jobPosition,
          ...(mode !== undefined ? { mode } : {}),
        };

        const startResponse = await routeAction(userId, startRequest);
        expect(startResponse.type).toBe('question');

        const resumeResponse = await routeAction(userId, { action: 'resume_session' });
        expect(resumeResponse.type).toBe('session_resumed');

        const sessionData = resumeResponse.sessionData;
        expect(sessionData).toBeDefined();

        // Requirement 14.3 — jdContext is absent/undefined on quick-mode records.
        expect(sessionData!.jdContext).toBeUndefined();
      }),
      { numRuns: 25 },
    );
  });
});
