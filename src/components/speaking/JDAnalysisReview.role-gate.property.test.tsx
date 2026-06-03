import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import JDAnalysisReview from './JDAnalysisReview'
import type { JobDescriptionContext } from '../../types'

/**
 * Feature: jd-targeting
 * Property 6: Review component start gating on role
 *
 * Validates: Requirement 5.6
 *
 * For any string value `r` typed into the `role` input of
 * JD_Analysis_Review_Component, the "Mulai Interview" button SHALL be
 * disabled if and only if `r.trim() === ''`. Equivalently, the button is
 * enabled iff the trimmed role is non-empty.
 */

function buildInitialContext(): JobDescriptionContext {
  return {
    company: 'Acme Corp',
    // Start with a non-empty role so the first render has the button enabled.
    role: 'Initial Role',
    technologies: [],
    responsibilities: [],
    requirements: [],
    softSkills: [],
    suggestedSeniority: 'mid',
    suggestedCategory: 'general',
    userNotes: '',
  }
}

describe('Feature: jd-targeting, Property 6: Review component start gating on role', () => {
  afterEach(() => {
    cleanup()
  })

  it('disables "Mulai Interview" iff the typed role trims to empty', () => {
    const onStart = vi.fn()
    const onBack = vi.fn()

    render(
      <JDAnalysisReview
        initialContext={buildInitialContext()}
        onStart={onStart}
        onBack={onBack}
      />,
    )

    // Role input is associated to the label "Posisi *" via htmlFor="jd-role".
    const roleInput = screen.getByLabelText(/Posisi/) as HTMLInputElement
    const startBtn = screen.getByLabelText(
      'Mulai interview dengan konteks pekerjaan yang sudah ditinjau',
    ) as HTMLButtonElement

    fc.assert(
      fc.property(fc.string(), (r) => {
        // Clear + re-type in one shot (controlled input replaces value wholesale).
        fireEvent.change(roleInput, { target: { value: r } })

        const expectedDisabled = r.trim() === ''
        expect(startBtn.disabled).toBe(expectedDisabled)
      }),
      { numRuns: 30 },
    )
  })
})
