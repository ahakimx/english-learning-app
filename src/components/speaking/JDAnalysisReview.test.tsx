import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import JDAnalysisReview from './JDAnalysisReview'
import type { JobDescriptionContext } from '../../types'

function makeContext(overrides: Partial<JobDescriptionContext> = {}): JobDescriptionContext {
  return {
    company: 'Acme',
    role: 'Engineer',
    technologies: [],
    responsibilities: [],
    requirements: [],
    softSkills: [],
    suggestedSeniority: 'mid',
    suggestedCategory: 'general',
    userNotes: '',
    ...overrides,
  }
}

describe('JDAnalysisReview', () => {
  // Requirement 5.4: seniority restricted to 4 values (junior, mid, senior, lead)
  it('renders exactly 4 seniority radio options', () => {
    const onStart = vi.fn()
    const onBack = vi.fn()
    render(
      <JDAnalysisReview
        initialContext={makeContext()}
        onStart={onStart}
        onBack={onBack}
      />,
    )

    const seniorityRadios = screen.getAllByRole('radio', {
      name: /Junior|Menengah|Senior|Lead/,
    })
    expect(seniorityRadios).toHaveLength(4)

    // Assert each one is in the suggestedSeniority radio group
    seniorityRadios.forEach((input) => {
      expect(input).toHaveAttribute('name', 'suggestedSeniority')
    })

    // Assert the values are exactly the 4 expected seniority levels
    const values = seniorityRadios.map((r) => (r as HTMLInputElement).value).sort()
    expect(values).toEqual(['junior', 'lead', 'mid', 'senior'])
  })

  // Requirement 5.5: category restricted to 2 values (general, technical)
  it('renders exactly 2 category radio options', () => {
    const onStart = vi.fn()
    const onBack = vi.fn()
    render(
      <JDAnalysisReview
        initialContext={makeContext()}
        onStart={onStart}
        onBack={onBack}
      />,
    )

    const categoryRadios = screen.getAllByRole('radio', { name: /Umum|Teknis/ })
    expect(categoryRadios).toHaveLength(2)

    categoryRadios.forEach((input) => {
      expect(input).toHaveAttribute('name', 'suggestedCategory')
    })

    const values = categoryRadios.map((r) => (r as HTMLInputElement).value).sort()
    expect(values).toEqual(['general', 'technical'])
  })

  // Requirement 5.8: Back invokes onBack and does not emit a start
  it('clicking Kembali calls onBack and does NOT call onStart', () => {
    const onStart = vi.fn()
    const onBack = vi.fn()
    render(
      <JDAnalysisReview
        initialContext={makeContext()}
        onStart={onStart}
        onBack={onBack}
      />,
    )

    // Both back controls share the same aria-label ("Kembali ke input deskripsi pekerjaan").
    // Clicking any of them must invoke onBack and must NOT emit a start.
    const backButtons = screen.getAllByRole('button', {
      name: /Kembali ke input deskripsi pekerjaan/i,
    })
    expect(backButtons.length).toBeGreaterThanOrEqual(1)
    fireEvent.click(backButtons[0])

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onStart).not.toHaveBeenCalled()
  })

  // Requirement 5.7: Start emits the edited context, not the initial one
  it('Mulai Interview emits the EDITED context (not the original initialContext)', () => {
    const onStart = vi.fn()
    const onBack = vi.fn()
    const initial = makeContext({ company: 'Acme', role: 'Engineer' })
    render(
      <JDAnalysisReview initialContext={initial} onStart={onStart} onBack={onBack} />,
    )

    // Edit the company field
    const companyInput = screen.getByLabelText(/Perusahaan/i) as HTMLInputElement
    fireEvent.change(companyInput, { target: { value: 'Foobar' } })

    // Click start
    const startButton = screen.getByRole('button', { name: /Mulai interview/i })
    fireEvent.click(startButton)

    expect(onStart).toHaveBeenCalledTimes(1)
    const emitted = onStart.mock.calls[0][0] as JobDescriptionContext
    expect(emitted.company).toBe('Foobar')
    expect(emitted.company).not.toBe('Acme')
    // Role untouched — should still match the initial value
    expect(emitted.role).toBe('Engineer')
  })

  // Requirement 5.6: role-empty → start disabled
  it('disables Mulai Interview while role is empty', () => {
    const onStart = vi.fn()
    const onBack = vi.fn()
    render(
      <JDAnalysisReview
        initialContext={makeContext({ role: '' })}
        onStart={onStart}
        onBack={onBack}
      />,
    )

    const startButton = screen.getByRole('button', {
      name: /Mulai interview/i,
    }) as HTMLButtonElement
    expect(startButton.disabled).toBe(true)

    // Clicking while disabled should not fire onStart
    fireEvent.click(startButton)
    expect(onStart).not.toHaveBeenCalled()
  })

  // Requirement 5.4 + 5.7: changing seniority updates state and is emitted on Start
  it('selecting a seniority radio updates state and is passed to onStart', () => {
    const onStart = vi.fn()
    const onBack = vi.fn()
    render(
      <JDAnalysisReview
        initialContext={makeContext({ suggestedSeniority: 'mid' })}
        onStart={onStart}
        onBack={onBack}
      />,
    )

    const seniorRadio = screen.getByRole('radio', { name: /Senior/ }) as HTMLInputElement
    fireEvent.click(seniorRadio)
    expect(seniorRadio.checked).toBe(true)

    const startButton = screen.getByRole('button', { name: /Mulai interview/i })
    fireEvent.click(startButton)

    expect(onStart).toHaveBeenCalledTimes(1)
    const emitted = onStart.mock.calls[0][0] as JobDescriptionContext
    expect(emitted.suggestedSeniority).toBe('senior')
  })
})
