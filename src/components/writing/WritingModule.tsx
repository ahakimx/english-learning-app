import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { chat, updateProgress } from '../../services/apiClient';
import type { WritingReviewData } from '../../types';
import WritingTypeSelector from './WritingTypeSelector';
import WritingEditor from './WritingEditor';
import WritingReview from './WritingReview';

type Phase = 'select' | 'loading-prompt' | 'writing' | 'submitting' | 'review';

export default function WritingModule() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('select');
  const [error, setError] = useState<string | null>(null);
  const [writingType, setWritingType] = useState<'essay' | 'email' | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [reviewData, setReviewData] = useState<WritingReviewData | null>(null);

  async function handleSelectType(type: 'essay' | 'email') {
    setPhase('loading-prompt');
    setError(null);
    setWritingType(type);
    setReviewData(null);

    try {
      const response = await chat({ action: 'writing_prompt', writingType: type });
      setPrompt(response.content);
      setSessionId(response.sessionId);
      setPhase('writing');
    } catch {
      setError('Gagal memuat prompt tulisan. Silakan coba lagi.');
      setPhase('select');
    }
  }

  async function handleSubmitWriting(content: string) {
    if (!writingType) return;
    setPhase('submitting');
    setError(null);

    try {
      const response = await chat({
        action: 'writing_review',
        sessionId,
        writingType,
        writingContent: content,
      });

      if (response.writingReview) {
        setReviewData(response.writingReview);
        setPhase('review');

        // Save progress (non-blocking)
        updateProgress({
          moduleType: 'writing',
          score: response.writingReview.overallScore,
          sessionId,
        }).catch(() => {});
      } else {
        setError('Gagal mendapatkan review. Silakan coba lagi.');
        setPhase('writing');
      }
    } catch {
      setError('Gagal mengirim tulisan untuk review. Silakan coba lagi.');
      setPhase('writing');
    }
  }

  function handleWriteAgain() {
    setReviewData(null);
    setPrompt('');
    setPhase('loading-prompt');
    setError(null);
    if (writingType) {
      handleSelectType(writingType);
    }
  }

  function handleChangeType() {
    setPhase('select');
    setWritingType(null);
    setPrompt('');
    setReviewData(null);
    setSessionId('');
    setError(null);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Writing Module</h1>
          {writingType && phase !== 'select' && (
            <span className="text-sm text-gray-500" data-testid="current-type">
              Tipe: {writingType === 'essay' ? 'Essay' : 'Email'}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Kembali ke Dashboard
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {error && (
          <div role="alert" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {phase === 'select' && (
          <WritingTypeSelector onSelect={handleSelectType} />
        )}

        {(phase === 'loading-prompt' || phase === 'submitting') && (
          <div className="flex flex-col items-center justify-center py-16" role="status">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent mb-4" />
            <p className="text-gray-600">
              {phase === 'loading-prompt' ? 'Memuat prompt tulisan...' : 'Menganalisis tulisan Anda...'}
            </p>
          </div>
        )}

        {phase === 'writing' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <WritingEditor prompt={prompt} onSubmit={handleSubmitWriting} />
          </div>
        )}

        {phase === 'review' && reviewData && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <WritingReview writingReview={reviewData} />
            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={handleWriteAgain}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                data-testid="write-again"
              >
                Tulis Lagi
              </button>
              <button
                type="button"
                onClick={handleChangeType}
                className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                data-testid="change-type"
              >
                Ganti Tipe
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
