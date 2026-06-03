import fc from 'fast-check';

import { buildSystemPrompt } from '../lambda/websocket/nova-sonic/promptBuilder';
import type {
  JobDescriptionContext,
  QuestionCategory,
  SeniorityLevel,
  SessionMode,
} from '../lib/types';

// ============================================================================
// Feature: jd-targeting, Property 11: Non-targeted mode produces the Quick prompt
// **Validates: Requirements 7.3, 7.4, 10.4**
//
// For any `mode` value that is NOT the literal string `'targeted'` (including
// `'quick'`, `undefined`, `null`, `'invalid'`, `''`, `'QUICK'`, etc.) and for
// any `jdContext` — including a well-formed one — the result of the 5-arg call
//
//   buildSystemPrompt(jobPosition, seniorityLevel, questionCategory, mode, jdContext)
//
// must equal BOTH:
//   - the 3-arg call  buildSystemPrompt(jobPosition, seniorityLevel, questionCategory)
//   - the canonical Quick call
//                     buildSystemPrompt(jobPosition, seniorityLevel, questionCategory, 'quick', undefined)
//
// Additionally, when `mode === 'targeted'` but `jdContext === undefined`, the
// prompt must still fall back to the Quick path byte-for-byte — the targeted
// code path requires BOTH `mode === 'targeted'` AND a defined `jdContext`.
// ============================================================================

// --- Generators -------------------------------------------------------------

const seniorityLevelArb: fc.Arbitrary<SeniorityLevel> = fc.constantFrom(
  'junior',
  'mid',
  'senior',
  'lead',
);

const questionCategoryArb: fc.Arbitrary<QuestionCategory> = fc.constantFrom(
  'general',
  'technical',
);

const jobPositionArb: fc.Arbitrary<string> = fc.constantFrom(
  'software-engineer',
  'product-manager',
  'data-analyst',
  'marketing-manager',
  'ui-ux-designer',
  'devops-engineer',
  'cloud-engineer',
);

// A well-formed, non-trivial JobDescriptionContext. We deliberately make it
// non-empty (lists, company, role, userNotes) so that IF the non-targeted code
// path were to leak JD content into the prompt, the string comparison would
// fail. Role is guaranteed to be a non-empty trimmed string.
const jdContextArb: fc.Arbitrary<JobDescriptionContext> = fc.record({
  company: fc.string({ minLength: 0, maxLength: 40 }),
  role: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim() !== ''),
  technologies: fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
    minLength: 0,
    maxLength: 5,
  }),
  responsibilities: fc.array(fc.string({ minLength: 1, maxLength: 40 }), {
    minLength: 0,
    maxLength: 5,
  }),
  requirements: fc.array(fc.string({ minLength: 1, maxLength: 40 }), {
    minLength: 0,
    maxLength: 5,
  }),
  softSkills: fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
    minLength: 0,
    maxLength: 5,
  }),
  suggestedSeniority: seniorityLevelArb,
  suggestedCategory: questionCategoryArb,
  userNotes: fc.string({ minLength: 0, maxLength: 60 }),
});

// Arbitrary for `mode` values that are NOT the literal `'targeted'`. We mix
// valid `'quick'`, invalid strings, empty string, differently-cased variants,
// and (via fc.option) `null` / `undefined`. Typed as `unknown` so callers can
// pass it through to `buildSystemPrompt` via a cast — the function's runtime
// contract treats anything other than `'targeted'` as Quick.
const nonTargetedModeArb: fc.Arbitrary<unknown> = fc
  .constantFrom<unknown>('quick', 'invalid', '', 'QUICK', 'Targeted', 'targeted ', ' targeted')
  .chain((base) =>
    fc.option(fc.constant(base), { nil: undefined, freq: 4 }),
  )
  .chain((maybeStr) =>
    // Also allow the raw value to be null in addition to undefined.
    fc.oneof(
      fc.constant(maybeStr),
      fc.constant(null as unknown),
    ),
  );

// `jdContext` companion arbitrary: include undefined, a minimal context, and a
// rich context so we exercise the "defined but non-targeted mode → ignored" case.
const anyJdContextArb: fc.Arbitrary<JobDescriptionContext | undefined> = fc.option(
  jdContextArb,
  { nil: undefined, freq: 2 },
);

// --- Property 11 ------------------------------------------------------------

describe("Feature: jd-targeting, Property 11: Non-targeted mode produces the Quick prompt", () => {
  test("For any non-'targeted' mode and any jdContext, the 5-arg call equals the 3-arg call and the canonical (_, _, _, 'quick', undefined) call", () => {
    fc.assert(
      fc.property(
        jobPositionArb,
        seniorityLevelArb,
        questionCategoryArb,
        nonTargetedModeArb,
        anyJdContextArb,
        (jobPosition, seniorityLevel, questionCategory, mode, jdContext) => {
          // Sanity: the property only applies when mode !== 'targeted'.
          // The generator guarantees this, but assert it to make the contract
          // explicit for shrunken counterexamples.
          expect(mode).not.toBe('targeted');

          const fiveArg = buildSystemPrompt(
            jobPosition,
            seniorityLevel,
            questionCategory,
            mode as SessionMode | undefined,
            jdContext,
          );
          const threeArg = buildSystemPrompt(
            jobPosition,
            seniorityLevel,
            questionCategory,
          );
          const canonicalQuick = buildSystemPrompt(
            jobPosition,
            seniorityLevel,
            questionCategory,
            'quick',
            undefined,
          );

          expect(fiveArg).toBe(threeArg);
          expect(fiveArg).toBe(canonicalQuick);
        },
      ),
      { numRuns: 200 },
    );
  });

  test("When mode === 'targeted' but jdContext === undefined, the result equals the Quick prompt byte-for-byte", () => {
    fc.assert(
      fc.property(
        jobPositionArb,
        seniorityLevelArb,
        questionCategoryArb,
        (jobPosition, seniorityLevel, questionCategory) => {
          const targetedNoContext = buildSystemPrompt(
            jobPosition,
            seniorityLevel,
            questionCategory,
            'targeted',
            undefined,
          );
          const threeArg = buildSystemPrompt(
            jobPosition,
            seniorityLevel,
            questionCategory,
          );
          const canonicalQuick = buildSystemPrompt(
            jobPosition,
            seniorityLevel,
            questionCategory,
            'quick',
            undefined,
          );

          expect(targetedNoContext).toBe(threeArg);
          expect(targetedNoContext).toBe(canonicalQuick);
        },
      ),
      { numRuns: 100 },
    );
  });

  // --- Concrete anchors -----------------------------------------------------
  // A handful of explicit cases make failures readable without relying on
  // fast-check shrinking. Each case is also covered by the property above.

  test("'quick' with a defined jdContext is ignored — prompt equals the 3-arg call", () => {
    const jd: JobDescriptionContext = {
      company: 'Acme Corp',
      role: 'Senior Backend Engineer',
      technologies: ['Node.js', 'AWS', 'DynamoDB'],
      responsibilities: ['Design scalable APIs'],
      requirements: ['5+ years experience'],
      softSkills: ['Leadership'],
      suggestedSeniority: 'senior',
      suggestedCategory: 'technical',
      userNotes: 'Coming from a fintech background.',
    };

    const withJd = buildSystemPrompt(
      'software-engineer',
      'senior',
      'technical',
      'quick',
      jd,
    );
    const threeArg = buildSystemPrompt('software-engineer', 'senior', 'technical');
    expect(withJd).toBe(threeArg);
    // And the JD content must not leak into the Quick prompt.
    expect(withJd).not.toContain('Acme Corp');
    expect(withJd).not.toContain('Targeted Interview Context');
  });

  test("undefined mode with a defined jdContext maps to the Quick prompt", () => {
    const jd: JobDescriptionContext = {
      company: 'Acme Corp',
      role: 'Senior Backend Engineer',
      technologies: ['Node.js'],
      responsibilities: [],
      requirements: [],
      softSkills: [],
      suggestedSeniority: 'senior',
      suggestedCategory: 'technical',
      userNotes: '',
    };
    const result = buildSystemPrompt(
      'software-engineer',
      'senior',
      'technical',
      undefined,
      jd,
    );
    expect(result).toBe(
      buildSystemPrompt('software-engineer', 'senior', 'technical'),
    );
  });

  test("'invalid' mode maps to the Quick prompt", () => {
    const result = buildSystemPrompt(
      'software-engineer',
      'mid',
      'general',
      'invalid' as unknown as SessionMode,
      undefined,
    );
    expect(result).toBe(
      buildSystemPrompt('software-engineer', 'mid', 'general'),
    );
  });

  test("'QUICK' (wrong case) maps to the Quick prompt", () => {
    const result = buildSystemPrompt(
      'software-engineer',
      'junior',
      'general',
      'QUICK' as unknown as SessionMode,
      undefined,
    );
    expect(result).toBe(
      buildSystemPrompt('software-engineer', 'junior', 'general'),
    );
  });

  test("null mode maps to the Quick prompt", () => {
    const result = buildSystemPrompt(
      'product-manager',
      'lead',
      'general',
      null as unknown as SessionMode,
      undefined,
    );
    expect(result).toBe(
      buildSystemPrompt('product-manager', 'lead', 'general'),
    );
  });

  test("'targeted' with undefined jdContext maps to the Quick prompt (fallback branch)", () => {
    const result = buildSystemPrompt(
      'data-analyst',
      'mid',
      'technical',
      'targeted',
      undefined,
    );
    expect(result).toBe(
      buildSystemPrompt('data-analyst', 'mid', 'technical'),
    );
  });
});
