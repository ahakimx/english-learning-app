import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import JobDescriptionInput from './JobDescriptionInput'
import { JD_MIN_LENGTH, JD_MAX_LENGTH } from './jdConstants'

/**
 * Feature: jd-targeting
 * Property 2: Valid JD input triggers analyze API with correct payload
 *
 * Validates: Requirements 2.2, 2.5
 *
 * For any string `s` with length in [JD_MIN_LENGTH, JD_MAX_LENGTH], when `s`
 * is typed into the JD textarea and the "Analisis" button is clicked, the
 * `onSubmit` callback SHALL be invoked exactly once with `s` as its argument.
 *
 * Notes:
 * - DOM rendering per iteration is expensive, so `numRuns` is kept low (20).
 * - Each iteration renders a fresh component with fresh mocks, and the DOM is
 *   cleaned up between iterations so assertions remain independent.
 */

describe('Feature: jd-targeting, Property 2: Valid JD input triggers analyze API with correct payload', () => {
  afterEach(() => {
    cleanup()
  })

  it('calls onSubmit exactly once with the typed text for any valid-length JD string', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: JD_MIN_LENGTH, maxLength: JD_MAX_LENGTH }),
        (s) => {
          // Guard: fast-check's length constraints are on generated chars.
          // Reassert here so the property is self-validating.
          expect(s.length).toBeGreaterThanOrEqual(JD_MIN_LENGTH)
          expect(s.length).toBeLessThanOrEqual(JD_MAX_LENGTH)

          const onSubmit = vi.fn()
          const onBack = vi.fn()

          render(
            <JobDescriptionInput onSubmit={onSubmit} onBack={onBack} />,
          )

          const textarea = screen.getByLabelText(
            /deskripsi pekerjaan untuk dianalisis/i,
          ) as HTMLTextAreaElement
          const submitButton = screen.getByRole('button', {
            name: /analisis deskripsi pekerjaan/i,
          }) as HTMLButtonElement

          fireEvent.change(textarea, { target: { value: s } })
          fireEvent.click(submitButton)

          expect(onSubmit).toHaveBeenCalledTimes(1)
          expect(onSubmit).toHaveBeenCalledWith(s)
          expect(onBack).not.toHaveBeenCalled()

          // Clean up DOM between iterations so the next render starts fresh.
          cleanup()
        },
      ),
      { numRuns: 20 },
    )
  })
})
