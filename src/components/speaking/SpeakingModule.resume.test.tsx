/**
 * Unit tests for SpeakingModule resume flow
 *
 * Tests the checking phase, ResumePrompt display, graceful degradation,
 * resume button behavior, start new button behavior, and error handling.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SpeakingModule from './SpeakingModule'
import { AuthProvider } from '../../hooks/useAuth'
import type { SessionData } from '../../types'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockChat = vi.fn()
vi.mock('../../services/apiClient', () => ({
  chat: (...args: unknown[]) => mockChat(...args),
  speak: vi.fn(() => Promise.resolve({ audioData: '' })),
  getProgress: vi.fn(() => Promise.resolve({})),
  TimeoutError: class TimeoutError extends Error {},
}))

vi.mock('../../services/authService', () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  getCurrentAuthUser: vi.fn(() =>
    Promise.resolve({ userId: 'u1', email: 'user@example.com' }),
  ),
  getAccessToken: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  fetchAuthSession: vi.fn(),
  getCurrentUser: vi.fn(),
  confirmSignUp: vi.fn(),
}))

function renderSpeakingModule() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <SpeakingModule />
      </AuthProvider>
    </MemoryRouter>,
  )
}

const sessionData: SessionData = {
  sessionId: 'sess-resume',
  jobPosition: 'Software Engineer',
  seniorityLevel: 'mid',
  questionCategory: 'technical',
  questions: [
    {
      questionId: 'q1',
      questionText: 'Tell me about yourself',
      questionType: 'introduction',
      transcription: 'I am...',
      feedback: {
        scores: { grammar: 80, vocabulary: 75, relevance: 90, fillerWords: 85, coherence: 80, overall: 82 },
        grammarErrors: [],
        fillerWordsDetected: [],
        suggestions: [],
        improvedAnswer: '',
      },
    },
    {
      questionId: 'q2',
      questionText: 'What are your strengths?',
      questionType: 'contextual',
    },
  ],
  createdAt: new Date(Date.now() - 3600000).toISOString(),
  updatedAt: new Date(Date.now() - 1800000).toISOString(),
}

describe('SpeakingModule resume flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('on mount, calls resume_session', async () => {
    mockChat.mockResolvedValue({
      type: 'no_active_session',
      content: '',
      sessionId: '',
    })
    renderSpeakingModule()

    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledWith({ action: 'resume_session' })
    })
  })

  it('shows loading indicator during checking phase', () => {
    // Mock resume_session to never resolve so we stay in checking phase
    mockChat.mockReturnValue(new Promise(() => {}))
    renderSpeakingModule()

    expect(screen.getByTestId('checking-indicator')).toBeInTheDocument()
  })

  it('shows ResumePrompt when active session found', async () => {
    mockChat.mockResolvedValue({
      type: 'session_resumed',
      content: '',
      sessionId: sessionData.sessionId,
      sessionData,
    })
    renderSpeakingModule()

    await waitFor(() => {
      expect(screen.getByTestId('resume-prompt')).toBeInTheDocument()
    })
  })

  it('shows JobPositionSelector when no active session', async () => {
    mockChat.mockResolvedValue({
      type: 'no_active_session',
      content: '',
      sessionId: '',
    })
    renderSpeakingModule()

    await waitFor(() => {
      expect(screen.getByText('Pilih Posisi Pekerjaan')).toBeInTheDocument()
    })
  })

  it('shows JobPositionSelector on network error (graceful degradation)', async () => {
    mockChat.mockRejectedValue(new Error('Network error'))
    renderSpeakingModule()

    await waitFor(() => {
      expect(screen.getByText('Pilih Posisi Pekerjaan')).toBeInTheDocument()
    })
  })

  it('resume button restores state and navigates to interview', async () => {
    // sessionData has last question (q2) with no transcription → resume at that question
    mockChat.mockImplementation((req: { action: string }) => {
      if (req.action === 'resume_session') {
        return Promise.resolve({
          type: 'session_resumed',
          content: '',
          sessionId: sessionData.sessionId,
          sessionData,
        })
      }
      return Promise.resolve({ type: 'question', content: '', sessionId: '' })
    })

    renderSpeakingModule()

    await waitFor(() => {
      expect(screen.getByTestId('resume-prompt')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Lanjutkan Sesi'))

    await waitFor(() => {
      expect(screen.getByTestId('interview-question')).toHaveTextContent('What are your strengths?')
    })
  })

  it('start new button calls abandon and shows selector', async () => {
    mockChat.mockImplementation((req: { action: string }) => {
      if (req.action === 'resume_session') {
        return Promise.resolve({
          type: 'session_resumed',
          content: '',
          sessionId: sessionData.sessionId,
          sessionData,
        })
      }
      if (req.action === 'abandon_session') {
        return Promise.resolve({
          type: 'session_abandoned',
          content: '',
          sessionId: sessionData.sessionId,
        })
      }
      return Promise.resolve({ type: 'question', content: '', sessionId: '' })
    })

    renderSpeakingModule()

    await waitFor(() => {
      expect(screen.getByTestId('resume-prompt')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Mulai Sesi Baru'))

    await waitFor(() => {
      expect(screen.getByText('Pilih Posisi Pekerjaan')).toBeInTheDocument()
    })

    expect(mockChat).toHaveBeenCalledWith({
      action: 'abandon_session',
      sessionId: 'sess-resume',
    })
  })

  it('error message shown when abandon fails', async () => {
    mockChat.mockImplementation((req: { action: string }) => {
      if (req.action === 'resume_session') {
        return Promise.resolve({
          type: 'session_resumed',
          content: '',
          sessionId: sessionData.sessionId,
          sessionData,
        })
      }
      if (req.action === 'abandon_session') {
        return Promise.reject(new Error('Server error'))
      }
      return Promise.resolve({ type: 'question', content: '', sessionId: '' })
    })

    renderSpeakingModule()

    await waitFor(() => {
      expect(screen.getByTestId('resume-prompt')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Mulai Sesi Baru'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Sesi lama tidak dapat ditutup')
    })

    // Should still show JobPositionSelector
    await waitFor(() => {
      expect(screen.getByText('Pilih Posisi Pekerjaan')).toBeInTheDocument()
    })
  })
})
