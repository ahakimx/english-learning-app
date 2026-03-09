import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  TimeoutError: class TimeoutError extends Error {
    constructor(message = 'Analisis membutuhkan waktu lebih lama dari yang diharapkan. Silakan coba lagi.') {
      super(message);
      this.name = 'TimeoutError';
    }
  },
}));

// Mock AudioRecorder — simulate transcription callback
let capturedOnTranscription: ((text: string) => void) | null = null;
vi.mock('./AudioRecorder', () => ({
  default: ({ onTranscription }: { onTranscription: (text: string) => void }) => {
    capturedOnTranscription = onTranscription;
    return <div data-testid="audio-recorder">AudioRecorder Mock</div>;
  },
}));

// Mock TranscriptionDisplay
vi.mock('./TranscriptionDisplay', () => ({
  default: ({ transcription }: { transcription: string }) => (
    <div data-testid="transcription-display">{transcription}</div>
  ),
}));

// Mock FeedbackDisplay
vi.mock('./FeedbackDisplay', () => ({
  default: () => <div data-testid="feedback-display-mock">FeedbackDisplay Mock</div>,
}));

// Mock Audio API
const mockPlay = vi.fn(() => Promise.resolve());
const mockPause = vi.fn();
let audioOnEnded: (() => void) | null = null;
let audioOnError: (() => void) | null = null;

vi.stubGlobal('Audio', vi.fn().mockImplementation(() => ({
  play: mockPlay,
  pause: mockPause,
  set onended(fn: () => void) { audioOnEnded = fn; },
  get onended() { return audioOnEnded; },
  set onerror(fn: () => void) { audioOnError = fn; },
  get onerror() { return audioOnError; },
})));

const defaultProps = {
  sessionId: 'sess-1',
  jobPosition: 'Software Engineer',
  currentQuestion: 'Tell me about yourself.',
  onEndSession: vi.fn(),
  onNextQuestion: vi.fn(),
};

function renderSession(props = defaultProps) {
  return render(<InterviewSession {...props} />);
}

describe('InterviewSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnTranscription = null;
    audioOnEnded = null;
    audioOnError = null;
    mockSpeak.mockResolvedValue({ audioData: 'base64audio' });
  });

  it('renders the question text', () => {
    renderSession();
    expect(screen.getByTestId('interview-question')).toHaveTextContent('Tell me about yourself.');
  });

  it('shows job position and session id', () => {
    renderSession();
    expect(screen.getByText(/Posisi: Software Engineer/)).toBeInTheDocument();
    expect(screen.getByTestId('session-id')).toHaveTextContent('Sesi: sess-1');
  });

  it('starts in listening phase and calls speak API', async () => {
    renderSession();
    expect(screen.getByTestId('session-phase')).toHaveTextContent('Mendengarkan pertanyaan...');
    await waitFor(() => {
      expect(mockSpeak).toHaveBeenCalledWith('Tell me about yourself.');
    });
  });

  it('transitions to recording phase after audio ends', async () => {
    renderSession();
    await waitFor(() => expect(mockSpeak).toHaveBeenCalled());

    // Simulate audio ended
    if (audioOnEnded) audioOnEnded();

    await waitFor(() => {
      expect(screen.getByTestId('session-phase')).toHaveTextContent('Rekam jawaban Anda');
    });
    expect(screen.getByTestId('audio-recorder')).toBeInTheDocument();
  });

  it('transitions to recording phase if speak API fails', async () => {
    mockSpeak.mockRejectedValue(new Error('TTS failed'));
    renderSession();

    await waitFor(() => {
      expect(screen.getByTestId('session-phase')).toHaveTextContent('Rekam jawaban Anda');
    });
  });

  it('transitions to processing phase after transcription received', async () => {
    renderSession();
    await waitFor(() => expect(mockSpeak).toHaveBeenCalled());
    if (audioOnEnded) audioOnEnded();
    await waitFor(() => expect(screen.getByTestId('audio-recorder')).toBeInTheDocument());

    // Mock chat for analyze_answer — never resolves to keep processing state
    mockChat.mockReturnValue(new Promise(() => {}));

    // Simulate transcription callback
    capturedOnTranscription?.('I have five years of experience.');

    await waitFor(() => {
      expect(screen.getByTestId('session-phase')).toHaveTextContent('Menganalisis jawaban...');
    });
    expect(screen.getByTestId('transcription-display')).toHaveTextContent('I have five years of experience.');
  });

  it('shows feedback after analysis completes', async () => {
    renderSession();
    await waitFor(() => expect(mockSpeak).toHaveBeenCalled());
    if (audioOnEnded) audioOnEnded();
    await waitFor(() => expect(screen.getByTestId('audio-recorder')).toBeInTheDocument());

    mockChat.mockResolvedValue({
      sessionId: 'sess-1',
      type: 'feedback',
      content: 'Good answer',
      feedbackReport: {
        scores: { grammar: 80, vocabulary: 75, relevance: 90, fillerWords: 70, coherence: 85, overall: 80 },
        grammarErrors: [],
        fillerWordsDetected: [],
        suggestions: ['Be more specific.'],
        improvedAnswer: 'Improved version...',
      },
    });

    capturedOnTranscription?.('My answer text');

    await waitFor(() => {
      expect(screen.getByTestId('session-phase')).toHaveTextContent('Hasil Feedback');
    });
    expect(screen.getByTestId('feedback-display-mock')).toBeInTheDocument();
    expect(screen.getByText('Pertanyaan Berikutnya')).toBeInTheDocument();
    expect(screen.getByText('Akhiri Sesi')).toBeInTheDocument();
  });

  it('calls onNextQuestion when "Pertanyaan Berikutnya" is clicked', async () => {
    renderSession();
    await waitFor(() => expect(mockSpeak).toHaveBeenCalled());
    if (audioOnEnded) audioOnEnded();
    await waitFor(() => expect(screen.getByTestId('audio-recorder')).toBeInTheDocument());

    mockChat.mockResolvedValue({
      sessionId: 'sess-1',
      type: 'feedback',
      content: 'Feedback',
      feedbackReport: {
        scores: { grammar: 80, vocabulary: 75, relevance: 90, fillerWords: 70, coherence: 85, overall: 80 },
        grammarErrors: [],
        fillerWordsDetected: [],
        suggestions: ['Tip'],
        improvedAnswer: 'Better answer',
      },
    });

    capturedOnTranscription?.('Answer');
    await waitFor(() => expect(screen.getByText('Pertanyaan Berikutnya')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Pertanyaan Berikutnya'));
    expect(defaultProps.onNextQuestion).toHaveBeenCalled();
  });

  it('calls onEndSession when "Akhiri Sesi" is clicked', async () => {
    renderSession();
    await waitFor(() => expect(mockSpeak).toHaveBeenCalled());
    if (audioOnEnded) audioOnEnded();
    await waitFor(() => expect(screen.getByTestId('audio-recorder')).toBeInTheDocument());

    mockChat.mockResolvedValue({
      sessionId: 'sess-1',
      type: 'feedback',
      content: 'Feedback',
      feedbackReport: {
        scores: { grammar: 80, vocabulary: 75, relevance: 90, fillerWords: 70, coherence: 85, overall: 80 },
        grammarErrors: [],
        fillerWordsDetected: [],
        suggestions: ['Tip'],
        improvedAnswer: 'Better answer',
      },
    });

    capturedOnTranscription?.('Answer');
    await waitFor(() => expect(screen.getByText('Akhiri Sesi')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Akhiri Sesi'));
    expect(defaultProps.onEndSession).toHaveBeenCalled();
  });

  it('shows error and returns to recording if analysis fails', async () => {
    renderSession();
    await waitFor(() => expect(mockSpeak).toHaveBeenCalled());
    if (audioOnEnded) audioOnEnded();
    await waitFor(() => expect(screen.getByTestId('audio-recorder')).toBeInTheDocument());

    mockChat.mockRejectedValue(new Error('Analysis failed'));

    capturedOnTranscription?.('My answer');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Gagal menganalisis jawaban');
    });
    expect(screen.getByTestId('session-phase')).toHaveTextContent('Rekam jawaban Anda');
  });

  it('shows timeout error with retry button when analysis times out', async () => {
    const { TimeoutError } = await import('../../services/apiClient');
    renderSession();
    await waitFor(() => expect(mockSpeak).toHaveBeenCalled());
    if (audioOnEnded) audioOnEnded();
    await waitFor(() => expect(screen.getByTestId('audio-recorder')).toBeInTheDocument());

    mockChat.mockRejectedValue(new TimeoutError());

    capturedOnTranscription?.('My answer');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Analisis membutuhkan waktu lebih lama');
    });
    expect(screen.getByText('Coba Lagi')).toBeInTheDocument();
    expect(screen.getByTestId('session-phase')).toHaveTextContent('Rekam jawaban Anda');
  });

  it('retries analysis when retry button is clicked after timeout', async () => {
    const { TimeoutError } = await import('../../services/apiClient');
    renderSession();
    await waitFor(() => expect(mockSpeak).toHaveBeenCalled());
    if (audioOnEnded) audioOnEnded();
    await waitFor(() => expect(screen.getByTestId('audio-recorder')).toBeInTheDocument());

    // First call times out
    mockChat.mockRejectedValueOnce(new TimeoutError());

    capturedOnTranscription?.('My answer');

    await waitFor(() => {
      expect(screen.getByText('Coba Lagi')).toBeInTheDocument();
    });

    // Second call succeeds
    mockChat.mockResolvedValueOnce({
      sessionId: 'sess-1',
      type: 'feedback',
      content: 'Good answer',
      feedbackReport: {
        scores: { grammar: 80, vocabulary: 75, relevance: 90, fillerWords: 70, coherence: 85, overall: 80 },
        grammarErrors: [],
        fillerWordsDetected: [],
        suggestions: ['Be more specific.'],
        improvedAnswer: 'Improved version...',
      },
    });

    fireEvent.click(screen.getByText('Coba Lagi'));

    await waitFor(() => {
      expect(screen.getByTestId('session-phase')).toHaveTextContent('Hasil Feedback');
    });
    expect(screen.getByTestId('feedback-display-mock')).toBeInTheDocument();
  });

  it('does not show retry button for non-timeout errors', async () => {
    renderSession();
    await waitFor(() => expect(mockSpeak).toHaveBeenCalled());
    if (audioOnEnded) audioOnEnded();
    await waitFor(() => expect(screen.getByTestId('audio-recorder')).toBeInTheDocument());

    mockChat.mockRejectedValue(new Error('Server error'));

    capturedOnTranscription?.('My answer');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Gagal menganalisis jawaban');
    });
    expect(screen.queryByText('Coba Lagi')).not.toBeInTheDocument();
  });
});
