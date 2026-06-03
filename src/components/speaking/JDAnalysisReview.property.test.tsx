import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import JDAnalysisReview from './JDAnalysisReview'
import type { JobDescriptionContext } from '../../types'

/**
 * Feature: jd-targeting
 * Property 5: List field editing in review component is faithful
 *
 * Validates: Requirement 5.3
 *
 * For any initial list of entries and any sequence of add / edit / remove
 * operations applied via the UI, the final edited context passed to `onStart`
 * must match exactly what the user typed — not the initial values. We exercise
 * `technologies` as the representative list field (component handles all four
 * list fields — technologies, responsibilities, requirements, softSkills — via
 * the same shared code path).
 */

// Generators. DOM rendering is expensive, so sizes are kept small.
const initialEntryArb = fc.string({ minLength: 1, maxLength: 10 })
const initialEntriesArb = fc.array(initialEntryArb, { minLength: 0, maxLength: 3 })

const typedEntryArb = fc.string({ minLength: 1, maxLength: 20 })
const typedEntriesArb = fc.array(typedEntryArb, { minLength: 1, maxLength: 5 })

function buildInitialContext(initialTechnologies: string[]): JobDescriptionContext {
  return {
    company: 'Acme Corp',
    // Requirement 5.6: role must be non-empty so the "Mulai Interview" button is enabled.
    role: 'Senior Backend Engineer',
    technologies: [...initialTechnologies],
    responsibilities: [],
    requirements: [],
    softSkills: [],
    suggestedSeniority: 'senior',
    suggestedCategory: 'technical',
    userNotes: '',
  }
}

describe('Feature: jd-targeting, Property 5: List field editing in review component is faithful', () => {
  afterEach(() => {
    cleanup()
  })

  it('should pass the typed entries (not the initial ones) to onStart after remove/add/edit', () => {
    fc.assert(
      fc.property(initialEntriesArb, typedEntriesArb, (initialEntries, typedEntries) => {
        const onStart = vi.fn()
        const onBack = vi.fn()

        render(
          <JDAnalysisReview
            initialContext={buildInitialContext(initialEntries)}
            onStart={onStart}
            onBack={onBack}
          />,
        )

        // Step 1: Remove every initial entry. The list shifts after each delete, so
        // always click "Hapus Teknologi entri 1" which targets the head of the list.
        for (let i = 0; i < initialEntries.length; i++) {
          const deleteBtn = screen.getByLabelText('Hapus Teknologi entri 1')
          fireEvent.click(deleteBtn)
        }

        // Step 2: Add N new empty entries by clicking the "Tambah" (Add) button.
        const addBtn = screen.getByLabelText('Tambah Teknologi')
        for (let i = 0; i < typedEntries.length; i++) {
          fireEvent.click(addBtn)
        }

        // Step 3: Type the target value into each entry's text input.
        for (let i = 0; i < typedEntries.length; i++) {
          const input = screen.getByLabelText(`Teknologi entri ${i + 1}`)
          fireEvent.change(input, { target: { value: typedEntries[i] } })
        }

        // Step 4: Click "Mulai Interview" to emit the edited context.
        const startBtn = screen.getByLabelText(
          'Mulai interview dengan konteks pekerjaan yang sudah ditinjau',
        )
        fireEvent.click(startBtn)

        // Step 5: onStart must receive the typed array in the exact order — never
        // the initial values.
        expect(onStart).toHaveBeenCalledTimes(1)
        const received = onStart.mock.calls[0][0] as JobDescriptionContext
        expect(received.technologies).toEqual(typedEntries)

        cleanup()
      }),
      { numRuns: 20 },
    )
  })
})
