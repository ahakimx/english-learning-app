import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import FeedbackDisplay from './FeedbackDisplay';
import type { FeedbackReport } from '../../types';

const baseFeedback: FeedbackReport = {
  scores: {
    grammar: 75,
    vocabulary: 80,
    relevance: 90,
    fillerWords: 60,
    coherence: 85,
    overall: 78,
  },
  grammarErrors: [
    { original: 'I has experience', correction: 'I have experience', rule: 'Subject-verb agreement' },
    { original: 'more better', correction: 'better', rule: 'Double comparative' },
  ],
  fillerWordsDetected: [
    { word: 'um', count: 3 },
    { word: 'like', count: 2 },
  ],
  suggestions: [
    'Use more specific examples from your experience.',
    'Avoid starting sentences with "So".',
  ],
  improvedAnswer: 'I have extensive experience in software development, having worked on multiple projects...',
};

describe('FeedbackDisplay', () => {
  it('renders the overall score', () => {
    render(<FeedbackDisplay feedbackReport={baseFeedback} />);
    expect(screen.getByTestId('overall-score')).toHaveTextContent('78');
  });

  it('renders all five criteria score bars', () => {
    render(<FeedbackDisplay feedbackReport={baseFeedback} />);
    expect(screen.getByLabelText('Grammar score')).toBeInTheDocument();
    expect(screen.getByLabelText('Vocabulary score')).toBeInTheDocument();
    expect(screen.getByLabelText('Relevance score')).toBeInTheDocument();
    expect(screen.getByLabelText('Filler Words score')).toBeInTheDocument();
    expect(screen.getByLabelText('Coherence score')).toBeInTheDocument();
  });

  it('renders grammar errors with original, correction, and rule', () => {
    render(<FeedbackDisplay feedbackReport={baseFeedback} />);
    const list = screen.getByTestId('grammar-errors-list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('I has experience');
    expect(items[0]).toHaveTextContent('I have experience');
    expect(items[0]).toHaveTextContent('Subject-verb agreement');
  });

  it('renders filler words with counts', () => {
    render(<FeedbackDisplay feedbackReport={baseFeedback} />);
    const list = screen.getByTestId('filler-words-list');
    expect(list).toHaveTextContent('um');
    expect(list).toHaveTextContent('3×');
    expect(list).toHaveTextContent('like');
    expect(list).toHaveTextContent('2×');
  });

  it('renders suggestions list', () => {
    render(<FeedbackDisplay feedbackReport={baseFeedback} />);
    const list = screen.getByTestId('suggestions-list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Use more specific examples');
  });

  it('renders improved answer', () => {
    render(<FeedbackDisplay feedbackReport={baseFeedback} />);
    expect(screen.getByTestId('improved-answer')).toHaveTextContent(
      'I have extensive experience in software development',
    );
  });

  it('hides grammar errors section when empty', () => {
    const feedback: FeedbackReport = { ...baseFeedback, grammarErrors: [] };
    render(<FeedbackDisplay feedbackReport={feedback} />);
    expect(screen.queryByTestId('grammar-errors-list')).not.toBeInTheDocument();
  });

  it('hides filler words section when empty', () => {
    const feedback: FeedbackReport = { ...baseFeedback, fillerWordsDetected: [] };
    render(<FeedbackDisplay feedbackReport={feedback} />);
    expect(screen.queryByTestId('filler-words-list')).not.toBeInTheDocument();
  });
});
