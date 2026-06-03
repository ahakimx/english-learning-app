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
  QueryCommand: jest.fn((params: unknown) => ({ _type: 'QueryCommand', params })),
}));

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => ({ send: mockSend })),
  InvokeModelCommand: jest.fn((params: unknown) => ({ _type: 'InvokeModelCommand', params })),
}));

import { validateRequest } from '../lambda/chat/index';

// ============================================================================
// Feature: jd-targeting, Property 22: mode/jdContext are not required on non-JD actions
// **Validates: Requirement 10.6**
//
// For every action other than `'analyze_job_description'` and other than
// `'start_session'` with `mode === 'targeted'`, `validateRequest` must NOT
// reject a request body based on missing `mode` or missing `jdContext`.
// In other words: a minimal valid body containing only the action's own
// required fields (no `mode`, no `jdContext`) must yield `{ valid: true }`,
// and must never produce the JD-specific error codes `INVALID_MODE` or
// `INVALID_TARGETED_REQUEST`.
//
// This encodes the backward-compatibility guarantee that deploying the JD
// targeting feature does not retroactively tighten validation for any of the
// existing speaking / grammar / writing flows.
// ============================================================================

// --- Minimal-valid-body builders ------------------------------------------
//
// Each builder returns a request body containing exactly the fields listed in
// REQUIRED_FIELDS for the corresponding action, and nothing else. These are
// the smallest bodies that MUST pass validation; they are the exact shape
// that real callers produce today before the JD feature existed.
//
// Test inputs like sessionId / transcription / writingContent / etc. can be
// any non-empty string, which is exactly what `validateRequest` checks for
// (required fields must not be undefined, null, or empty string).
const nonEmptyString = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim() !== '');

const minimalBodyBuilders: Record<string, (s: string) => Record<string, unknown>> = {
  // start_session WITHOUT mode='targeted' — either mode absent entirely or
  // mode is some non-'targeted' value. Only jobPosition is required.
  start_session: (s) => ({ action: 'start_session', jobPosition: s }),

  analyze_answer: (s) => ({
    action: 'analyze_answer',
    sessionId: s,
    transcription: s,
  }),

  next_question: (s) => ({ action: 'next_question', sessionId: s }),

  end_session: (s) => ({ action: 'end_session', sessionId: s }),

  // resume_session has NO required fields per REQUIRED_FIELDS — body with
  // just the action must validate.
  resume_session: () => ({ action: 'resume_session' }),

  abandon_session: (s) => ({ action: 'abandon_session', sessionId: s }),

  grammar_quiz: (s) => ({ action: 'grammar_quiz', grammarTopic: s }),

  grammar_explain: (s) => ({
    action: 'grammar_explain',
    sessionId: s,
    selectedAnswer: s,
  }),

  // writing_prompt has an enum constraint on writingType — fixed to 'essay'
  // or 'email'. Tested as a property below.
  writing_prompt: () => ({ action: 'writing_prompt', writingType: 'essay' }),

  writing_review: (s) => ({
    action: 'writing_review',
    sessionId: s,
    writingContent: s,
  }),
};

describe('Feature: jd-targeting, Property 22: mode/jdContext are not required on non-JD actions', () => {
  describe('For every non-JD action, validateRequest accepts a minimal body with no mode and no jdContext', () => {
    // One explicit case per action — using concrete minimal bodies to
    // document exactly what "minimal valid body" looks like for each flow.
    test.each([
      ['start_session', { action: 'start_session', jobPosition: 'Software Engineer' }],
      ['analyze_answer', { action: 'analyze_answer', sessionId: 'sid-1', transcription: 'hello world' }],
      ['next_question', { action: 'next_question', sessionId: 'sid-1' }],
      ['end_session', { action: 'end_session', sessionId: 'sid-1' }],
      ['resume_session', { action: 'resume_session' }],
      ['abandon_session', { action: 'abandon_session', sessionId: 'sid-1' }],
      ['grammar_quiz', { action: 'grammar_quiz', grammarTopic: 'Tenses' }],
      ['grammar_explain', { action: 'grammar_explain', sessionId: 'sid-1', selectedAnswer: 'A' }],
      ['writing_prompt (essay)', { action: 'writing_prompt', writingType: 'essay' }],
      ['writing_prompt (email)', { action: 'writing_prompt', writingType: 'email' }],
      ['writing_review', { action: 'writing_review', sessionId: 'sid-1', writingContent: 'My essay' }],
    ])('%s minimal body (no mode, no jdContext) validates successfully', (_label, body) => {
      // Sanity: body must not contain mode or jdContext at all.
      expect('mode' in body).toBe(false);
      expect('jdContext' in body).toBe(false);

      const result = validateRequest(body as Record<string, unknown>);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.request.action).toBe((body as { action: string }).action);
      }
    });

    // Property: for each action, fuzz the free-text required fields and
    // confirm validation still passes AND the JD-specific error codes never
    // appear. This is the universal form of the property — it guarantees the
    // behavior is not accidentally dependent on specific string values.
    test("For any non-JD action with a valid minimal body, validateRequest does not reject due to missing mode/jdContext", () => {
      const actionArb = fc.constantFrom(
        'start_session',
        'analyze_answer',
        'next_question',
        'end_session',
        'resume_session',
        'abandon_session',
        'grammar_quiz',
        'grammar_explain',
        'writing_prompt',
        'writing_review',
      );

      fc.assert(
        fc.property(actionArb, nonEmptyString, (action, filler) => {
          const body = minimalBodyBuilders[action](filler);
          // Assert precondition: no mode, no jdContext in the test body.
          expect('mode' in body).toBe(false);
          expect('jdContext' in body).toBe(false);

          const result = validateRequest(body);

          // Core property: validation must succeed.
          expect(result.valid).toBe(true);

          // Even if we are wrong about `valid`, the JD-specific codes must
          // NEVER appear on a non-JD action with a valid minimal body.
          if (!result.valid) {
            expect(result.code).not.toBe('INVALID_MODE');
            expect(result.code).not.toBe('INVALID_TARGETED_REQUEST');
            expect(result.code).not.toBe('JD_TOO_SHORT');
            expect(result.code).not.toBe('JD_TOO_LONG');
          }
        }),
        { numRuns: 200 },
      );
    });
  });

  describe("start_session with any non-'targeted' mode value still validates when jobPosition is valid", () => {
    // Property: for random `mode` values that are NOT 'targeted' (including
    // 'quick', undefined, empty string, arbitrary invalid strings, numbers,
    // booleans, objects), start_session with a valid jobPosition must still
    // validate — and crucially, must NOT return INVALID_TARGETED_REQUEST,
    // because the INVALID_TARGETED_REQUEST branch in validateRequest is
    // gated on `mode === 'targeted'` exactly.
    test("For any mode !== 'targeted' (arbitrary primitive/object), start_session with a valid jobPosition validates", () => {
      // Any value except the exact string 'targeted'. We cover strings
      // (most common wire shape) plus a handful of non-string types that a
      // misbehaving client could send through as JSON.
      const nonTargetedModeArb = fc.oneof(
        fc.string().filter((s) => s !== 'targeted'),
        fc.constant(undefined),
        fc.constant(null),
        fc.constant('quick'),
        fc.constant('Targeted'),
        fc.constant('TARGETED'),
        fc.constant(''),
        fc.integer(),
        fc.boolean(),
        fc.object(),
      );

      fc.assert(
        fc.property(nonTargetedModeArb, nonEmptyString, (mode, jobPosition) => {
          // Build the body and only include `mode` when it is defined — this
          // simulates the two real wire shapes: (a) `mode` omitted entirely,
          // (b) `mode` present with some non-'targeted' value.
          const body: Record<string, unknown> =
            mode === undefined
              ? { action: 'start_session', jobPosition }
              : { action: 'start_session', jobPosition, mode };

          const result = validateRequest(body);

          // Core property: validation must succeed.
          expect(result.valid).toBe(true);

          // Guard: if it did fail, it must not have failed with the
          // targeted-specific error code — that would indicate the gate
          // is matching non-'targeted' values and regressing 10.6.
          if (!result.valid) {
            expect(result.code).not.toBe('INVALID_TARGETED_REQUEST');
          }
        }),
        { numRuns: 200 },
      );
    });

    // Explicit concrete sanity checks to keep the boundaries visible in the
    // test report.
    test("start_session with mode='quick' and no jdContext validates", () => {
      const result = validateRequest({
        action: 'start_session',
        jobPosition: 'Software Engineer',
        mode: 'quick',
      });
      expect(result.valid).toBe(true);
    });

    test("start_session with mode='quick' and no jdContext does not return INVALID_TARGETED_REQUEST", () => {
      const result = validateRequest({
        action: 'start_session',
        jobPosition: 'Software Engineer',
        mode: 'quick',
      });
      if (!result.valid) {
        expect(result.code).not.toBe('INVALID_TARGETED_REQUEST');
      }
    });

    test("start_session with an invalid mode string and no jdContext still validates (treated as quick)", () => {
      const result = validateRequest({
        action: 'start_session',
        jobPosition: 'Software Engineer',
        mode: 'something-else',
      });
      expect(result.valid).toBe(true);
    });

    test("start_session with mode absent and no jdContext validates", () => {
      const result = validateRequest({
        action: 'start_session',
        jobPosition: 'Software Engineer',
      });
      expect(result.valid).toBe(true);
    });
  });
});
