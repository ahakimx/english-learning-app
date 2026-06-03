/**
 * Feature: jd-targeting, Property 21: analyze_job_description enforces explicit mode
 * **Validates: Requirement 10.5**
 *
 * For any request body where `action = 'analyze_job_description'` and `mode` is
 * NOT `'quick'` and NOT `'targeted'` (e.g., missing, null, empty string,
 * `'QUICK'`, an arbitrary random string, or a non-string value) and
 * `jdRawText` has a valid length (100..10000), `validateRequest` SHALL return
 * `{ valid: false, code: 'INVALID_MODE' }`.
 *
 * Conversely, when `mode` equals exactly `'quick'` or `'targeted'` and the JD
 * text is within the accepted length range, `validateRequest` SHALL return
 * `{ valid: true }`.
 *
 * This test exercises the requirement that `analyze_job_description` is the
 * one action for which `mode` must be explicit — any other action is allowed
 * to omit the field and default to Quick (see Property 22).
 */
import fc from 'fast-check';

// Mock AWS SDK clients before importing the handler. Validation must not touch
// any of these, but the module-level SDK clients are constructed on import.
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

// --- Generators ---

/**
 * Valid JD text: any string with length in [100, 10000]. The task explicitly
 * requests `fc.string({ minLength: 100, maxLength: 10000 })`.
 */
const validJdRawTextArb = fc.string({ minLength: 100, maxLength: 10000 });

/**
 * Invalid mode values for `analyze_job_description`. A mode is invalid iff it
 * is not exactly the string `'quick'` or `'targeted'`. The union covers:
 *   - arbitrary strings filtered to exclude the two valid literals
 *   - specific non-string sentinels that should never be accepted as a mode
 *     (undefined, null, 0, object, array)
 */
const invalidModeArb = fc.oneof(
  fc.string().filter((m) => m !== 'quick' && m !== 'targeted'),
  fc.constantFrom<unknown>(undefined, null, 0, {}, []),
);

/**
 * Build a well-formed `analyze_job_description` request body, optionally
 * omitting the mode key entirely when `mode === undefined`.
 */
function buildBody(mode: unknown, jdRawText: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    action: 'analyze_job_description',
    jdRawText,
  };
  if (mode !== undefined) {
    body.mode = mode;
  }
  return body;
}

// ─── Property tests ───

describe('Feature: jd-targeting, Property 21: analyze_job_description enforces explicit mode', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  test('any mode that is not exactly "quick" or "targeted" yields INVALID_MODE', () => {
    fc.assert(
      fc.property(invalidModeArb, validJdRawTextArb, (mode, jdRawText) => {
        // Generator sanity check: the random string branch must never produce
        // the two reserved literals. The constantFrom branch produces non-strings.
        if (typeof mode === 'string') {
          expect(mode).not.toBe('quick');
          expect(mode).not.toBe('targeted');
        }
        // JD length is unambiguously valid so INVALID_MODE is the only possible
        // failure code (i.e. the test does not accidentally also tickle
        // JD_TOO_SHORT / JD_TOO_LONG).
        expect(jdRawText.length).toBeGreaterThanOrEqual(100);
        expect(jdRawText.length).toBeLessThanOrEqual(10000);

        const result = validateRequest(buildBody(mode, jdRawText));

        expect(result.valid).toBe(false);
        if (result.valid === false) {
          expect(result.code).toBe('INVALID_MODE');
        }
        // Validation must not invoke any AWS client.
        expect(mockSend).not.toHaveBeenCalled();
      }),
      { numRuns: 200 },
    );
  });

  test('mode = "quick" with valid jdRawText yields { valid: true }', () => {
    fc.assert(
      fc.property(validJdRawTextArb, (jdRawText) => {
        expect(jdRawText.length).toBeGreaterThanOrEqual(100);
        expect(jdRawText.length).toBeLessThanOrEqual(10000);

        const result = validateRequest(buildBody('quick', jdRawText));

        expect(result.valid).toBe(true);
        expect(mockSend).not.toHaveBeenCalled();
      }),
      { numRuns: 50 },
    );
  });

  test('mode = "targeted" with valid jdRawText yields { valid: true }', () => {
    fc.assert(
      fc.property(validJdRawTextArb, (jdRawText) => {
        expect(jdRawText.length).toBeGreaterThanOrEqual(100);
        expect(jdRawText.length).toBeLessThanOrEqual(10000);

        const result = validateRequest(buildBody('targeted', jdRawText));

        expect(result.valid).toBe(true);
        expect(mockSend).not.toHaveBeenCalled();
      }),
      { numRuns: 50 },
    );
  });
});

// ─── Concrete sentinel examples (sanity checks for the invalid-mode branch) ───

describe('analyze_job_description mode enforcement — concrete sentinel cases', () => {
  const validJd = 'a'.repeat(200);

  beforeEach(() => {
    mockSend.mockReset();
  });

  test('missing mode key is rejected as INVALID_MODE', () => {
    const result = validateRequest({
      action: 'analyze_job_description',
      jdRawText: validJd,
    });

    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.code).toBe('INVALID_MODE');
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('mode = null is rejected as INVALID_MODE', () => {
    const result = validateRequest(buildBody(null, validJd));

    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.code).toBe('INVALID_MODE');
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('mode = empty string is rejected as INVALID_MODE', () => {
    const result = validateRequest(buildBody('', validJd));

    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.code).toBe('INVALID_MODE');
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('mode = "QUICK" (wrong case) is rejected as INVALID_MODE', () => {
    const result = validateRequest(buildBody('QUICK', validJd));

    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.code).toBe('INVALID_MODE');
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('mode = "Targeted" (wrong case) is rejected as INVALID_MODE', () => {
    const result = validateRequest(buildBody('Targeted', validJd));

    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.code).toBe('INVALID_MODE');
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('mode = 0 is rejected as INVALID_MODE', () => {
    const result = validateRequest(buildBody(0, validJd));

    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.code).toBe('INVALID_MODE');
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('mode = {} is rejected as INVALID_MODE', () => {
    const result = validateRequest(buildBody({}, validJd));

    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.code).toBe('INVALID_MODE');
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('mode = [] is rejected as INVALID_MODE', () => {
    const result = validateRequest(buildBody([], validJd));

    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.code).toBe('INVALID_MODE');
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('mode = "quick" with valid JD length is accepted', () => {
    const result = validateRequest(buildBody('quick', validJd));

    expect(result.valid).toBe(true);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('mode = "targeted" with valid JD length is accepted', () => {
    const result = validateRequest(buildBody('targeted', validJd));

    expect(result.valid).toBe(true);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
