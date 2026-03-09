import { useState } from 'react';

interface WritingEditorProps {
  prompt: string;
  onSubmit: (content: string) => void;
  disabled?: boolean;
}

const MIN_CHARS = 50;

export default function WritingEditor({ prompt, onSubmit, disabled = false }: WritingEditorProps) {
  const [content, setContent] = useState('');

  const canSubmit = content.length >= MIN_CHARS && !disabled;

  function handleSubmit() {
    if (canSubmit) {
      onSubmit(content);
    }
  }

  return (
    <div>
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-sm font-semibold text-blue-800 mb-1">Prompt</h3>
        <p className="text-gray-800 text-sm whitespace-pre-wrap">{prompt}</p>
      </div>

      <label htmlFor="writing-editor" className="block text-sm font-medium text-gray-700 mb-1">
        Tulis jawaban Anda di bawah ini
      </label>
      <textarea
        id="writing-editor"
        data-testid="writing-textarea"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={disabled}
        rows={12}
        placeholder="Mulai menulis di sini..."
        className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y disabled:bg-gray-100 disabled:cursor-not-allowed"
      />

      <div className="flex items-center justify-between mt-2">
        <span
          className={`text-xs ${content.length < MIN_CHARS ? 'text-gray-400' : 'text-green-600'}`}
          data-testid="char-count"
        >
          {content.length} karakter {content.length < MIN_CHARS && `(minimal ${MIN_CHARS})`}
        </span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          data-testid="submit-writing"
        >
          {disabled ? 'Mengirim...' : 'Kirim untuk Review'}
        </button>
      </div>
    </div>
  );
}
