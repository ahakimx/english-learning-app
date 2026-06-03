/**
 * Feature: jd-targeting, Property 8: Invalid targeted start_session is rejected
 * Validates: Requirement 6.5
 *
 * For any `start_session` request with `mode='targeted'` and `jdContext`
 * absent, null, or missing a non-empty trimmed string `role`, the Chat_Lambda
 * `validateRequest` SHALL return `{ valid: false, code: 'INVALID_TARGETED_REQUEST' }`.
 *
 * Conversely, a `start_session` request with `mode='targeted'` and a
 * `jdContext` whose `role` is a non-empty string (after `.trim()`) SHALL
 * return `{ valid: true }` when the rest of the request is well-formed.
 *
 * Validation is pure — it must not invoke Nova Pro, DynamoDB, or the rate
 * limiter.
 */
import fc from 'fast-check';

// Mock AWS SDK clients before importing the handler — validation is pure but
// the module-level SDK clients get constructed on import.
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

import { validateRequest } from '../lambda/chat/index';

// --- Fixtures / helpers ---

/** A valid `JobDescriptionContext` with a non-empty trimmed role. */
const validJdContext = {
  company: 'Acme Corp',
  role: 'Senior Backend Engineer',
  technologies: ['TypeScript', 'AWS Lambda'],
  responsibilities: ['Design APIs', 'Mentor juniors'],
  requirements: ['5+ years backend'],
  softSkills: ['Communication'],
  suggestedSeniority: 'senior' as const,
  suggestedCategory: 'technical' as const,
  userNotes: '',
};

/** Build a well-formed targeted `start_session` request body, overriding `jdContext`. */
function buildTargetedStartBody(jdContextOverride: { jdContext?: unknown; omit?: boolean }): Record<string, unknown> {
  const base: Record<string, unknown> = {
    action: 'start_session',
    mode: 'targeted',
    jobPosition: 'software-engineer',
  };
  if (!jdContextOverride.omit) {
    base.jdContext = jdContextOverride.jdContext;
  }
  return base;
}

function expectInvalidTargetedRequest(body: Record<string, unknown>) {
  const result = validateRequest(body);
  expect(result.valid).toBe(false);
  if (result.valid === false) {
    expect(result.code).toBe('INVALID_TARGETED_REQUEST');
  }
  // Pure validation — must not touch AWS.
  expect(mockSend).not.toHaveBeenCalled();
}

// --- Concrete negative cases ---

describe('Property 8: Invalid targeted start_session is rejected — concrete cases', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  test('case 1: mode=targeted, no jdContext key → INVALID_TARGETED_REQUEST', () => {
    expectInvalidTargetedRequest(buildTargetedStartBody({ omit: true }));
  });

  test('case 2: mode=targeted, jdContext: null → INVALID_TARGETED_REQUEST', () => {
    expectInvalidTargetedRequest(buildTargetedStartBody({ jdContext: null }));
  });

  test('case 3: mode=targeted, jdContext: {} (no role) → INVALID_TARGETED_REQUEST', () => {
    expectInvalidTargetedRequest(buildTargetedStartBody({ jdContext: {} }));
  });

  test("case 4: mode=targeted, jdContext: { role: '' } → INVALID_TARGETED_REQUEST", () => {
    expectInvalidTargetedRequest(buildTargetedStartBody({ jdContext: { role: '' } }));
  });

  test("case 5: mode=targeted, jdContext: { role: '   ' } (whitespace role) → INVALID_TARGETED_REQUEST", () => {
    expectInvalidTargetedRequest(buildTargetedStartBody({ jdContext: { role: '   ' } }));
  });

  test('case 6: mode=targeted, jdContext: { role: 123 } (non-string role) → INVALID_TARGETED_REQUEST', () => {
    expectInvalidTargetedRequest(
      buildTargetedStartBody({ jdContext: { role: 123 as unknown as string } }),
    );
  });
});

// --- Concrete positive case ---

describe('Property 8: valid targeted start_session — positive sanity check', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  test("mode=targeted, jdContext: { role: 'Engineer', ...valid } → { valid: true }", () => {
    const body = buildTargetedStartBody({ jdContext: { ...validJdContext, role: 'Engineer' } });
    const result = validateRequest(body);

    expect(result.valid).toBe(true);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

// --- Property-based fuzz ---

/**
 * Arbitrary producing role-like values that are INVALID per the spec:
 * - non-string (number, boolean, null, undefined, object, array)
 * - empty string
 * - whitespace-only string (any combination of U+0020 / U+0009 / U+000A / U+000D)
 */
const invalidRoleArb = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.integer(),
  fc.float({ noNaN: true }),
  fc.boolean(),
  fc.record({}),
  fc.array(fc.string(), { maxLength: 3 }),
  fc.constant(''),
  fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 10 }),
);

/**
 * Arbitrary producing role values that are VALID per the spec:
 * strings whose `.trim()` is non-empty. We build them as
 * `leading + core + trailing` where `core` is guaranteed to contain at
 * least one non-whitespace character, then assert the precondition.
 */
const whitespaceArb = fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { maxLength: 3 });
const nonWhitespaceChar = fc
  .integer({ min: 33, max: 126 }) // printable ASCII, no space
  .map((n) => String.fromCharCode(n));
const nonWhitespaceCore = fc
  .tuple(
    nonWhitespaceChar,
    fc.stringOf(
      fc.integer({ min: 32, max: 126 }).map((n) => String.fromCharCode(n)),
      { maxLength: 20 },
    ),
  )
  .map(([head, rest]) => head + rest);
const validRoleArb = fc
  .tuple(whitespaceArb, nonWhitespaceCore, whitespaceArb)
  .map(([lead, core, trail]) => lead + core + trail);

describe('Property 8: fuzz — only non-empty trimmed string roles pass', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  test('any invalid role (non-string, empty, or whitespace-only) yields INVALID_TARGETED_REQUEST', () => {
    fc.assert(
      fc.property(invalidRoleArb, (role) => {
        // Sanity: a valid role must be a string AND have a non-empty trim().
        const isValidRole = typeof role === 'string' && role.trim() !== '';
        expect(isValidRole).toBe(false);

        const body = buildTargetedStartBody({ jdContext: { ...validJdContext, role } });
        const result = validateRequest(body);

        expect(result.valid).toBe(false);
        if (result.valid === false) {
          expect(result.code).toBe('INVALID_TARGETED_REQUEST');
        }
        expect(mockSend).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  test('any non-empty trimmed string role yields { valid: true }', () => {
    fc.assert(
      fc.property(validRoleArb, (role) => {
        // Precondition: generator actually produces a non-empty trimmed role.
        expect(typeof role).toBe('string');
        expect(role.trim()).not.toBe('');

        const body = buildTargetedStartBody({ jdContext: { ...validJdContext, role } });
        const result = validateRequest(body);

        expect(result.valid).toBe(true);
        expect(mockSend).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  test('omitting jdContext entirely yields INVALID_TARGETED_REQUEST regardless of other fields', () => {
    // Fuzz over arbitrary (optional) seniorityLevel / questionCategory payloads
    // to show the rejection is driven by jdContext, not by other fields.
    const extraArb = fc.record(
      {
        seniorityLevel: fc.option(
          fc.constantFrom('junior', 'mid', 'senior', 'lead'),
          { nil: undefined },
        ),
        questionCategory: fc.option(
          fc.constantFrom('general', 'technical'),
          { nil: undefined },
        ),
      },
      { requiredKeys: [] },
    );

    fc.assert(
      fc.property(extraArb, (extra) => {
        const body: Record<string, unknown> = {
          action: 'start_session',
          mode: 'targeted',
          jobPosition: 'software-engineer',
          ...extra,
        };
        const result = validateRequest(body);

        expect(result.valid).toBe(false);
        if (result.valid === false) {
          expect(result.code).toBe('INVALID_TARGETED_REQUEST');
        }
        expect(mockSend).not.toHaveBeenCalled();
      }),
      { numRuns: 50 },
    );
  });
});
