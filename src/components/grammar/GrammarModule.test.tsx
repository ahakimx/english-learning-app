import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import GrammarModule from './GrammarModule'
import { AuthProvider } from '../../hooks/useAuth'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockChat = vi.fn()
const mockUpdateProgress = vi.fn()
vi.mock('../../services/apiClient', () => ({
  chat: (...args: unknown[]) => mockChat(...args),
  updateProgress: (...args: unknown[]) => mockUpdateProgress(...args),
  getProgress: vi.fn(() => Promise.resolve({})),
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

function renderGrammarModule() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <GrammarModule />
      </AuthProvider>
    </MemoryRouter>,
  )
}

const sampleQuizResponse = {
  sessionId: 'sess-1',
  type: 'quiz' as const,
  content: '',
  quizData: {
    questionId: 'q-1',
    question: 'Choose the correct form: She ___ to school every day.',
    options: ['go', 'goes', 'going', 'gone'],
    correctAnswer: 'goes',
  },
}

const sampleExplanationResponse = {
  sessionId: 'sess-1',
  type: 'explanation' as const,
  content: 'The correct answer is "goes" because with third person singular subjects (she, he, it), we add -s or -es to the base verb in simple present tense.',
}

describe('GrammarModule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateProgress.mockResolvedValue(undefined)
  })

  it('renders heading and back button', () => {
    renderGrammarModule()
    expect(screen.getByText('Grammar Module')).toBeInTheDocument()
    expect(screen.getByText('Kembali ke Dashboard')).toBeInTheDocument()
  })

  it('renders all 5 grammar topics', () => {
    renderGrammarModule()
    expect(screen.getByText('Pilih Topik Grammar')).toBeInTheDocument()
    expect(screen.getByLabelText('Pilih topik Tenses')).toBeInTheDocument()
    expect(screen.getByLabelText('Pilih topik Articles')).toBeInTheDocument()
    expect(screen.getByLabelText('Pilih topik Prepositions')).toBeInTheDocument()
    expect(screen.getByLabelText('Pilih topik Conditionals')).toBeInTheDocument()
    expect(screen.getByLabelText('Pilih topik Passive Voice')).toBeInTheDocument()
  })

  it('navigates to dashboard when back button is clicked', () => {
    renderGrammarModule()
    fireEvent.click(screen.getByText('Kembali ke Dashboard'))
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('shows loading state when topic is selected', async () => {
    mockChat.mockReturnValue(new Promise(() => {}))
    renderGrammarModule()
    fireEvent.click(screen.getByLabelText('Pilih topik Tenses'))
    expect(await screen.findByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Memuat soal quiz...')).toBeInTheDocument()
  })

  it('calls chat API with grammar_quiz when topic is selected', async () => {
    mockChat.mockResolvedValue(sampleQuizResponse)
    renderGrammarModule()
    fireEvent.click(screen.getByLabelText('Pilih topik Tenses'))
    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledWith({
        action: 'grammar_quiz',
        grammarTopic: 'tenses',
      })
    })
  })

  it('displays quiz question after API response', async () => {
    mockChat.mockResolvedValue(sampleQuizResponse)
    renderGrammarModule()
    fireEvent.click(screen.getByLabelText('Pilih topik Tenses'))
    expect(await screen.findByTestId('quiz-question')).toHaveTextContent(
      'Choose the correct form: She ___ to school every day.',
    )
    expect(screen.getByTestId('option-0')).toBeInTheDocument()
    expect(screen.getByTestId('option-1')).toBeInTheDocument()
    expect(screen.getByTestId('option-2')).toBeInTheDocument()
    expect(screen.getByTestId('option-3')).toBeInTheDocument()
  })

  it('shows error when quiz API fails', async () => {
    mockChat.mockRejectedValue(new Error('Network error'))
    renderGrammarModule()
    fireEvent.click(screen.getByLabelText('Pilih topik Tenses'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Gagal memuat soal quiz. Silakan coba lagi.',
    )
    // Should return to topic selection
    expect(screen.getByText('Pilih Topik Grammar')).toBeInTheDocument()
  })

  it('highlights correct answer in green and wrong answer in red after selection', async () => {
    mockChat
      .mockResolvedValueOnce(sampleQuizResponse)
      .mockResolvedValueOnce(sampleExplanationResponse)
    renderGrammarModule()
    fireEvent.click(screen.getByLabelText('Pilih topik Tenses'))
    await screen.findByTestId('quiz-question')

    // Select wrong answer
    fireEvent.click(screen.getByTestId('option-0')) // 'go' is wrong

    // Correct answer (option-1 = 'goes') should have green styling
    const correctOption = screen.getByTestId('option-1')
    expect(correctOption.className).toContain('green')

    // Wrong answer (option-0 = 'go') should have red styling
    const wrongOption = screen.getByTestId('option-0')
    expect(wrongOption.className).toContain('red')
  })

  it('disables all options after answer is selected', async () => {
    mockChat
      .mockResolvedValueOnce(sampleQuizResponse)
      .mockResolvedValueOnce(sampleExplanationResponse)
    renderGrammarModule()
    fireEvent.click(screen.getByLabelText('Pilih topik Tenses'))
    await screen.findByTestId('quiz-question')

    fireEvent.click(screen.getByTestId('option-0'))

    expect(screen.getByTestId('option-0')).toBeDisabled()
    expect(screen.getByTestId('option-1')).toBeDisabled()
    expect(screen.getByTestId('option-2')).toBeDisabled()
    expect(screen.getByTestId('option-3')).toBeDisabled()
  })

  it('calls grammar_explain API after answer selection', async () => {
    mockChat
      .mockResolvedValueOnce(sampleQuizResponse)
      .mockResolvedValueOnce(sampleExplanationResponse)
    renderGrammarModule()
    fireEvent.click(screen.getByLabelText('Pilih topik Tenses'))
    await screen.findByTestId('quiz-question')

    fireEvent.click(screen.getByTestId('option-1')) // 'goes' - correct

    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledWith({
        action: 'grammar_explain',
        grammarTopic: 'tenses',
        selectedAnswer: 'goes',
      })
    })
  })

  it('displays explanation after answer', async () => {
    mockChat
      .mockResolvedValueOnce(sampleQuizResponse)
      .mockResolvedValueOnce(sampleExplanationResponse)
    renderGrammarModule()
    fireEvent.click(screen.getByLabelText('Pilih topik Tenses'))
    await screen.findByTestId('quiz-question')

    fireEvent.click(screen.getByTestId('option-1')) // correct answer

    expect(await screen.findByTestId('result-correct')).toHaveTextContent('Jawaban Anda Benar!')
    expect(screen.getByTestId('explanation-text')).toHaveTextContent(
      /third person singular/,
    )
    expect(screen.getByTestId('next-question-btn')).toBeInTheDocument()
  })

  it('shows incorrect result when wrong answer is selected', async () => {
    mockChat
      .mockResolvedValueOnce(sampleQuizResponse)
      .mockResolvedValueOnce(sampleExplanationResponse)
    renderGrammarModule()
    fireEvent.click(screen.getByLabelText('Pilih topik Tenses'))
    await screen.findByTestId('quiz-question')

    fireEvent.click(screen.getByTestId('option-0')) // 'go' - wrong

    expect(await screen.findByTestId('result-incorrect')).toHaveTextContent('Jawaban Anda Salah')
    expect(screen.getByTestId('user-answer-info')).toBeInTheDocument()
  })

  it('updates progress after each answer', async () => {
    mockChat
      .mockResolvedValueOnce(sampleQuizResponse)
      .mockResolvedValueOnce(sampleExplanationResponse)
    renderGrammarModule()
    fireEvent.click(screen.getByLabelText('Pilih topik Tenses'))
    await screen.findByTestId('quiz-question')

    fireEvent.click(screen.getByTestId('option-1')) // correct

    await waitFor(() => {
      expect(mockUpdateProgress).toHaveBeenCalledWith({
        moduleType: 'grammar',
        score: 100,
        sessionId: 'q-1',
      })
    })
  })

  it('updates progress with score 0 for wrong answer', async () => {
    mockChat
      .mockResolvedValueOnce(sampleQuizResponse)
      .mockResolvedValueOnce(sampleExplanationResponse)
    renderGrammarModule()
    fireEvent.click(screen.getByLabelText('Pilih topik Tenses'))
    await screen.findByTestId('quiz-question')

    fireEvent.click(screen.getByTestId('option-0')) // wrong

    await waitFor(() => {
      expect(mockUpdateProgress).toHaveBeenCalledWith({
        moduleType: 'grammar',
        score: 0,
        sessionId: 'q-1',
      })
    })
  })

  it('loads next question when "Pertanyaan Berikutnya" is clicked', async () => {
    const secondQuiz = {
      ...sampleQuizResponse,
      quizData: {
        questionId: 'q-2',
        question: 'Select the correct article: ___ apple a day keeps the doctor away.',
        options: ['A', 'An', 'The', 'No article'],
        correctAnswer: 'An',
      },
    }

    mockChat
      .mockResolvedValueOnce(sampleQuizResponse)
      .mockResolvedValueOnce(sampleExplanationResponse)
      .mockResolvedValueOnce(secondQuiz)
    renderGrammarModule()
    fireEvent.click(screen.getByLabelText('Pilih topik Tenses'))
    await screen.findByTestId('quiz-question')

    fireEvent.click(screen.getByTestId('option-1'))
    await screen.findByTestId('next-question-btn')

    fireEvent.click(screen.getByTestId('next-question-btn'))

    expect(await screen.findByTestId('quiz-question')).toHaveTextContent(
      'Select the correct article',
    )
  })

  it('displays score counter in header during quiz', async () => {
    mockChat
      .mockResolvedValueOnce(sampleQuizResponse)
      .mockResolvedValueOnce(sampleExplanationResponse)
    renderGrammarModule()
    fireEvent.click(screen.getByLabelText('Pilih topik Tenses'))
    await screen.findByTestId('quiz-question')

    fireEvent.click(screen.getByTestId('option-1')) // correct
    await screen.findByTestId('explanation-text')

    expect(screen.getByTestId('score-display')).toHaveTextContent('Skor: 1/1')
  })

  it('shows topic name in header during quiz', async () => {
    mockChat.mockResolvedValue(sampleQuizResponse)
    renderGrammarModule()
    fireEvent.click(screen.getByLabelText('Pilih topik Tenses'))
    await screen.findByTestId('quiz-question')

    expect(screen.getByTestId('current-topic')).toHaveTextContent('Topik: tenses')
  })
})
