import fc from 'fast-check';

import { buildSystemPrompt as buildInfra } from '../lambda/websocket/nova-sonic/promptBuilder';
// The server-side promptBuilder lives outside infra's tsconfig rootDir. Using a
// runtime `require` keeps this test file compilable under infra's tsconfig while
// still loading the real module at test time via ts-jest (which transforms .ts
// files encountered at runtime regardless of rootDir).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serverPromptBuilder: {
  buildSystemPrompt: typeof buildInfra;
} = require('../../server/src/promptBuilder');
const buildServer = serverPromptBuilder.buildSystemPrompt;

import type {
  JobDescriptionContext,
  QuestionCategory,
  SeniorityLevel,
  SessionMode,
} from '../lib/types';

// ============================================================================
// Feature: jd-targeting, Property 13: Prompt builders are synchronized across
// server and infra
// **Validates: Requirement 7.6**
//
// For any input `(jobPosition, seniorityLevel, questionCategory, mode, jdContext)`,
// the `buildSystemPrompt` function exported from `server/src/promptBuilder.ts`
// SHALL return a string identical to the one returned by `buildSystemPrompt`
// in `infra/lambda/websocket/nova-sonic/promptBuilder.ts`.
//
// The two implementations are intentionally maintained as separate files (one
// per build target); this property test is the structural safety net that
// guarantees they never drift.
// ============================================================================

// --- Generators -------------------------------------------------------------

const seniorityArb: fc.Arbitrary<SeniorityLevel> = fc.constantFrom(
  'junior',
  'mid',
  'senior',
  'lead',
);

const categoryArb: fc.Arbitrary<QuestionCategory> = fc.constantFrom(
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

// JobDescriptionContext arbitrary covering:
//   - empty strings (company, userNotes)
//   - whitespace-only userNotes (trim() === '')
//   - empty and non-empty lists for each list field
//   - role is always a non-empty trimmed string (required by the JD analysis contract)
const jdContextArb: fc.Arbitrary<JobDescriptionContext> = fc.record({
  company: fc.string({ minLength: 0, maxLength: 40 }),
  role: fc
    .string({ minLength: 1, maxLength: 40 })
    .filter((s) => s.trim() !== ''),
  technologies: fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
    minLength: 0,
    maxLength: 6,
  }),
  responsibilities: fc.array(fc.string({ minLength: 1, maxLength: 40 }), {
    minLength: 0,
    maxLength: 6,
  }),
  requirements: fc.array(fc.string({ minLength: 1, maxLength: 40 }), {
    minLength: 0,
    maxLength: 6,
  }),
  softSkills: fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
    minLength: 0,
    maxLength: 6,
  }),
  suggestedSeniority: seniorityArb,
  suggestedCategory: categoryArb,
  userNotes: fc.oneof(
    fc.constant(''),
    fc.constant('   '),
    fc.constant('\t\n '),
    fc.string({ minLength: 1, maxLength: 80 }),
  ),
});

// Mode arbitrary: covers 'quick', 'targeted', undefined, plus a handful of
// off-spec values that the function must treat as Quick (not 'targeted').
const modeArb: fc.Arbitrary<SessionMode | undefined> = fc.oneof(
  fc.constant<SessionMode>('quick'),
  fc.constant<SessionMode>('targeted'),
  fc.constant<undefined>(undefined),
  // off-spec strings are exercised via the typed cast in concrete anchors below
);

// Optional JD context: sometimes undefined, sometimes a well-formed context.
const optionalJdContextArb: fc.Arbitrary<JobDescriptionContext | undefined> = fc.option(
  jdContextArb,
  { nil: undefined, freq: 2 },
);

// --- Property 13 ------------------------------------------------------------

describe('Feature: jd-targeting, Property 13: Prompt builders are synchronized across server and infra', () => {
  test('buildSystemPrompt from server and infra return byte-identical strings for any input', () => {
    fc.assert(
      fc.property(
        jobPositionArb,
        seniorityArb,
        categoryArb,
        modeArb,
        optionalJdContextArb,
        (jobPosition, seniorityLevel, questionCategory, mode, jdContext) => {
          const infraOut = buildInfra(
            jobPosition,
            seniorityLevel,
            questionCategory,
            mode,
            jdContext,
          );
          const serverOut = buildServer(
            jobPosition,
            seniorityLevel,
            questionCategory,
            mode,
            jdContext,
          );
          expect(serverOut).toBe(infraOut);
        },
      ),
      { numRuns: 200 },
    );
  });

  test('3-arg call (Quick path) is byte-identical between server and infra', () => {
    fc.assert(
      fc.property(
        jobPositionArb,
        seniorityArb,
        categoryArb,
        (jobPosition, seniorityLevel, questionCategory) => {
          const infraOut = buildInfra(jobPosition, seniorityLevel, questionCategory);
          const serverOut = buildServer(jobPosition, seniorityLevel, questionCategory);
          expect(serverOut).toBe(infraOut);
        },
      ),
      { numRuns: 100 },
    );
  });

  test("targeted mode with a rich jdContext is byte-identical between server and infra", () => {
    fc.assert(
      fc.property(
        jobPositionArb,
        seniorityArb,
        categoryArb,
        jdContextArb,
        (jobPosition, seniorityLevel, questionCategory, jdContext) => {
          const infraOut = buildInfra(
            jobPosition,
            seniorityLevel,
            questionCategory,
            'targeted',
            jdContext,
          );
          const serverOut = buildServer(
            jobPosition,
            seniorityLevel,
            questionCategory,
            'targeted',
            jdContext,
          );
          expect(serverOut).toBe(infraOut);
        },
      ),
      { numRuns: 200 },
    );
  });

  // --- Concrete anchors -----------------------------------------------------
  // Explicit, readable cases that do not rely on fast-check shrinking. Each is
  // also covered by the property above but they make regressions easy to
  // diagnose at a glance.

  test("concrete: 3-arg Quick call matches byte-for-byte", () => {
    expect(buildServer('software-engineer', 'senior', 'technical')).toBe(
      buildInfra('software-engineer', 'senior', 'technical'),
    );
  });

  test("concrete: explicit 'quick' with undefined jdContext matches", () => {
    expect(buildServer('product-manager', 'mid', 'general', 'quick', undefined)).toBe(
      buildInfra('product-manager', 'mid', 'general', 'quick', undefined),
    );
  });

  test("concrete: 'targeted' with undefined jdContext falls back to Quick on both sides", () => {
    expect(buildServer('data-analyst', 'junior', 'technical', 'targeted', undefined)).toBe(
      buildInfra('data-analyst', 'junior', 'technical', 'targeted', undefined),
    );
  });

  test("concrete: 'targeted' with a fully-populated jdContext matches byte-for-byte", () => {
    const jd: JobDescriptionContext = {
      company: 'Acme Corp',
      role: 'Senior Backend Engineer',
      technologies: ['Node.js', 'AWS', 'DynamoDB'],
      responsibilities: ['Design scalable APIs', 'Lead backend team'],
      requirements: ['5+ years experience', 'AWS certification'],
      softSkills: ['Leadership', 'Communication'],
      suggestedSeniority: 'senior',
      suggestedCategory: 'technical',
      userNotes: 'Coming from a fintech background.',
    };
    expect(
      buildServer('software-engineer', 'senior', 'technical', 'targeted', jd),
    ).toBe(buildInfra('software-engineer', 'senior', 'technical', 'targeted', jd));
  });

  test("concrete: 'targeted' with empty lists + empty userNotes matches byte-for-byte", () => {
    const jd: JobDescriptionContext = {
      company: '',
      role: 'Engineer',
      technologies: [],
      responsibilities: [],
      requirements: [],
      softSkills: [],
      suggestedSeniority: 'mid',
      suggestedCategory: 'general',
      userNotes: '',
    };
    expect(
      buildServer('software-engineer', 'mid', 'general', 'targeted', jd),
    ).toBe(buildInfra('software-engineer', 'mid', 'general', 'targeted', jd));
  });

  test("concrete: 'targeted' with whitespace-only userNotes (trim empty) matches byte-for-byte", () => {
    const jd: JobDescriptionContext = {
      company: 'Acme',
      role: 'Engineer',
      technologies: ['Go'],
      responsibilities: [],
      requirements: [],
      softSkills: [],
      suggestedSeniority: 'mid',
      suggestedCategory: 'technical',
      userNotes: '   \t\n ',
    };
    expect(
      buildServer('software-engineer', 'mid', 'technical', 'targeted', jd),
    ).toBe(buildInfra('software-engineer', 'mid', 'technical', 'targeted', jd));
  });

  test("concrete: off-spec mode value ('invalid') is treated identically by both sides", () => {
    expect(
      buildServer(
        'software-engineer',
        'mid',
        'general',
        'invalid' as unknown as SessionMode,
        undefined,
      ),
    ).toBe(
      buildInfra(
        'software-engineer',
        'mid',
        'general',
        'invalid' as unknown as SessionMode,
        undefined,
      ),
    );
  });
});
