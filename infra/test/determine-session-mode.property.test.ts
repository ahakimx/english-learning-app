import fc from 'fast-check';

// Mock AWS SDK clients before importing handler
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
}));

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => ({ send: mockSend })),
  InvokeModelCommand: jest.fn((params: unknown) => ({ _type: 'InvokeModelCommand', params })),
}));

import { determineSessionMode } from '../lambda/chat/index';

// ============================================================================
// Feature: jd-targeting, Property 9: determineSessionMode is targeted iff input equals 'targeted'
// **Validates: Requirements 6.7, 10.2, 10.3, 10.4**
//
// For any input string `mode`, `determineSessionMode({ mode })` must return
// `'targeted'` iff `mode === 'targeted'`, and `'quick'` otherwise. This
// guarantees that any non-`'targeted'` value (including missing, invalid, or
// differently-cased strings) degrades safely to Quick mode.
// ============================================================================
describe("Feature: jd-targeting, Property 9: determineSessionMode is targeted iff input equals 'targeted'", () => {
  test("For any arbitrary string mode, determineSessionMode returns 'targeted' iff mode === 'targeted', else 'quick'", () => {
    fc.assert(
      fc.property(fc.string(), (mode) => {
        const result = determineSessionMode({ mode });
        if (mode === 'targeted') {
          expect(result).toBe('targeted');
        } else {
          expect(result).toBe('quick');
        }
      }),
      { numRuns: 200 }
    );
  });

  test("Mixed with the literal 'targeted' string, determineSessionMode still satisfies the iff property", () => {
    // Bias the generator toward the interesting boundary value to exercise the
    // positive branch more often than random strings alone would.
    const modeArb = fc.oneof(
      fc.string(),
      fc.constant('targeted'),
      fc.constant('quick'),
      fc.constant('Targeted'),
      fc.constant('TARGETED'),
      fc.constant(' targeted'),
      fc.constant('targeted ')
    );

    fc.assert(
      fc.property(modeArb, (mode) => {
        const result = determineSessionMode({ mode });
        const expected = mode === 'targeted' ? 'targeted' : 'quick';
        expect(result).toBe(expected);
      }),
      { numRuns: 200 }
    );
  });

  // --- Concrete cases ---------------------------------------------------------

  test("undefined mode (no key) maps to 'quick'", () => {
    expect(determineSessionMode({})).toBe('quick');
  });

  test("explicit undefined mode maps to 'quick'", () => {
    expect(determineSessionMode({ mode: undefined })).toBe('quick');
  });

  test("null mode maps to 'quick'", () => {
    // The runtime signature is `{ mode?: string }`, but the function must still
    // fall back to 'quick' if a null sneaks through (e.g., from deserialized JSON).
    expect(
      determineSessionMode({ mode: null as unknown as string | undefined })
    ).toBe('quick');
  });

  test("numeric mode maps to 'quick'", () => {
    expect(
      determineSessionMode({ mode: 42 as unknown as string | undefined })
    ).toBe('quick');
  });

  test("object mode maps to 'quick'", () => {
    expect(
      determineSessionMode({
        mode: { targeted: true } as unknown as string | undefined,
      })
    ).toBe('quick');
  });

  test("empty string mode maps to 'quick'", () => {
    expect(determineSessionMode({ mode: '' })).toBe('quick');
  });

  test("case-different 'TARGETED' does not match and maps to 'quick'", () => {
    expect(determineSessionMode({ mode: 'TARGETED' })).toBe('quick');
  });

  test("case-different 'Targeted' does not match and maps to 'quick'", () => {
    expect(determineSessionMode({ mode: 'Targeted' })).toBe('quick');
  });

  test("exact 'targeted' maps to 'targeted'", () => {
    expect(determineSessionMode({ mode: 'targeted' })).toBe('targeted');
  });

  test("'quick' maps to 'quick'", () => {
    expect(determineSessionMode({ mode: 'quick' })).toBe('quick');
  });
});
