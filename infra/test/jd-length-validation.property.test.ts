/**
 * Feature: jd-targeting, Property 1: JD length validation rejects out-of-range input
 * Validates: Requirements 2.3, 2.4, 3.3, 3.4, 4.4
 *
 * For any string `jdRawText` whose length is less than `JD_MIN_LENGTH` or greater
 * than `JD_MAX_LENGTH`, the Chat_Lambda `analyze_job_description` validation SHALL
 * return `{ valid: false, code: 'JD_TOO_SHORT' }` (for under-length) or
 * `{ valid: false, code: 'JD_TOO_LONG' }` (for over-length). Validation must not
 * invoke Nova Pro, DynamoDB, or the rate limiter (Requirement 4.4).
 *
 * For any string whose length is in `[JD_MIN_LENGTH, JD_MAX_LENGTH]`, validation
 * SHALL return `{ valid: true }` when the rest of the request is well-formed.
 */
import fc from 'fast-check';

// Mock AWS SDK clients before importing handler — validation must not touch any
// of these, but the module-level SDK clients get constructed on import.
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

import { validateRequest, JD_MIN_LENGTH, JD_MAX_LENGTH } from '../lambda/chat/index';

// --- Generators ---

// Printable ASCII so JS string .length === number-of-chars; keeps bounds exact.
const asciiChar = fc.integer({ min: 32, max: 126 }).map((n) => String.fromCharCode(n));

/** Arbitrary for strings strictly shorter than JD_MIN_LENGTH (i.e. length in [0, 99]). */
const tooShortArb = fc.stringOf(asciiChar, { minLength: 0, maxLength: JD_MIN_LENGTH - 1 });

/** Arbitrary for strings strictly longer than JD_MAX_LENGTH (length in [10001, 15000]). */
const tooLongArb = fc.stringOf(asciiChar, {
  minLength: JD_MAX_LENGTH + 1,
  maxLength: JD_MAX_LENGTH + 5000,
});

/** Arbitrary for strings whose length is in [JD_MIN_LENGTH, JD_MAX_LENGTH]. */
const validLengthArb = fc.stringOf(asciiChar, {
  minLength: JD_MIN_LENGTH,
  maxLength: JD_MAX_LENGTH,
});

/** Build a well-formed analyze_job_description request body for the given JD text. */
function buildBody(jdRawText: string): Record<string, unknown> {
  return {
    action: 'analyze_job_description',
    mode: 'targeted',
    jdRawText,
  };
}

// ─── Property tests ───

describe('Property 1: JD length validation rejects out-of-range input', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  test('returns JD_TOO_SHORT for any jdRawText with length < JD_MIN_LENGTH', () => {
    fc.assert(
      fc.property(tooShortArb, (jdRawText) => {
        // Precondition on the generator — guard against any framework surprises.
        expect(jdRawText.length).toBeLessThan(JD_MIN_LENGTH);

        const result = validateRequest(buildBody(jdRawText));

        expect(result.valid).toBe(false);
        if (result.valid === false) {
          expect(result.code).toBe('JD_TOO_SHORT');
        }
        // Validation must not invoke any AWS client (Requirement 4.4: counter
        // only increments on successful Bedrock call, and validation precedes it).
        expect(mockSend).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  test('returns JD_TOO_LONG for any jdRawText with length > JD_MAX_LENGTH', () => {
    fc.assert(
      fc.property(tooLongArb, (jdRawText) => {
        expect(jdRawText.length).toBeGreaterThan(JD_MAX_LENGTH);

        const result = validateRequest(buildBody(jdRawText));

        expect(result.valid).toBe(false);
        if (result.valid === false) {
          expect(result.code).toBe('JD_TOO_LONG');
        }
        expect(mockSend).not.toHaveBeenCalled();
      }),
      { numRuns: 50 },
    );
  });

  test('returns valid=true for any jdRawText with length in [JD_MIN_LENGTH, JD_MAX_LENGTH]', () => {
    fc.assert(
      fc.property(validLengthArb, (jdRawText) => {
        expect(jdRawText.length).toBeGreaterThanOrEqual(JD_MIN_LENGTH);
        expect(jdRawText.length).toBeLessThanOrEqual(JD_MAX_LENGTH);

        const result = validateRequest(buildBody(jdRawText));

        expect(result.valid).toBe(true);
        expect(mockSend).not.toHaveBeenCalled();
      }),
      { numRuns: 50 },
    );
  });
});

// ─── Concrete boundary examples (sanity checks for the property boundaries) ───

describe('JD length validation — boundary examples', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  test('length = 99 is rejected as JD_TOO_SHORT', () => {
    const jdRawText = 'a'.repeat(JD_MIN_LENGTH - 1); // 99
    expect(jdRawText.length).toBe(99);

    const result = validateRequest(buildBody(jdRawText));

    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.code).toBe('JD_TOO_SHORT');
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('length = 100 is accepted', () => {
    const jdRawText = 'a'.repeat(JD_MIN_LENGTH); // 100
    expect(jdRawText.length).toBe(100);

    const result = validateRequest(buildBody(jdRawText));

    expect(result.valid).toBe(true);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('length = 10000 is accepted', () => {
    const jdRawText = 'a'.repeat(JD_MAX_LENGTH); // 10000
    expect(jdRawText.length).toBe(10000);

    const result = validateRequest(buildBody(jdRawText));

    expect(result.valid).toBe(true);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('length = 10001 is rejected as JD_TOO_LONG', () => {
    const jdRawText = 'a'.repeat(JD_MAX_LENGTH + 1); // 10001
    expect(jdRawText.length).toBe(10001);

    const result = validateRequest(buildBody(jdRawText));

    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.code).toBe('JD_TOO_LONG');
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('empty string (length = 0) is rejected as JD_TOO_SHORT', () => {
    const result = validateRequest(buildBody(''));

    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.code).toBe('JD_TOO_SHORT');
    }
    expect(mockSend).not.toHaveBeenCalled();
  });
});
