/**
 * Integration tests for the English Learning App.
 * Flows: Auth, Speaking, Grammar, Writing
 * Requirements: 1.1, 1.2, 3.2, 8.2, 9.3
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import App from '../App'
import { AuthProvider } from '../hooks/useAuth'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockLogin = vi.fn()
const mockRegister = vi.fn()
const mockLogout = vi.fn()
const mockGetCurrentAuthUser = vi.fn()

vi.mock('../services/authService', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  register: (...args: unknown[]) => mockRegister(...args),
  logout: (...args: unknown[]) => mockLogout(...args),
  getCurrentAuthUser: (...args: unknown[]) => mockGetCurrentAuthUser(...args),
  getAccessToken: vi.fn(() => Promise.resolve('mock-token')),
  refreshSession: vi.fn(() => Promise.resolve(null)),
  confirmRegistration: vi.fn(),
}))

vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(),
  fetchAuthSession: vi.fn(), getCurrentUser: vi.fn(), confirmSignUp: vi.fn(),
}))

vi.mock('aws-amplify/storage', () => ({
  uploadData: vi.fn(() => Promise.resolve({ key: 'mock-key' })),
}))

const mockChat = vi.fn()
const mockTranscribe = vi.fn()
const mockSpeak = vi.fn()
const mockGetProgress = vi.fn()
const mockUpdateProgress = vi.fn()

vi.mock('../services/apiClient', () => ({
  chat: (...args: unknown[]) => mockChat(...args),
  transcribe: (...args: unknown[]) => mockTranscribe(...args),
  speak: (...args: unknown[]) => mockSpeak(...args),
  getProgress: (...args: unknown[]) => mockGetProgress(...args),
  updateProgress: (...args: unknown[]) => mockUpdateProgress(...args),
  TimeoutError: class TimeoutError extends Error {
    constructor(msg = 'Timeout') { super(msg); this.name = 'TimeoutError' }
  },
}))

vi.mock('../services/audioService', () => ({
  uploadAudio: vi.fn(() => Promise.resolve('u1/sess-1/q-1.webm')),
}))

const defaultProgress = {
  speaking: { totalSessions: 0, averageScore: 0, scoreHistory: [] },
  grammar: { totalQuizzes: 0, topicScores: {} },
  writing: { totalReviews: 0, averageScore: 0, scoreHistory: [] },
}

function renderApp(initialRoute = '/') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <AuthProvider><App /></AuthProvider>
    </MemoryRouter>,
  )
}


// ── 1. Auth Flow ───────────────────────────────────────────────────────────

describe('Integration: Auth flow (register → login → protected route → logout)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentAuthUser.mockResolvedValue(null)
    mockGetProgress.mockResolvedValue(defaultProgress)
    mockUpdateProgress.mockResolvedValue(undefined)
  })

  it('redirects unauthenticated user from dashboard to login', async () => {
    renderApp('/dashboard')
    // Both h1 and button say "Masuk", so use heading role
    expect(await screen.findByRole('heading', { name: 'Masuk' })).toBeInTheDocument()
  })

  it('completes register → success message flow', async () => {
    mockRegister.mockResolvedValue({})
    renderApp('/register')

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'SecurePass1!' } })
    fireEvent.change(screen.getByLabelText('Konfirmasi Password'), { target: { value: 'SecurePass1!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Daftar' }))

    expect(await screen.findByText('Verifikasi Email')).toBeInTheDocument()
    expect(mockRegister).toHaveBeenCalledWith('new@example.com', 'SecurePass1!')
  })

  it('completes login → navigate to dashboard flow', async () => {
    mockLogin.mockResolvedValue({})
    mockGetCurrentAuthUser
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ userId: 'u1', email: 'user@example.com' })

    renderApp('/login')

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'MyPass123!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('user@example.com', 'MyPass123!')
    })
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('shows generic error on invalid credentials without leaking info', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid'))
    renderApp('/login')

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'bad@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Email atau password salah')
  })

  it('authenticated user sees dashboard and can logout', async () => {
    mockGetCurrentAuthUser.mockResolvedValue({ userId: 'u1', email: 'user@example.com' })
    mockLogout.mockResolvedValue(undefined)

    renderApp('/dashboard')

    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('user@example.com')).toBeInTheDocument()
    expect(screen.getByText('Speaking')).toBeInTheDocument()
    expect(screen.getByText('Grammar')).toBeInTheDocument()
    expect(screen.getByText('Writing')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Keluar'))
    await waitFor(() => { expect(mockLogout).toHaveBeenCalled() })
  })
})


// ── 2. Speaking Flow ───────────────────────────────────────────────────────

describe('Integration: Speaking flow (start session → feedback → summary)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentAuthUser.mockResolvedValue({ userId: 'u1', email: 'user@example.com' })
    mockGetProgress.mockResolvedValue(defaultProgress)
    mockUpdateProgress.mockResolvedValue(undefined)
    mockSpeak.mockResolvedValue({ audioData: 'bW9jaw==' })
  })

  it('selects position with seniority and category, starts interview session with question displayed', async () => {
    mockChat.mockImplementation((args: Record<string, unknown>) => {
      if (args.action === 'resume_session') {
        return Promise.resolve({ type: 'no_active_session', content: '', sessionId: '' })
      }
      return Promise.resolve({
        sessionId: 'sess-s1',
        type: 'question',
        content: 'Tell me about your experience with software development.',
      })
    })

    renderApp('/speaking')
    expect(await screen.findByText('Pilih Posisi Pekerjaan')).toBeInTheDocument()

    // Multi-step selection: position → seniority → category
    fireEvent.click(screen.getByLabelText('Pilih posisi Software Engineer'))
    fireEvent.click(screen.getByLabelText('Pilih tingkat Senior'))
    fireEvent.click(screen.getByLabelText('Pilih kategori Teknis'))

    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledWith({
        action: 'start_session',
        jobPosition: 'Software Engineer',
        seniorityLevel: 'senior',
        questionCategory: 'technical',
      })
    })

    expect(await screen.findByTestId('interview-question')).toHaveTextContent(
      'Tell me about your experience with software development.',
    )
    expect(screen.getByText(/Posisi: Software Engineer/)).toBeInTheDocument()
  })

  it('shows error and returns to selection when start session fails', async () => {
    mockChat.mockImplementation((args: Record<string, unknown>) => {
      if (args.action === 'resume_session') {
        return Promise.resolve({ type: 'no_active_session', content: '', sessionId: '' })
      }
      return Promise.reject(new Error('Network error'))
    })

    renderApp('/speaking')
    await screen.findByText('Pilih Posisi Pekerjaan')

    // Multi-step selection: position → seniority → category
    fireEvent.click(screen.getByLabelText('Pilih posisi Product Manager'))
    fireEvent.click(screen.getByLabelText('Pilih tingkat Menengah'))
    fireEvent.click(screen.getByLabelText('Pilih kategori Umum'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Gagal memulai sesi interview. Silakan coba lagi.',
    )
    expect(screen.getByText('Pilih Posisi Pekerjaan')).toBeInTheDocument()
  })
})


// ── 3. Grammar Flow ────────────────────────────────────────────────────────

describe('Integration: Grammar flow (select topic → answer quiz → view explanation)', () => {
  const quizResponse = {
    sessionId: 'sess-g1',
    type: 'quiz' as const,
    content: '',
    quizData: {
      questionId: 'q-g1',
      question: 'Choose the correct form: She ___ to school every day.',
      options: ['go', 'goes', 'going', 'gone'],
      correctAnswer: 'goes',
    },
  }

  const explanationResponse = {
    sessionId: 'sess-g1',
    type: 'explanation' as const,
    content: 'The correct answer is "goes" because third person singular subjects use -s/-es in simple present tense.',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentAuthUser.mockResolvedValue({ userId: 'u1', email: 'user@example.com' })
    mockGetProgress.mockResolvedValue(defaultProgress)
    mockUpdateProgress.mockResolvedValue(undefined)
  })

  it('completes full grammar quiz flow: topic → quiz → answer → explanation → next', async () => {
    mockChat
      .mockResolvedValueOnce(quizResponse)
      .mockResolvedValueOnce(explanationResponse)

    renderApp('/grammar')

    expect(await screen.findByText('Pilih Topik Grammar')).toBeInTheDocument()

    // Select topic
    fireEvent.click(screen.getByLabelText('Pilih topik Tenses'))

    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledWith({ action: 'grammar_quiz', grammarTopic: 'tenses' })
    })

    // Quiz question should appear with 4 options
    expect(await screen.findByTestId('quiz-question')).toHaveTextContent(
      'Choose the correct form: She ___ to school every day.',
    )
    expect(screen.getByTestId('option-0')).toBeInTheDocument()
    expect(screen.getByTestId('option-1')).toBeInTheDocument()
    expect(screen.getByTestId('option-2')).toBeInTheDocument()
    expect(screen.getByTestId('option-3')).toBeInTheDocument()

    // Select correct answer
    fireEvent.click(screen.getByTestId('option-1')) // 'goes'

    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledWith(expect.objectContaining({
        action: 'grammar_explain',
        grammarTopic: 'tenses',
        selectedAnswer: 'goes',
      }))
    })

    // Explanation should appear
    expect(await screen.findByTestId('result-correct')).toHaveTextContent('Jawaban Anda Benar!')
    expect(screen.getByTestId('explanation-text')).toHaveTextContent(/third person singular/)

    // Progress should be updated
    await waitFor(() => {
      expect(mockUpdateProgress).toHaveBeenCalledWith({
        moduleType: 'grammar',
        score: 100,
        sessionId: 'q-g1',
      })
    })

    expect(screen.getByTestId('next-question-btn')).toBeInTheDocument()
  })

  it('shows incorrect result and explanation for wrong answer', async () => {
    mockChat
      .mockResolvedValueOnce(quizResponse)
      .mockResolvedValueOnce(explanationResponse)

    renderApp('/grammar')
    await screen.findByText('Pilih Topik Grammar')
    fireEvent.click(screen.getByLabelText('Pilih topik Tenses'))
    await screen.findByTestId('quiz-question')

    // Select wrong answer
    fireEvent.click(screen.getByTestId('option-0')) // 'go' is wrong

    expect(await screen.findByTestId('result-incorrect')).toHaveTextContent('Jawaban Anda Salah')

    // Correct answer highlighted green, wrong red
    expect(screen.getByTestId('option-1').className).toContain('green')
    expect(screen.getByTestId('option-0').className).toContain('red')

    // All options disabled
    expect(screen.getByTestId('option-0')).toBeDisabled()
    expect(screen.getByTestId('option-1')).toBeDisabled()

    // Progress updated with score 0
    await waitFor(() => {
      expect(mockUpdateProgress).toHaveBeenCalledWith({
        moduleType: 'grammar',
        score: 0,
        sessionId: 'q-g1',
      })
    })
  })

  it('loads next question after clicking next button', async () => {
    const secondQuiz = {
      sessionId: 'sess-g1',
      type: 'quiz' as const,
      content: '',
      quizData: {
        questionId: 'q-g2',
        question: 'Select the correct article: ___ apple a day.',
        options: ['A', 'An', 'The', 'No article'],
        correctAnswer: 'An',
      },
    }

    mockChat
      .mockResolvedValueOnce(quizResponse)
      .mockResolvedValueOnce(explanationResponse)
      .mockResolvedValueOnce(secondQuiz)

    renderApp('/grammar')
    await screen.findByText('Pilih Topik Grammar')
    fireEvent.click(screen.getByLabelText('Pilih topik Tenses'))
    await screen.findByTestId('quiz-question')

    fireEvent.click(screen.getByTestId('option-1')) // correct
    await screen.findByTestId('next-question-btn')

    fireEvent.click(screen.getByTestId('next-question-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('quiz-question')).toHaveTextContent('Select the correct article')
    })
  })
})


// ── 4. Writing Flow ────────────────────────────────────────────────────────

describe('Integration: Writing flow (select type → write → submit → view review)', () => {
  const promptResponse = {
    sessionId: 'sess-w1',
    type: 'writing_prompt' as const,
    content: 'Write an essay about the importance of teamwork in the workplace.',
  }

  const reviewResponse = {
    sessionId: 'sess-w1',
    type: 'writing_review' as const,
    content: '',
    writingReview: {
      overallScore: 75,
      aspects: {
        grammarCorrectness: {
          score: 70,
          errors: [{ text: 'importent', correction: 'important', explanation: 'Spelling error' }],
        },
        structure: {
          score: 80,
          feedback: 'Good paragraph structure with clear introduction and conclusion.',
        },
        vocabulary: {
          score: 75,
          suggestions: ['Use "collaborate" instead of "work together"'],
        },
      },
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentAuthUser.mockResolvedValue({ userId: 'u1', email: 'user@example.com' })
    mockGetProgress.mockResolvedValue(defaultProgress)
    mockUpdateProgress.mockResolvedValue(undefined)
  })

  it('completes full writing flow: select essay → write → submit → view review', async () => {
    mockChat
      .mockResolvedValueOnce(promptResponse)
      .mockResolvedValueOnce(reviewResponse)

    renderApp('/writing')

    expect(await screen.findByText('Pilih Tipe Tulisan')).toBeInTheDocument()

    // Select essay type
    fireEvent.click(screen.getByTestId('writing-type-essay'))

    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledWith({ action: 'writing_prompt', writingType: 'essay' })
    })

    // Writing editor should appear with prompt
    expect(await screen.findByTestId('writing-textarea')).toBeInTheDocument()
    expect(screen.getByText('Prompt')).toBeInTheDocument()

    // Submit button should be disabled initially (< 50 chars)
    expect(screen.getByTestId('submit-writing')).toBeDisabled()

    // Type enough content
    const content = 'Teamwork is essential in the modern workplace. It enables collaboration and innovation across teams effectively.'
    fireEvent.change(screen.getByTestId('writing-textarea'), { target: { value: content } })

    // Submit button should now be enabled
    expect(screen.getByTestId('submit-writing')).not.toBeDisabled()

    // Submit writing
    fireEvent.click(screen.getByTestId('submit-writing'))

    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledWith({
        action: 'writing_review',
        sessionId: 'sess-w1',
        writingType: 'essay',
        writingContent: content,
      })
    })

    // Review should appear
    expect(await screen.findByTestId('writing-review')).toBeInTheDocument()
    expect(screen.getByTestId('overall-score')).toHaveTextContent('75')
    expect(screen.getByTestId('grammar-section')).toBeInTheDocument()
    expect(screen.getByTestId('structure-section')).toBeInTheDocument()
    expect(screen.getByTestId('vocabulary-section')).toBeInTheDocument()

    // Grammar errors displayed
    expect(screen.getByText('importent')).toBeInTheDocument()
    expect(screen.getByText('important')).toBeInTheDocument()

    // Structure feedback
    expect(screen.getByText(/Good paragraph structure/)).toBeInTheDocument()

    // Vocabulary suggestions
    expect(screen.getByText(/collaborate/)).toBeInTheDocument()

    // Progress updated
    await waitFor(() => {
      expect(mockUpdateProgress).toHaveBeenCalledWith({
        moduleType: 'writing',
        score: 75,
        sessionId: 'sess-w1',
      })
    })

    // Action buttons available
    expect(screen.getByTestId('write-again')).toBeInTheDocument()
    expect(screen.getByTestId('change-type')).toBeInTheDocument()
  })

  it('can select email type and shows editor', async () => {
    const emailPrompt = {
      sessionId: 'sess-w2',
      type: 'writing_prompt' as const,
      content: 'Write a professional email to your manager requesting time off.',
    }
    mockChat.mockResolvedValueOnce(emailPrompt)

    renderApp('/writing')
    await screen.findByText('Pilih Tipe Tulisan')

    fireEvent.click(screen.getByTestId('writing-type-email'))

    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledWith({ action: 'writing_prompt', writingType: 'email' })
    })

    expect(await screen.findByTestId('writing-textarea')).toBeInTheDocument()
    expect(screen.getByTestId('current-type')).toHaveTextContent('Tipe: Email')
  })

  it('returns to type selection when "Ganti Tipe" is clicked after review', async () => {
    mockChat
      .mockResolvedValueOnce(promptResponse)
      .mockResolvedValueOnce(reviewResponse)

    renderApp('/writing')
    await screen.findByText('Pilih Tipe Tulisan')
    fireEvent.click(screen.getByTestId('writing-type-essay'))
    await screen.findByTestId('writing-textarea')

    fireEvent.change(screen.getByTestId('writing-textarea'), { target: { value: 'A'.repeat(60) } })
    fireEvent.click(screen.getByTestId('submit-writing'))

    await screen.findByTestId('writing-review')
    fireEvent.click(screen.getByTestId('change-type'))

    expect(screen.getByText('Pilih Tipe Tulisan')).toBeInTheDocument()
  })
})
