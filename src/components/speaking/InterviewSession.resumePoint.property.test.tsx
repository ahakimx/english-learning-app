/**
 * Property 5: Resume point is correctly determined from session state
 *
 * Feature: speaking-session-resume, Property 5: Resume point is correctly determined from session state
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 *
 * For any restored session with a non-empty questions array:
 * - If the last question has no transcription → resume at that question (no additional API call)
 * - If the last question has transcription but no feedback → call analyze_answer
 * - If all questions have transcription + feedback → call next_question
 */
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import SpeakingModule from './SpeakingModule'
import { AuthProvider } from '../../hooks/useAuth'
import type { SessionData, SessionQuestion, FeedbackReport, SeniorityLevel, QuestionCategory } from '../../types'

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

// --- Generators ---

const seniorityArb: fc.Arbitrary<SeniorityLevel> = fc.constantFrom('junior', 'mid', 'senior', 'lead')
const categoryArb: fc.Arbitrary<QuestionCategory> = fc.constantFrom('general', 'technical')

const feedbackArb: fc.Arbitrary<FeedbackReport> = fc.record({
  scores: fc.record({
    grammar: fc.integer({ min: 0, max: 100 }),
    vocabulary: fc.integer({ min: 0, max: 100 }),
    relevance: fc.integer({ min: 0, max: 100 }),
    fillerWords: fc.integer({ min: 0, max: 100 }),
    coherence: fc.integer({ min: 0, max: 100 }),
    overall: fc.integer({ min: 0, max: 100 }),
  }),
  grammarErrors: fc.constant([]),
  fillerWordsDetected: fc.constant([]),
  suggestions: fc.constant([]),
  improvedAnswer: fc.constant(''),
})

/** Generate a clean question text string */
const questionTextArb = fc.array(
  fc.constantFrom('What', 'How', 'Tell', 'Describe', 'Why', 'Can', 'Do', 'Have', 'Are', 'Is', 'your', 'you', 'me', 'about', 'experience', 'skills', 'work', 'team', 'project', 'role'),
  { minLength: 3, maxLength: 8 },
).map(words => words.join(' ') + '?')

/** Generate a clean transcription string */
const transcriptionArb = fc.array(
  fc.constantFrom('I', 'have', 'worked', 'with', 'many', 'teams', 'on', 'projects', 'using', 'various', 'tools', 'and', 'technologies'),
  { minLength: 2, maxLength: 6 },
).map(words => words.join(' '))

/** A fully answered question (has transcription + feedback) */
const answeredQuestionArb: fc.Arbitrary<SessionQuestion> = fc.record({
  questionId: fc.uuid(),
  questionText: questionTextArb,
  questionType: fc.constantFrom('introduction' as const, 'contextual' as const),
  transcription: transcriptionArb,
  feedback: feedbackArb,
})

/** Build session data with a specific last-question state */
function buildSessionArb(
  lastQuestion: fc.Arbitrary<SessionQuestion>,
  minPreceding = 0,
): fc.Arbitrary<SessionData> {
  return fc.record({
    sessionId: fc.uuid(),
    jobPosition: fc.constantFrom('Software Engineer', 'Product Manager', 'Data Analyst'),
    seniorityLevel: seniorityArb,
    questionCategory: categoryArb,
    precedingQuestions: fc.array(answeredQuestionArb, { minLength: minPreceding, maxLength: 2 }),
    lastQ: lastQuestion,
    createdAt: fc.constant(new Date(Date.now() - 7200000).toISOString()),
    updatedAt: fc.constant(new Date(Date.now() - 1800000).toISOString()),
  }).map(({ precedingQuestions, lastQ, ...rest }) => ({
    ...rest,
    questions: [...precedingQuestions, lastQ],
  }))
}

// Case a: last question has no transcription
const unansweredLastArb = buildSessionArb(
  fc.record({
    questionId: fc.uuid(),
    questionText: questionTextArb,
    questionType: fc.constantFrom('introduction' as const, 'contextual' as const),
  }),
)

// Case b: last question has transcription but no feedback
const unanalyzedLastArb = buildSessionArb(
  fc.record({
    questionId: fc.uuid(),
    questionText: questionTextArb,
    questionType: fc.constantFrom('introduction' as const, 'contextual' as const),
    transcription: transcriptionArb,
  }),
)

// Case c: all questions have transcription + feedback (last is also fully answered)
const allCompleteArb = buildSessionArb(answeredQuestionArb, 0)

// Combined: one of the three cases, tagged
const sessionVariationArb = fc.oneof(
  unansweredLastArb.map(s => ({ tag: 'unanswered' as const, session: s })),
  unanalyzedLastArb.map(s => ({ tag: 'unanalyzed' as const, session: s })),
  allCompleteArb.map(s => ({ tag: 'all_complete' as const, session: s })),
)

describe('Property 5: Resume point is correctly determined from session state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('determines the correct resume action for all session state variations', async () => {
    await fc.assert(
      fc.asyncProperty(sessionVariationArb, async ({ tag, session }) => {
        vi.clearAllMocks()
        cleanup()

        // Mock resume_session to return the generated session
        mockChat.mockImplementation((req: { action: string }) => {
          if (req.action === 'resume_session') {
            return Promise.resolve({
              type: 'session_resumed',
              content: '',
              sessionId: session.sessionId,
              sessionData: session,
            })
          }
          if (req.action === 'analyze_answer') {
            return Promise.resolve({
              type: 'feedback',
              content: '',
              sessionId: session.sessionId,
              feedbackReport: {
                scores: { grammar: 80, vocabulary: 80, relevance: 80, fillerWords: 80, coherence: 80, overall: 80 },
                grammarErrors: [],
                fillerWordsDetected: [],
                suggestions: [],
                improvedAnswer: '',
              },
            })
          }
          if (req.action === 'next_question') {
            return Promise.resolve({
              type: 'question',
              content: 'Next generated question?',
              sessionId: session.sessionId,
              questionType: 'contextual',
            })
          }
          return Promise.resolve({ type: 'question', content: '', sessionId: '' })
        })

        const { unmount } = renderSpeakingModule()

        try {
          // Wait for ResumePrompt to appear
          await waitFor(() => {
            expect(screen.getByTestId('resume-prompt')).toBeInTheDocument()
          })

          // Click "Lanjutkan Sesi"
          fireEvent.click(screen.getByTestId('resume-button'))

          const lastQuestion = session.questions[session.questions.length - 1]

          if (tag === 'unanswered') {
            // Case a: should resume at that question, no additional chat call beyond resume_session
            await waitFor(() => {
              expect(screen.getByTestId('interview-question')).toHaveTextContent(lastQuestion.questionText)
            })
            // Only resume_session was called, no analyze_answer or next_question
            const nonResumeCalls = mockChat.mock.calls.filter(
              (c: Array<Record<string, unknown>>) => (c[0] as Record<string, unknown>).action !== 'resume_session',
            )
            expect(nonResumeCalls.length).toBe(0)
          } else if (tag === 'unanalyzed') {
            // Case b: should call analyze_answer
            await waitFor(() => {
              expect(mockChat).toHaveBeenCalledWith(
                expect.objectContaining({ action: 'analyze_answer' }),
              )
            })
            await waitFor(() => {
              expect(screen.getByTestId('interview-question')).toBeInTheDocument()
            })
          } else {
            // Case c: should call next_question
            await waitFor(() => {
              expect(mockChat).toHaveBeenCalledWith(
                expect.objectContaining({ action: 'next_question' }),
              )
            })
            await waitFor(() => {
              expect(screen.getByTestId('interview-question')).toHaveTextContent('Next generated question?')
            })
          }
        } finally {
          unmount()
        }
      }),
      { numRuns: 100 },
    )
  }, 120_000)
})
