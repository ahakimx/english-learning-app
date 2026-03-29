import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import WritingModule from './WritingModule'
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

function renderWritingModule() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <WritingModule />
      </AuthProvider>
    </MemoryRouter>,
  )
}

const samplePromptResponse = {
  sessionId: 'sess-w1',
  type: 'writing_prompt' as const,
  content: 'Write an essay about the importance of teamwork in the workplace.',
}

const sampleReviewResponse = {
  sessionId: 'sess-w1',
  type: 'writing_review' as const,
  content: '',
  writingReview: {
    overallScore: 75,
    aspects: {
      grammarCorrectness: {
        score: 70,
        errors: [
          { text: 'importent', correction: 'important', explanation: 'Spelling error' },
        ],
      },
      structure: {
        score: 80,
        feedback: 'Good paragraph structure with clear introduction and conclusion.',
      },
      vocabulary: {
        score: 75,
        suggestions: ['Use "collaborate" instead of "work together"', 'Consider using "essential" as a synonym for "important"'],
      },
    },
  },
}

describe('WritingModule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateProgress.mockResolvedValue(undefined)
  })

  it('renders TopAppBar with brand and Writing tab active', () => {
    renderWritingModule()
    expect(screen.getByText('InterviewPrep Pro')).toBeInTheDocument()
    // Writing tab should be active (has border styling)
    const writingTab = screen.getByRole('button', { name: 'Writing' })
    expect(writingTab).toBeInTheDocument()
  })

  it('renders Stitch landing page with hero and assignments', () => {
    renderWritingModule()
    expect(screen.getByText('Master the Written Pitch')).toBeInTheDocument()
    expect(screen.getByText('Active Assignments')).toBeInTheDocument()
    expect(screen.getByText('Writing Proficiency')).toBeInTheDocument()
  })

  it('navigates to dashboard when Overview tab is clicked', () => {
    renderWritingModule()
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }))
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('shows loading state when assignment card is clicked (essay)', async () => {
    mockChat.mockReturnValue(new Promise(() => {}))
    renderWritingModule()
    fireEvent.click(screen.getByText('Draft your elevator pitch').closest('button')!)
    expect(await screen.findByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Memuat prompt tulisan...')).toBeInTheDocument()
  })

  it('calls chat API with writing_prompt when essay assignment is clicked', async () => {
    mockChat.mockResolvedValue(samplePromptResponse)
    renderWritingModule()
    fireEvent.click(screen.getByText('Draft your elevator pitch').closest('button')!)
    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledWith({
        action: 'writing_prompt',
        writingType: 'essay',
      })
    })
  })

  it('calls chat API with writing_prompt when email assignment is clicked', async () => {
    mockChat.mockResolvedValue(samplePromptResponse)
    renderWritingModule()
    fireEvent.click(screen.getByText('Write a follow-up email').closest('button')!)
    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledWith({
        action: 'writing_prompt',
        writingType: 'email',
      })
    })
  })

  it('displays writing editor with prompt after API response', async () => {
    mockChat.mockResolvedValue(samplePromptResponse)
    renderWritingModule()
    fireEvent.click(screen.getByText('Draft your elevator pitch').closest('button')!)
    expect(await screen.findByText(samplePromptResponse.content)).toBeInTheDocument()
    expect(screen.getByTestId('writing-textarea')).toBeInTheDocument()
    expect(screen.getByTestId('submit-writing')).toBeInTheDocument()
  })

  it('shows error when prompt API fails', async () => {
    mockChat.mockRejectedValue(new Error('Network error'))
    renderWritingModule()
    fireEvent.click(screen.getByText('Draft your elevator pitch').closest('button')!)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Gagal memuat prompt tulisan. Silakan coba lagi.',
    )
    // Should return to landing page
    expect(screen.getByText('Master the Written Pitch')).toBeInTheDocument()
  })

  it('disables submit button when text is less than 50 characters', async () => {
    mockChat.mockResolvedValue(samplePromptResponse)
    renderWritingModule()
    fireEvent.click(screen.getByText('Draft your elevator pitch').closest('button')!)
    await screen.findByTestId('writing-textarea')

    fireEvent.change(screen.getByTestId('writing-textarea'), { target: { value: 'Short text' } })
    expect(screen.getByTestId('submit-writing')).toBeDisabled()
  })

  it('enables submit button when text reaches 50 characters', async () => {
    mockChat.mockResolvedValue(samplePromptResponse)
    renderWritingModule()
    fireEvent.click(screen.getByText('Draft your elevator pitch').closest('button')!)
    await screen.findByTestId('writing-textarea')

    const longText = 'A'.repeat(50)
    fireEvent.change(screen.getByTestId('writing-textarea'), { target: { value: longText } })
    expect(screen.getByTestId('submit-writing')).not.toBeDisabled()
  })

  it('shows character count', async () => {
    mockChat.mockResolvedValue(samplePromptResponse)
    renderWritingModule()
    fireEvent.click(screen.getByText('Draft your elevator pitch').closest('button')!)
    await screen.findByTestId('writing-textarea')

    fireEvent.change(screen.getByTestId('writing-textarea'), { target: { value: 'Hello world' } })
    expect(screen.getByTestId('char-count')).toHaveTextContent('11 karakter')
  })

  it('calls chat API with writing_review when writing is submitted', async () => {
    mockChat
      .mockResolvedValueOnce(samplePromptResponse)
      .mockResolvedValueOnce(sampleReviewResponse)
    renderWritingModule()
    fireEvent.click(screen.getByText('Draft your elevator pitch').closest('button')!)
    await screen.findByTestId('writing-textarea')

    const content = 'A'.repeat(60)
    fireEvent.change(screen.getByTestId('writing-textarea'), { target: { value: content } })
    fireEvent.click(screen.getByTestId('submit-writing'))

    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledWith({
        action: 'writing_review',
        sessionId: 'sess-w1',
        writingType: 'essay',
        writingContent: content,
      })
    })
  })

  it('shows submitting loading state after submit', async () => {
    mockChat
      .mockResolvedValueOnce(samplePromptResponse)
      .mockReturnValueOnce(new Promise(() => {}))
    renderWritingModule()
    fireEvent.click(screen.getByText('Draft your elevator pitch').closest('button')!)
    await screen.findByTestId('writing-textarea')

    fireEvent.change(screen.getByTestId('writing-textarea'), { target: { value: 'A'.repeat(60) } })
    fireEvent.click(screen.getByTestId('submit-writing'))

    expect(await screen.findByText('Menganalisis tulisan Anda...')).toBeInTheDocument()
  })

  it('displays review after successful submission', async () => {
    mockChat
      .mockResolvedValueOnce(samplePromptResponse)
      .mockResolvedValueOnce(sampleReviewResponse)
    renderWritingModule()
    fireEvent.click(screen.getByText('Draft your elevator pitch').closest('button')!)
    await screen.findByTestId('writing-textarea')

    fireEvent.change(screen.getByTestId('writing-textarea'), { target: { value: 'A'.repeat(60) } })
    fireEvent.click(screen.getByTestId('submit-writing'))

    expect(await screen.findByTestId('writing-review')).toBeInTheDocument()
    expect(screen.getByTestId('overall-score')).toHaveTextContent('75')
    expect(screen.getByTestId('grammar-section')).toBeInTheDocument()
    expect(screen.getByTestId('structure-section')).toBeInTheDocument()
    expect(screen.getByTestId('vocabulary-section')).toBeInTheDocument()
  })

  it('displays grammar errors in review', async () => {
    mockChat
      .mockResolvedValueOnce(samplePromptResponse)
      .mockResolvedValueOnce(sampleReviewResponse)
    renderWritingModule()
    fireEvent.click(screen.getByText('Draft your elevator pitch').closest('button')!)
    await screen.findByTestId('writing-textarea')

    fireEvent.change(screen.getByTestId('writing-textarea'), { target: { value: 'A'.repeat(60) } })
    fireEvent.click(screen.getByTestId('submit-writing'))

    await screen.findByTestId('writing-review')
    expect(screen.getByText('importent')).toBeInTheDocument()
    expect(screen.getByText('important')).toBeInTheDocument()
    expect(screen.getByText('Spelling error')).toBeInTheDocument()
  })

  it('displays structure feedback in review', async () => {
    mockChat
      .mockResolvedValueOnce(samplePromptResponse)
      .mockResolvedValueOnce(sampleReviewResponse)
    renderWritingModule()
    fireEvent.click(screen.getByText('Draft your elevator pitch').closest('button')!)
    await screen.findByTestId('writing-textarea')

    fireEvent.change(screen.getByTestId('writing-textarea'), { target: { value: 'A'.repeat(60) } })
    fireEvent.click(screen.getByTestId('submit-writing'))

    await screen.findByTestId('writing-review')
    expect(screen.getByText(/Good paragraph structure/)).toBeInTheDocument()
  })

  it('displays vocabulary suggestions in review', async () => {
    mockChat
      .mockResolvedValueOnce(samplePromptResponse)
      .mockResolvedValueOnce(sampleReviewResponse)
    renderWritingModule()
    fireEvent.click(screen.getByText('Draft your elevator pitch').closest('button')!)
    await screen.findByTestId('writing-textarea')

    fireEvent.change(screen.getByTestId('writing-textarea'), { target: { value: 'A'.repeat(60) } })
    fireEvent.click(screen.getByTestId('submit-writing'))

    await screen.findByTestId('writing-review')
    expect(screen.getByText(/collaborate/)).toBeInTheDocument()
    expect(screen.getByText(/essential/)).toBeInTheDocument()
  })

  it('updates progress after review is displayed', async () => {
    mockChat
      .mockResolvedValueOnce(samplePromptResponse)
      .mockResolvedValueOnce(sampleReviewResponse)
    renderWritingModule()
    fireEvent.click(screen.getByText('Draft your elevator pitch').closest('button')!)
    await screen.findByTestId('writing-textarea')

    fireEvent.change(screen.getByTestId('writing-textarea'), { target: { value: 'A'.repeat(60) } })
    fireEvent.click(screen.getByTestId('submit-writing'))

    await screen.findByTestId('writing-review')
    await waitFor(() => {
      expect(mockUpdateProgress).toHaveBeenCalledWith({
        moduleType: 'writing',
        score: 75,
        sessionId: 'sess-w1',
      })
    })
  })

  it('shows "Tulis Lagi" and "Ganti Tipe" buttons after review', async () => {
    mockChat
      .mockResolvedValueOnce(samplePromptResponse)
      .mockResolvedValueOnce(sampleReviewResponse)
    renderWritingModule()
    fireEvent.click(screen.getByText('Draft your elevator pitch').closest('button')!)
    await screen.findByTestId('writing-textarea')

    fireEvent.change(screen.getByTestId('writing-textarea'), { target: { value: 'A'.repeat(60) } })
    fireEvent.click(screen.getByTestId('submit-writing'))

    await screen.findByTestId('writing-review')
    expect(screen.getByTestId('write-again')).toHaveTextContent('Tulis Lagi')
    expect(screen.getByTestId('change-type')).toHaveTextContent('Ganti Tipe')
  })

  it('returns to landing page when "Ganti Tipe" is clicked', async () => {
    mockChat
      .mockResolvedValueOnce(samplePromptResponse)
      .mockResolvedValueOnce(sampleReviewResponse)
    renderWritingModule()
    fireEvent.click(screen.getByText('Draft your elevator pitch').closest('button')!)
    await screen.findByTestId('writing-textarea')

    fireEvent.change(screen.getByTestId('writing-textarea'), { target: { value: 'A'.repeat(60) } })
    fireEvent.click(screen.getByTestId('submit-writing'))

    await screen.findByTestId('writing-review')
    fireEvent.click(screen.getByTestId('change-type'))

    expect(screen.getByText('Master the Written Pitch')).toBeInTheDocument()
  })

  it('shows current type during writing phase', async () => {
    mockChat.mockResolvedValue(samplePromptResponse)
    renderWritingModule()
    fireEvent.click(screen.getByText('Draft your elevator pitch').closest('button')!)
    await screen.findByTestId('writing-textarea')

    expect(screen.getByTestId('current-type')).toHaveTextContent('Tipe: Essay')
  })

  it('shows error when review API fails', async () => {
    mockChat
      .mockResolvedValueOnce(samplePromptResponse)
      .mockRejectedValueOnce(new Error('Network error'))
    renderWritingModule()
    fireEvent.click(screen.getByText('Draft your elevator pitch').closest('button')!)
    await screen.findByTestId('writing-textarea')

    fireEvent.change(screen.getByTestId('writing-textarea'), { target: { value: 'A'.repeat(60) } })
    fireEvent.click(screen.getByTestId('submit-writing'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Gagal mengirim tulisan untuk review. Silakan coba lagi.',
    )
    // Should return to writing phase so user can retry
    expect(screen.getByTestId('writing-textarea')).toBeInTheDocument()
  })

  it('triggers email type when focus track "High-Stakes Emails" is clicked', async () => {
    mockChat.mockReturnValue(new Promise(() => {}))
    renderWritingModule()
    fireEvent.click(screen.getByText('High-Stakes Emails').closest('button')!)
    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledWith({
        action: 'writing_prompt',
        writingType: 'email',
      })
    })
  })
})
