import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import InterviewSession from './InterviewSession';

// Mock useAuth
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { userId: 'u1', email: 'user@test.com' },
    isAuthenticated: true,
    loading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

// Mock apiClient
const mockSpeak = vi.fn();
const mockChat = vi.fn();
vi.mock('../../services/apiClient', () => ({
  speak: (...args: unknown[]) => mockSpeak(...args),
  chat: (...args: unknown[]) => mockChat(...args),
  transcribe: vi.fn(),
  TimeoutError: class TimeoutError extends Error {},
}));

// Mock AudioRecorder
vi.mock('./AudioRecorder', () => ({
  default: () => <div data-testid="audio-recorder">AudioRecorder Mock</div>,
}));

// Mock TranscriptionDisplay
vi.mock('./TranscriptionDisplay', () => ({
  default: () => <div data-testid="transcription-display">TranscriptionDisplay Mock</div>,
}));

// Mock FeedbackDisplay
vi.mock('./FeedbackDisplay', () => ({
  default: () => <div data-testid="feedback-display-mock">FeedbackDisplay Mock</div>,
}));

// Mock Audio API
vi.stubGlobal('Audio', vi.fn().mockImplementation(() => ({
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  set onended(_fn: () => void) {},
  set onerror(_fn: () => void) {},
})));

const defaultProps = {
  sessionId: 'sess-1',
  jobPosition: 'Software Engineer',
  seniorityLevel: 'mid' as const,
  questionCategory: 'general' as const,
  currentQuestion: 'Tell me about yourself.',
  onEndSession: vi.fn(),
  onNextQuestion: vi.fn(),
};

describe('InterviewSession questionType badge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpeak.mockResolvedValue({ audioData: 'base64audio' });
  });

  /**
   * Feature: interview-flow-restructure
   * Property 7: Badge displays correct Indonesian label for question type
   * Validates: Requirements 6.1, 6.2, 6.3, 6.4
   */
  it('Property 7: displays correct Indonesian label for any questionType', () => {
    const expectedLabels: Record<string, string> = {
      introduction: 'Perkenalan',
      contextual: 'Pertanyaan Lanjutan',
    };

    fc.assert(
      fc.property(
        fc.constantFrom('introduction' as const, 'contextual' as const),
        (questionType) => {
          const { unmount } = render(
            <InterviewSession {...defaultProps} questionType={questionType} />
          );
          const badge = screen.getByTestId('question-type-badge');
          expect(badge).toHaveTextContent(expectedLabels[questionType]);
          // "Topik Baru" should never appear
          expect(badge.textContent).not.toContain('Topik Baru');
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('renders "Perkenalan" badge with blue styling for introduction questionType', () => {
    render(<InterviewSession {...defaultProps} questionType="introduction" />);
    const badge = screen.getByTestId('question-type-badge');
    expect(badge).toHaveTextContent('Perkenalan');
    expect(badge.className).toContain('bg-blue-100');
    expect(badge.className).toContain('text-blue-700');
  });

  it('renders "Pertanyaan Lanjutan" badge with purple styling for contextual questionType', () => {
    render(<InterviewSession {...defaultProps} questionType="contextual" />);
    const badge = screen.getByTestId('question-type-badge');
    expect(badge).toHaveTextContent('Pertanyaan Lanjutan');
    expect(badge.className).toContain('bg-purple-100');
    expect(badge.className).toContain('text-purple-700');
  });

  it('renders no badge when questionType is undefined', () => {
    render(<InterviewSession {...defaultProps} />);
    expect(screen.queryByTestId('question-type-badge')).toBeNull();
  });

  it('never renders "Topik Baru" for any questionType', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('introduction' as const, 'contextual' as const, undefined),
        (questionType) => {
          const { unmount, container } = render(
            <InterviewSession {...defaultProps} questionType={questionType} />
          );
          expect(container.textContent).not.toContain('Topik Baru');
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
