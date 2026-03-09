import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AudioRecorder from './AudioRecorder';

// Mock useAudioRecorder
const mockStartRecording = vi.fn();
const mockStopRecording = vi.fn();
let mockHookState = {
  isRecording: false,
  audioBlob: null as Blob | null,
  error: null as string | null,
};

vi.mock('../../hooks/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    ...mockHookState,
    startRecording: mockStartRecording,
    stopRecording: mockStopRecording,
  }),
}));

// Mock services
const mockUploadAudio = vi.fn();
const mockTranscribe = vi.fn();

vi.mock('../../services/audioService', () => ({
  uploadAudio: (...args: unknown[]) => mockUploadAudio(...args),
}));

vi.mock('../../services/apiClient', () => ({
  transcribe: (...args: unknown[]) => mockTranscribe(...args),
}));

const defaultProps = {
  sessionId: 'sess-1',
  questionId: 'q-1',
  userId: 'user-1',
  onTranscription: vi.fn(),
};

function renderRecorder(props = defaultProps) {
  return render(<AudioRecorder {...props} />);
}

describe('AudioRecorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHookState = { isRecording: false, audioBlob: null, error: null };
  });

  it('renders idle state with record button', () => {
    renderRecorder();
    expect(screen.getByLabelText('Mulai merekam')).toBeInTheDocument();
    expect(screen.getByTestId('recorder-status')).toHaveTextContent('Tekan tombol untuk mulai merekam');
  });

  it('calls startRecording when record button is clicked', () => {
    renderRecorder();
    fireEvent.click(screen.getByLabelText('Mulai merekam'));
    expect(mockStartRecording).toHaveBeenCalled();
  });

  it('shows recording state with stop button and pulsing indicator', () => {
    mockHookState = { isRecording: true, audioBlob: null, error: null };
    renderRecorder();
    expect(screen.getByLabelText('Berhenti merekam')).toBeInTheDocument();
    expect(screen.getByTestId('recording-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('recorder-status')).toHaveTextContent('Merekam... Tekan untuk berhenti');
  });

  it('calls stopRecording when stop button is clicked during recording', () => {
    mockHookState = { isRecording: true, audioBlob: null, error: null };
    renderRecorder();
    fireEvent.click(screen.getByLabelText('Berhenti merekam'));
    expect(mockStopRecording).toHaveBeenCalled();
  });

  it('displays recorder error from hook', () => {
    mockHookState = {
      isRecording: false,
      audioBlob: null,
      error: 'Izinkan akses mikrofon untuk merekam jawaban Anda.',
    };
    renderRecorder();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Izinkan akses mikrofon untuk merekam jawaban Anda.',
    );
  });

  it('uploads audio and calls onTranscription after recording stops', async () => {
    mockUploadAudio.mockResolvedValue('user-1/sess-1/q-1.webm');
    mockTranscribe.mockResolvedValue({ transcription: 'Hello world' });

    const onTranscription = vi.fn();
    const blob = new Blob(['audio'], { type: 'audio/webm' });
    mockHookState = { isRecording: false, audioBlob: blob, error: null };

    renderRecorder({ ...defaultProps, onTranscription });

    await waitFor(() => {
      expect(mockUploadAudio).toHaveBeenCalledWith(blob, 'user-1', 'sess-1', 'q-1');
    });

    await waitFor(() => {
      expect(mockTranscribe).toHaveBeenCalledWith('user-1/sess-1/q-1.webm');
    });

    await waitFor(() => {
      expect(onTranscription).toHaveBeenCalledWith('Hello world');
    });
  });

  it('shows transcription error when upload fails', async () => {
    mockUploadAudio.mockRejectedValue(new Error('Upload failed'));

    const blob = new Blob(['audio'], { type: 'audio/webm' });
    mockHookState = { isRecording: false, audioBlob: blob, error: null };

    renderRecorder();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Gagal memproses transkripsi. Silakan coba lagi.',
      );
    });
  });

  it('shows transcription error when transcribe API fails', async () => {
    mockUploadAudio.mockResolvedValue('key.webm');
    mockTranscribe.mockRejectedValue(new Error('Transcription failed'));

    const blob = new Blob(['audio'], { type: 'audio/webm' });
    mockHookState = { isRecording: false, audioBlob: blob, error: null };

    renderRecorder();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Gagal memproses transkripsi. Silakan coba lagi.',
      );
    });
  });

  it('disables button during uploading/transcribing', async () => {
    mockUploadAudio.mockReturnValue(new Promise(() => {})); // never resolves

    const blob = new Blob(['audio'], { type: 'audio/webm' });
    mockHookState = { isRecording: false, audioBlob: blob, error: null };

    renderRecorder();

    await waitFor(() => {
      expect(screen.getByTestId('recorder-status')).toHaveTextContent('Mengunggah audio...');
    });

    // Button should be disabled during processing
    const button = screen.getByLabelText('Mulai merekam');
    expect(button).toBeDisabled();
  });
});
