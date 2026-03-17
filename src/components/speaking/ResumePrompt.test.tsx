import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ResumePrompt from './ResumePrompt'
import type { SessionData } from '../../types'

function createSessionData(overrides?: Partial<SessionData>): SessionData {
  const now = Date.now()
  return {
    sessionId: 'sess-001',
    jobPosition: 'Software Engineer',
    seniorityLevel: 'mid',
    questionCategory: 'technical',
    questions: [
      { questionId: 'q1', questionText: 'Tell me about yourself', transcription: 'I am a developer' },
      { questionId: 'q2', questionText: 'Why this role?', transcription: 'I love coding' },
      { questionId: 'q3', questionText: 'Describe a challenge', },
    ],
    createdAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  }
}

describe('ResumePrompt', () => {
  it('renders all session info', () => {
    const sessionData = createSessionData()
    render(
      <ResumePrompt
        sessionData={sessionData}
        onResume={vi.fn()}
        onStartNew={vi.fn()}
        isAbandoning={false}
      />,
    )

    expect(screen.getByTestId('session-position').textContent).toBe('Software Engineer')
    expect(screen.getByTestId('session-seniority').textContent).toBe('Menengah')
    expect(screen.getByTestId('session-category').textContent).toBe('Teknis')
    expect(screen.getByTestId('answered-count').textContent).toBe('2 / 3')
    expect(screen.getByTestId('elapsed-time').textContent).toBe('2 jam yang lalu')
  })

  it('both buttons present and clickable', () => {
    const onResume = vi.fn()
    const onStartNew = vi.fn()

    render(
      <ResumePrompt
        sessionData={createSessionData()}
        onResume={onResume}
        onStartNew={onStartNew}
        isAbandoning={false}
      />,
    )

    const resumeBtn = screen.getByTestId('resume-button')
    const startNewBtn = screen.getByTestId('start-new-button')

    fireEvent.click(resumeBtn)
    expect(onResume).toHaveBeenCalledTimes(1)

    fireEvent.click(startNewBtn)
    expect(onStartNew).toHaveBeenCalledTimes(1)
  })

  it('loading state on start new button when isAbandoning is true', () => {
    render(
      <ResumePrompt
        sessionData={createSessionData()}
        onResume={vi.fn()}
        onStartNew={vi.fn()}
        isAbandoning={true}
      />,
    )

    const resumeBtn = screen.getByTestId('resume-button')
    const startNewBtn = screen.getByTestId('start-new-button')

    // Both buttons should be disabled
    expect(resumeBtn).toBeDisabled()
    expect(startNewBtn).toBeDisabled()

    // Start new button should contain an SVG spinner
    const svg = startNewBtn.querySelector('svg')
    expect(svg).not.toBeNull()
  })
})
