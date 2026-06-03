import fc from 'fast-check';

import { buildSystemPrompt } from '../lambda/websocket/nova-sonic/promptBuilder';
import type {
  JobDescriptionContext,
  QuestionCategory,
  SeniorityLevel,
  SessionMode,
} from '../lib/types';

// ============================================================================
// Feature: jd-targeting, Property 12: Prompt builder totality (no crash,
// always non-empty)
// **Validates: Requirement 7.5**
//
// For ANY combination of inputs to `buildSystemPrompt` — including corrupted
// or otherwise unexpected runtime values cast through `as any` (wrong types,
// invalid enum values, `null`, numbers, objects instead of strings, etc.) —
// the function MUST:
//
//   1. NOT throw any exception, and
//   2. return a string whose length is strictly greater than zero.
//
// Rationale: `buildSystemPrompt` is invoked from the hot path of the Nova
// Sonic websocket handler. A crash there would tear down the session and
// surface as a generic server error to the candidate mid-interview. Requirement
// 7.5 therefore mandates totality: the function must always produce *some*
// usable prompt, degrading gracefully when upstream data is malformed rather
// than propagating the fault.
//
// This test deliberately does NOT assert anything about the prompt's semantic
// content — that is covered by Properties 10, 11, and 13. Totality is the
// only invariant under test here, which is why the generators are intentionally
// adversarial and type-unsafe.
// ============================================================================

// --- Generators -------------------------------------------------------------

// Valid enum values plus common invalid casts. Typed as `unknown` so we can
// pass them through `as any` casts to `buildSystemPrompt`.
const seniorityArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom<unknown>('junior', 'mid', 'senior', 'lead'),
  // Invalid casts: wrong case, empty, garbage strings, non-string types, null/undefined.
  fc.constantFrom<unknown>('JUNIOR', 'Senior', '', 'architect', 'principal', 'unknown'),
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.boolean(),
  fc.object({ maxDepth: 1 }),
);

const categoryArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom<unknown>('general', 'technical'),
  fc.constantFrom<unknown>('GENERAL', 'Technical', '', 'behavioral', 'hybrid'),
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.boolean(),
  fc.object({ maxDepth: 1 }),
);

// `mode` generator per task spec:
//   fc.option(fc.oneof(fc.constantFrom('quick', 'targeted'), fc.string()))
// We also sprinkle in a few hostile values (numbers, booleans, objects, null)
// via `as any` to exercise the totality guarantee against truly arbitrary
// runtime inputs.
const modeArb: fc.Arbitrary<unknown> = fc.option(
  fc.oneof(
    fc.constantFrom<unknown>('quick', 'targeted'),
    fc.string(),
    fc.constantFrom<unknown>('QUICK', 'Targeted', 'targeted ', ' targeted', ''),
    fc.integer(),
    fc.boolean(),
    fc.object({ maxDepth: 1 }),
  ),
  { nil: undefined, freq: 3 },
);

// jobPosition: arbitrary strings, including empty.
const jobPositionArb: fc.Arbitrary<string> = fc.string();

// A well-formed `JobDescriptionContext` generator per the task spec. Kept
// type-safe so TypeScript accepts it at the call site, but with plenty of
// edge cases inside (empty arrays, empty strings, whitespace-only notes).
const wellFormedJdContextArb: fc.Arbitrary<JobDescriptionContext> = fc.record({
  company: fc.string(),
  role: fc.string(),
  technologies: fc.array(fc.string(), { maxLength: 8 }),
  responsibilities: fc.array(fc.string(), { maxLength: 8 }),
  requirements: fc.array(fc.string(), { maxLength: 8 }),
  softSkills: fc.array(fc.string(), { maxLength: 8 }),
  suggestedSeniority: fc.constantFrom<SeniorityLevel>(
    'junior',
    'mid',
    'senior',
    'lead',
  ),
  suggestedCategory: fc.constantFrom<QuestionCategory>('general', 'technical'),
  userNotes: fc.string(),
});

// An adversarial "jdContext" generator that yields values the type system
// would normally reject: missing fields, wrong types per field, nested objects,
// numeric arrays, etc. Passed into `buildSystemPrompt` via `as any`.
const adversarialJdContextArb: fc.Arbitrary<unknown> = fc.oneof(
  // Completely empty object — no fields at all.
  fc.constant({}),
  // Plain non-object sentinels.
  fc.constant(null),
  fc.constant('not-an-object'),
  fc.constant(42),
  fc.constant(true),
  fc.constant([]),
  // Partial records with fields missing.
  fc.record(
    {
      company: fc.string(),
      role: fc.string(),
    },
    { requiredKeys: [] },
  ),
  // Fields with the wrong runtime type.
  fc.record({
    company: fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
    role: fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
    technologies: fc.oneof(
      fc.array(fc.string()),
      fc.string(),
      fc.integer(),
      fc.constant(null),
    ),
    responsibilities: fc.oneof(
      fc.array(fc.string()),
      fc.string(),
      fc.constant(null),
    ),
    requirements: fc.oneof(
      fc.array(fc.string()),
      fc.string(),
      fc.constant(null),
    ),
    softSkills: fc.oneof(
      fc.array(fc.string()),
      fc.string(),
      fc.constant(null),
    ),
    suggestedSeniority: fc.oneof(
      fc.constantFrom('junior', 'mid', 'senior', 'lead', 'invalid'),
      fc.constant(null),
      fc.integer(),
    ),
    suggestedCategory: fc.oneof(
      fc.constantFrom('general', 'technical', 'bogus'),
      fc.constant(null),
      fc.integer(),
    ),
    userNotes: fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
  }),
);

// The jdContext the test actually feeds in: either undefined, a well-formed
// context, or an adversarial one. Task spec explicitly requests
// `fc.option(fc.record({...}))`, and we add adversarial casts to further
// stress totality.
const jdContextArb: fc.Arbitrary<unknown> = fc.oneof(
  { arbitrary: fc.constant(undefined), weight: 2 },
  { arbitrary: wellFormedJdContextArb, weight: 3 },
  { arbitrary: adversarialJdContextArb, weight: 2 },
);

// --- Helper -----------------------------------------------------------------

// Small wrapper so each assertion produces an identical shape and any
// counterexample surfaced by fast-check is immediately actionable.
function assertTotal(
  jobPosition: unknown,
  seniorityLevel: unknown,
  questionCategory: unknown,
  mode: unknown,
  jdContext: unknown,
): void {
  // Casting through `as any` intentionally: Requirement 7.5 demands totality
  // against malformed runtime inputs regardless of the declared types.
  const result = buildSystemPrompt(
    jobPosition as string,
    seniorityLevel as SeniorityLevel,
    questionCategory as QuestionCategory,
    mode as SessionMode | undefined,
    jdContext as JobDescriptionContext | undefined,
  );
  expect(typeof result).toBe('string');
  expect(result.length).toBeGreaterThan(0);
}

// --- Property 12 ------------------------------------------------------------

describe('Feature: jd-targeting, Property 12: Prompt builder totality (no crash, always non-empty)', () => {
  test('For any combination of inputs (including corrupted casts) buildSystemPrompt does not throw and returns a non-empty string', () => {
    fc.assert(
      fc.property(
        jobPositionArb,
        seniorityArb,
        categoryArb,
        modeArb,
        jdContextArb,
        (jobPosition, seniorityLevel, questionCategory, mode, jdContext) => {
          assertTotal(
            jobPosition,
            seniorityLevel,
            questionCategory,
            mode,
            jdContext,
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  // --- Concrete edge cases called out in the task spec ---------------------

  test('jdContext with empty arrays and empty strings returns a non-empty string', () => {
    const emptyCtx: JobDescriptionContext = {
      company: '',
      role: '',
      technologies: [],
      responsibilities: [],
      requirements: [],
      softSkills: [],
      suggestedSeniority: 'mid',
      suggestedCategory: 'technical',
      userNotes: '',
    };
    assertTotal('software-engineer', 'mid', 'technical', 'targeted', emptyCtx);
  });

  test('jdContext.userNotes is whitespace-only and result is still non-empty', () => {
    const wsNotesCtx: JobDescriptionContext = {
      company: 'Acme',
      role: 'Engineer',
      technologies: ['Node.js'],
      responsibilities: ['Ship features'],
      requirements: ['3+ years'],
      softSkills: ['Communication'],
      suggestedSeniority: 'mid',
      suggestedCategory: 'technical',
      userNotes: '   \t\n   ',
    };
    assertTotal('software-engineer', 'mid', 'technical', 'targeted', wsNotesCtx);
  });

  test("mode = 'targeted' with jdContext = undefined returns a non-empty string", () => {
    assertTotal('software-engineer', 'mid', 'technical', 'targeted', undefined);
  });

  test('very long strings (10,000 chars) do not crash and produce a non-empty result', () => {
    const big = 'x'.repeat(10_000);
    const bigCtx: JobDescriptionContext = {
      company: big,
      role: big,
      technologies: [big, big],
      responsibilities: [big, big],
      requirements: [big, big],
      softSkills: [big, big],
      suggestedSeniority: 'senior',
      suggestedCategory: 'technical',
      userNotes: big,
    };
    assertTotal(big, 'senior', 'technical', 'targeted', bigCtx);
  });

  test('invalid seniority cast does not crash', () => {
    assertTotal(
      'software-engineer',
      'architect' as unknown as SeniorityLevel,
      'technical',
      'quick',
      undefined,
    );
  });

  test('invalid questionCategory cast does not crash', () => {
    assertTotal(
      'software-engineer',
      'mid',
      'behavioral' as unknown as QuestionCategory,
      undefined,
      undefined,
    );
  });

  test('invalid mode cast does not crash', () => {
    assertTotal(
      'software-engineer',
      'mid',
      'technical',
      'TARGETED' as unknown as SessionMode,
      undefined,
    );
  });

  test('null jdContext with targeted mode does not crash', () => {
    assertTotal(
      'software-engineer',
      'mid',
      'technical',
      'targeted',
      null as unknown as JobDescriptionContext,
    );
  });

  test('empty jobPosition returns a non-empty string', () => {
    assertTotal('', 'mid', 'technical', undefined, undefined);
  });
});
