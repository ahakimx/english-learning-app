import fc from 'fast-check';

import { normalizeJdContext, JdAnalysisError } from '../lambda/chat/jdAnalysis';
import type {
  JobDescriptionContext,
  QuestionCategory,
  SeniorityLevel,
} from '../lib/types';

// ============================================================================
// Feature: jd-targeting, Property 3: normalizeJdContext always produces a valid
// JobDescriptionContext
// **Validates: Requirements 3.5, 3.6, 3.7, 3.8, 3.9**
//
// `normalizeJdContext` is a total function in the following sense:
//
//   * If `role` is a non-empty string (after trim), it returns a
//     `JobDescriptionContext` whose every field conforms to the declared type
//     and whose enum-valued fields are restricted to the allowed sets
//     (Requirements 3.5, 3.6, 3.7, 3.8). `userNotes` is ALWAYS forced to `''`
//     regardless of input (Requirement 3.9).
//
//   * If `role` is absent, empty, whitespace-only, or not a string, it throws
//     `JdAnalysisError` (the precondition for Requirement 3.10's error
//     mapping in the handler layer).
//
// The sub-tests below cover every facet listed in the task:
//   1. Valid-role inputs produce a valid context with all invariants.
//   2. Missing / empty / whitespace / non-string roles throw JdAnalysisError.
//   3. Invalid `suggestedSeniority` falls back to `'mid'`.
//   4. Invalid `suggestedCategory` falls back to `'general'`.
//   5. Missing list fields default to `[]`.
//   6. Non-array list fields default to `[]`.
//   7. Arrays containing non-string elements have those elements filtered out
//      while preserving the order of the kept strings.
// ============================================================================

const VALID_SENIORITY: readonly SeniorityLevel[] = ['junior', 'mid', 'senior', 'lead'];
const VALID_CATEGORY: readonly QuestionCategory[] = ['general', 'technical'];

// --- Generators ------------------------------------------------------------

/** A non-empty string whose `.trim()` is also non-empty (required for `role`). */
const validRoleArb = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter((s) => s.trim() !== '');

const validSeniorityArb = fc.constantFrom<SeniorityLevel>(...VALID_SENIORITY);
const validCategoryArb = fc.constantFrom<QuestionCategory>(...VALID_CATEGORY);

/**
 * Anything that is NOT a valid `SeniorityLevel`. Includes near-misses
 * ('expert', mis-cased 'Junior'), empty string, and non-string values.
 */
const invalidSeniorityArb = fc.oneof(
  fc.constantFrom(
    'expert',
    'trainee',
    'principal',
    'Junior',
    'MID',
    'senior ',
    ' lead',
    '',
  ),
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.boolean(),
  fc.constant({}),
  fc.constant([]),
);

/**
 * Anything that is NOT a valid `QuestionCategory`. Includes near-misses,
 * empty string, and non-string values.
 */
const invalidCategoryArb = fc.oneof(
  fc.constantFrom(
    'behavioral',
    'General',
    'TECHNICAL',
    'technical ',
    ' general',
    '',
  ),
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.boolean(),
  fc.constant({}),
  fc.constant([]),
);

/**
 * A full, fully-valid input object as produced by a well-behaved Nova Pro
 * response — this is the "happy path" generator called for in the task.
 */
const validInputArb = fc.record({
  role: validRoleArb,
  company: fc.string({ maxLength: 80 }),
  technologies: fc.array(fc.string({ maxLength: 40 }), { maxLength: 10 }),
  responsibilities: fc.array(fc.string({ maxLength: 80 }), { maxLength: 10 }),
  requirements: fc.array(fc.string({ maxLength: 80 }), { maxLength: 10 }),
  softSkills: fc.array(fc.string({ maxLength: 40 }), { maxLength: 10 }),
  suggestedSeniority: validSeniorityArb,
  suggestedCategory: validCategoryArb,
  userNotes: fc.string({ maxLength: 200 }),
});

/**
 * A non-string, non-array "garbage" value for list fields — these should
 * all cause the normalizer to default to `[]`.
 */
const nonArrayValueArb = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant({}),
  fc.constant({ length: 3 }),
);

/**
 * An array of arbitrary values containing some strings and some non-strings.
 * Used to verify that `normalizeJdContext` preserves the order of the kept
 * strings while filtering out non-string elements.
 */
const mixedArrayArb = fc.array(
  fc.oneof(
    fc.string({ maxLength: 40 }),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
    fc.constant(undefined),
    fc.constant({}),
    fc.array(fc.string(), { maxLength: 2 }),
  ),
  { maxLength: 12 },
);

// --- Helpers ---------------------------------------------------------------

function isValidContext(ctx: JobDescriptionContext): void {
  // role: non-empty string
  expect(typeof ctx.role).toBe('string');
  expect(ctx.role.length).toBeGreaterThan(0);

  // company: string
  expect(typeof ctx.company).toBe('string');

  // list fields: string[]
  for (const field of ['technologies', 'responsibilities', 'requirements', 'softSkills'] as const) {
    expect(Array.isArray(ctx[field])).toBe(true);
    for (const item of ctx[field]) {
      expect(typeof item).toBe('string');
    }
  }

  // enum fields
  expect(VALID_SENIORITY).toContain(ctx.suggestedSeniority);
  expect(VALID_CATEGORY).toContain(ctx.suggestedCategory);

  // userNotes is ALWAYS '' (Requirement 3.9)
  expect(ctx.userNotes).toBe('');
}

// ============================================================================

describe("Feature: jd-targeting, Property 3: normalizeJdContext always produces a valid JobDescriptionContext", () => {
  // --------------------------------------------------------------------------
  // 1. Valid role + well-formed input → valid JobDescriptionContext
  // --------------------------------------------------------------------------
  test('For any valid input object, normalizeJdContext returns a JobDescriptionContext whose every field conforms to the contract', () => {
    fc.assert(
      fc.property(validInputArb, (input) => {
        const ctx = normalizeJdContext(input);

        isValidContext(ctx);

        // `role` is the raw string the caller supplied (not trimmed/mutated).
        expect(ctx.role).toBe(input.role);
        expect(ctx.company).toBe(input.company);

        // list order is preserved for valid-string inputs
        expect(ctx.technologies).toEqual(input.technologies);
        expect(ctx.responsibilities).toEqual(input.responsibilities);
        expect(ctx.requirements).toEqual(input.requirements);
        expect(ctx.softSkills).toEqual(input.softSkills);

        // enum values are passed through when already valid
        expect(ctx.suggestedSeniority).toBe(input.suggestedSeniority);
        expect(ctx.suggestedCategory).toBe(input.suggestedCategory);

        // Requirement 3.9: userNotes is always '' regardless of input
        expect(ctx.userNotes).toBe('');
      }),
      { numRuns: 300 },
    );
  });

  // --------------------------------------------------------------------------
  // 2. Missing / empty / whitespace / non-string role → throws JdAnalysisError
  // --------------------------------------------------------------------------
  test('For any invalid `role` value, normalizeJdContext throws JdAnalysisError', () => {
    const invalidRoleArb = fc.oneof(
      // empty string
      fc.constant(''),
      // whitespace-only string
      fc.constantFrom(' ', '   ', '\t', '\n', ' \t\n '),
      // not a string
      fc.constant(null),
      fc.constant(undefined),
      fc.integer(),
      fc.boolean(),
      fc.constant({}),
      fc.constant([]),
    );

    fc.assert(
      fc.property(invalidRoleArb, (role) => {
        const input = { role } as unknown as Partial<JobDescriptionContext>;
        expect(() => normalizeJdContext(input)).toThrow(JdAnalysisError);
      }),
      { numRuns: 200 },
    );
  });

  test('Missing `role` key (not even present on the object) throws JdAnalysisError', () => {
    expect(() =>
      normalizeJdContext({} as Partial<JobDescriptionContext>),
    ).toThrow(JdAnalysisError);
  });

  // --------------------------------------------------------------------------
  // 3. Invalid suggestedSeniority → defaults to 'mid'
  // --------------------------------------------------------------------------
  test("Invalid `suggestedSeniority` defaults to 'mid'", () => {
    fc.assert(
      fc.property(validRoleArb, invalidSeniorityArb, (role, suggestedSeniority) => {
        const ctx = normalizeJdContext({
          role,
          suggestedSeniority,
        } as unknown as Partial<JobDescriptionContext>);
        expect(ctx.suggestedSeniority).toBe('mid');
        // full contract still holds
        isValidContext(ctx);
      }),
      { numRuns: 200 },
    );
  });

  test("Missing `suggestedSeniority` defaults to 'mid'", () => {
    const ctx = normalizeJdContext({ role: 'Backend Engineer' });
    expect(ctx.suggestedSeniority).toBe('mid');
  });

  // --------------------------------------------------------------------------
  // 4. Invalid suggestedCategory → defaults to 'general'
  // --------------------------------------------------------------------------
  test("Invalid `suggestedCategory` defaults to 'general'", () => {
    fc.assert(
      fc.property(validRoleArb, invalidCategoryArb, (role, suggestedCategory) => {
        const ctx = normalizeJdContext({
          role,
          suggestedCategory,
        } as unknown as Partial<JobDescriptionContext>);
        expect(ctx.suggestedCategory).toBe('general');
        isValidContext(ctx);
      }),
      { numRuns: 200 },
    );
  });

  test("Missing `suggestedCategory` defaults to 'general'", () => {
    const ctx = normalizeJdContext({ role: 'Backend Engineer' });
    expect(ctx.suggestedCategory).toBe('general');
  });

  // --------------------------------------------------------------------------
  // 5. Missing list fields → default to []
  // --------------------------------------------------------------------------
  test('Missing list fields default to empty arrays', () => {
    fc.assert(
      fc.property(validRoleArb, (role) => {
        // Only `role` is supplied — all list fields are absent.
        const ctx = normalizeJdContext({ role });
        expect(ctx.technologies).toEqual([]);
        expect(ctx.responsibilities).toEqual([]);
        expect(ctx.requirements).toEqual([]);
        expect(ctx.softSkills).toEqual([]);
        expect(ctx.company).toBe('');
        isValidContext(ctx);
      }),
      { numRuns: 100 },
    );
  });

  // --------------------------------------------------------------------------
  // 6. Non-array list fields → default to []
  // --------------------------------------------------------------------------
  test('Non-array list fields default to empty arrays', () => {
    fc.assert(
      fc.property(
        validRoleArb,
        nonArrayValueArb,
        nonArrayValueArb,
        nonArrayValueArb,
        nonArrayValueArb,
        (role, technologies, responsibilities, requirements, softSkills) => {
          const ctx = normalizeJdContext({
            role,
            technologies,
            responsibilities,
            requirements,
            softSkills,
          } as unknown as Partial<JobDescriptionContext>);

          expect(ctx.technologies).toEqual([]);
          expect(ctx.responsibilities).toEqual([]);
          expect(ctx.requirements).toEqual([]);
          expect(ctx.softSkills).toEqual([]);
          isValidContext(ctx);
        },
      ),
      { numRuns: 200 },
    );
  });

  // --------------------------------------------------------------------------
  // 7. Arrays with non-string elements → non-strings filtered out, order
  //    preserved for the kept strings
  // --------------------------------------------------------------------------
  test('Arrays containing non-string elements filter out non-strings while preserving order of the kept strings', () => {
    fc.assert(
      fc.property(
        validRoleArb,
        mixedArrayArb,
        mixedArrayArb,
        mixedArrayArb,
        mixedArrayArb,
        (role, technologies, responsibilities, requirements, softSkills) => {
          const ctx = normalizeJdContext({
            role,
            technologies,
            responsibilities,
            requirements,
            softSkills,
          } as unknown as Partial<JobDescriptionContext>);

          // Every output entry is a string.
          for (const field of [
            'technologies',
            'responsibilities',
            'requirements',
            'softSkills',
          ] as const) {
            for (const item of ctx[field]) {
              expect(typeof item).toBe('string');
            }
          }

          // Expected: input filtered to just its string elements, order
          // preserved — this is the oracle the normalizer must match.
          const expectedStrings = (arr: unknown[]): string[] =>
            arr.filter((x): x is string => typeof x === 'string');

          expect(ctx.technologies).toEqual(expectedStrings(technologies));
          expect(ctx.responsibilities).toEqual(expectedStrings(responsibilities));
          expect(ctx.requirements).toEqual(expectedStrings(requirements));
          expect(ctx.softSkills).toEqual(expectedStrings(softSkills));

          isValidContext(ctx);
        },
      ),
      { numRuns: 200 },
    );
  });

  // --------------------------------------------------------------------------
  // Cross-cutting: for any valid role, output always satisfies the contract,
  // regardless of any other garbage in the input. This is the "totality"
  // statement of Property 3.
  // --------------------------------------------------------------------------
  test('For any valid role and arbitrary garbage in every other field, output is always a valid JobDescriptionContext', () => {
    const garbageArb = fc.anything();

    fc.assert(
      fc.property(
        validRoleArb,
        garbageArb,
        garbageArb,
        garbageArb,
        garbageArb,
        garbageArb,
        garbageArb,
        garbageArb,
        garbageArb,
        (
          role,
          company,
          technologies,
          responsibilities,
          requirements,
          softSkills,
          suggestedSeniority,
          suggestedCategory,
          userNotes,
        ) => {
          const ctx = normalizeJdContext({
            role,
            company,
            technologies,
            responsibilities,
            requirements,
            softSkills,
            suggestedSeniority,
            suggestedCategory,
            userNotes,
          } as unknown as Partial<JobDescriptionContext>);

          isValidContext(ctx);
        },
      ),
      { numRuns: 300 },
    );
  });
});
