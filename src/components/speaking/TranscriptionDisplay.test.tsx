import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TranscriptionDisplay from './TranscriptionDisplay';

describe('TranscriptionDisplay', () => {
  it('renders nothing when transcription is empty', () => {
    const { container } = render(<TranscriptionDisplay transcription="" />);
    expect(container.firstChild).toBeNull();
  });

  it('displays the label and transcription text', () => {
    render(<TranscriptionDisplay transcription="I have experience with React and TypeScript." />);
    expect(screen.getByText('Transkripsi Jawaban Anda:')).toBeInTheDocument();
    expect(screen.getByTestId('transcription-text')).toHaveTextContent(
      'I have experience with React and TypeScript.',
    );
  });

  it('renders transcription text in a paragraph element', () => {
    render(<TranscriptionDisplay transcription="Some answer text" />);
    const textEl = screen.getByTestId('transcription-text');
    expect(textEl.tagName).toBe('P');
  });
});
