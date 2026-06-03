import fc from 'fast-check';

import { buildSystemPrompt } from '../lambda/websocket/nova-sonic/promptBuilder';
import type {
  JobDescriptionContext,
  QuestionCategory,
  SeniorityLevel,
} from '../lib/types';

// ============================================================================
// Feature: jd-targeting, Property 10: Targeted prompt references all non-empty
// JD fields
// **Validates: Requirements 7.1, 7.2**
//
// For any JobDescriptionContext `ctx` with `role` non-empty, calling
// `buildSystemPrompt('Fallback', 'mid', 'technical', 'targeted', ctx)` produces
// a string that contains:
//   1. `ctx.company` if `ctx.company !== ''`
//   2. `ctx.role` (always, since it's non-empty)
//   3. each of `ctx.technologies` if the array is non-empty
//   4. each of `ctx.responsibilities` if the array is non-empty
//   5. each of `ctx.requirements` if the array is non-empty
//   6. each of `ctx.softSkills` if the array is non-empty
//   7. `ctx.userNotes` if `ctx.userNotes.trim() !== ''`
//
// Generated string values use a `JD_` salt prefix + hex suffix so they never
// accidentally match boilerplate text in the Quick prompt (e.g. "Role:",
// "Company:", "technical", "mid", etc.).
// ============================================================================

// --- Generators ---

// Distinctive non-empty string: `JD_<TAG>_<hex>` — never collides with base
// prompt boilerplate such as "Role:", "Company:", "Technologies mentioned",
// seniority/category values, or the Targeted Interview Context header text.
function distinctive(tag: string) {
  return fc
    .hexaString({ minLength: 4, maxLength: 16 })
    .map((hex) => `JD_${tag}_${hex}`);
}

// Optional distinctive string: either '' or a distinctive non-empty string.
function optionalDistinctive(tag: string) {
  return fc.oneof(fc.constant(''), distinctive(tag));
}

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

// userNotes covers three cases:
//   - empty string ('')
//   - whitespace-only (trim() === '')
//   - distinctive non-empty string (trim() !== '')
const userNotesArb = fc.oneof(
  fc.constant(''),
  fc.constant('   '),
  fc.constant('\t\n '),
  distinctive('NOTES'),
);

const jdContextArb: fc.Arbitrary<JobDescriptionContext> = fc.record({
  company: optionalDistinctive('COMPANY'),
  // role is always non-empty (and distinctive) to satisfy the property precondition
  role: distinctive('ROLE'),
  technologies: fc.array(distinctive('TECH'), { maxLength: 8 }),
  responsibilities: fc.array(distinctive('RESP'), { maxLength: 8 }),
  requirements: fc.array(distinctive('REQ'), { maxLength: 8 }),
  softSkills: fc.array(distinctive('SOFT'), { maxLength: 8 }),
  suggestedSeniority: seniorityArb,
  suggestedCategory: categoryArb,
  userNotes: userNotesArb,
});

describe('Feature: jd-targeting, Property 10: Targeted prompt references all non-empty JD fields', () => {
  test('For any JobDescriptionContext with non-empty role, the targeted prompt contains every non-empty JD field value', () => {
    fc.assert(
      fc.property(jdContextArb, (ctx) => {
        const prompt = buildSystemPrompt(
          'Fallback',
          'mid',
          'technical',
          'targeted',
          ctx,
        );

        // 2. role is always contained (non-empty by construction)
        expect(prompt).toContain(ctx.role);

        // 1. company contained iff non-empty
        if (ctx.company !== '') {
          expect(prompt).toContain(ctx.company);
        }

        // 3. each technology contained if list is non-empty
        if (ctx.technologies.length > 0) {
          for (const tech of ctx.technologies) {
            expect(prompt).toContain(tech);
          }
        }

        // 4. each responsibility contained if list is non-empty
        if (ctx.responsibilities.length > 0) {
          for (const resp of ctx.responsibilities) {
            expect(prompt).toContain(resp);
          }
        }

        // 5. each requirement contained if list is non-empty
        if (ctx.requirements.length > 0) {
          for (const req of ctx.requirements) {
            expect(prompt).toContain(req);
          }
        }

        // 6. each soft skill contained if list is non-empty
        if (ctx.softSkills.length > 0) {
          for (const skill of ctx.softSkills) {
            expect(prompt).toContain(skill);
          }
        }

        // 7. userNotes contained iff trim() !== ''
        if (ctx.userNotes.trim() !== '') {
          expect(prompt).toContain(ctx.userNotes);
        }
      }),
      { numRuns: 200 },
    );
  });
});
