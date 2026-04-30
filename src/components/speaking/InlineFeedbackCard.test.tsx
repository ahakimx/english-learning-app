import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import InlineFeedbackCard, { scoreColor } from './InlineFeedbackCard';
import type { FeedbackReport } from '../../types';

const baseFeedback: FeedbackReport = {
  scores: {
    grammar: 85,
    vocabulary: 72,
    relevance: 90,
    fillerWords: 45,
    coherence: 30,
    overall: 64,
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
  improvedAnswer: 'I have extensive experience in software development.',
};

describe('InlineFeedbackCard', () => {
  it('renders overall score in collapsed state', () => {
    render(
      <InlineFeedbackCard feedbackReport={baseFeedback} expanded={false} onToggleExpand={vi.fn()} />,
    );
    // In collapsed state, the circular score indicator shows the score
    // and category badges are rendered inside the overall-score container
    const card = screen.getByTestId('inline-feedback-card');
    expect(card).toHaveTextContent('64');
    expect(card).toHaveTextContent('Grammar');
    expect(card).toHaveTextContent('Vocab');
    expect(card).toHaveTextContent('Relevance');
    expect(card).toHaveTextContent('Filler');
    expect(card).toHaveTextContent('Coherence');
  });

  it('calls onToggleExpand when header is clicked', () => {
    const onToggle = vi.fn();
    render(
      <InlineFeedbackCard feedbackReport={baseFeedback} expanded={false} onToggleExpand={onToggle} />,
    );
    fireEvent.click(screen.getByTestId('feedback-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('does not show details when collapsed', () => {
    render(
      <InlineFeedbackCard feedbackReport={baseFeedback} expanded={false} onToggleExpand={vi.fn()} />,
    );
    expect(screen.queryByTestId('feedback-details')).not.toBeInTheDocument();
  });

  it('shows all five criteria scores when expanded', () => {
    render(
      <InlineFeedbackCard feedbackReport={baseFeedback} expanded={true} onToggleExpand={vi.fn()} />,
    );
    expect(screen.getByLabelText('Grammar score')).toBeInTheDocument();
    expect(screen.getByLabelText('Vocabulary score')).toBeInTheDocument();
    expect(screen.getByLabelText('Relevance score')).toBeInTheDocument();
    expect(screen.getByLabelText('Filler Words score')).toBeInTheDocument();
    expect(screen.getByLabelText('Coherence score')).toBeInTheDocument();
  });

  it('renders grammar errors section with expand/collapse', () => {
    render(
      <InlineFeedbackCard feedbackReport={baseFeedback} expanded={true} onToggleExpand={vi.fn()} />,
    );
    // Grammar errors section exists but list is collapsed by default
    expect(screen.getByTestId('grammar-errors-section')).toBeInTheDocument();
    expect(screen.queryByTestId('grammar-errors-list')).not.toBeInTheDocument();

    // Expand grammar errors
    fireEvent.click(screen.getByTestId('grammar-errors-toggle'));
    const list = screen.getByTestId('grammar-errors-list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('I has experience');
    expect(items[0]).toHaveTextContent('I have experience');
    // New design shows a derived category label instead of the raw rule text
    expect(items[0]).toHaveTextContent('Subject-Verb');
  });

  it('renders filler words with counts when expanded', () => {
    render(
      <InlineFeedbackCard feedbackReport={baseFeedback} expanded={true} onToggleExpand={vi.fn()} />,
    );
    const list = screen.getByTestId('filler-words-list');
    expect(list).toHaveTextContent('um');
    expect(list).toHaveTextContent('3×');
    expect(list).toHaveTextContent('like');
    expect(list).toHaveTextContent('2×');
  });

  it('renders suggestions when expanded', () => {
    render(
      <InlineFeedbackCard feedbackReport={baseFeedback} expanded={true} onToggleExpand={vi.fn()} />,
    );
    const list = screen.getByTestId('suggestions-list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Use more specific examples');
  });

  it('renders improved answer when expanded', () => {
    render(
      <InlineFeedbackCard feedbackReport={baseFeedback} expanded={true} onToggleExpand={vi.fn()} />,
    );
    expect(screen.getByTestId('improved-answer')).toHaveTextContent(
      'I have extensive experience in software development.',
    );
  });

  it('hides grammar errors section when there are none', () => {
    const feedback: FeedbackReport = { ...baseFeedback, grammarErrors: [] };
    render(
      <InlineFeedbackCard feedbackReport={feedback} expanded={true} onToggleExpand={vi.fn()} />,
    );
    expect(screen.queryByTestId('grammar-errors-section')).not.toBeInTheDocument();
  });

  it('hides filler words section when there are none', () => {
    const feedback: FeedbackReport = { ...baseFeedback, fillerWordsDetected: [] };
    render(
      <InlineFeedbackCard feedbackReport={feedback} expanded={true} onToggleExpand={vi.fn()} />,
    );
    expect(screen.queryByTestId('filler-words-section')).not.toBeInTheDocument();
  });

  it('hides suggestions section when there are none', () => {
    const feedback: FeedbackReport = { ...baseFeedback, suggestions: [] };
    render(
      <InlineFeedbackCard feedbackReport={feedback} expanded={true} onToggleExpand={vi.fn()} />,
    );
    expect(screen.queryByTestId('suggestions-section')).not.toBeInTheDocument();
  });

  it('hides improved answer section when empty', () => {
    const feedback: FeedbackReport = { ...baseFeedback, improvedAnswer: '' };
    render(
      <InlineFeedbackCard feedbackReport={feedback} expanded={true} onToggleExpand={vi.fn()} />,
    );
    expect(screen.queryByTestId('improved-answer-section')).not.toBeInTheDocument();
  });
});

describe('scoreColor', () => {
  it('returns green for scores >= 80', () => {
    expect(scoreColor(80)).toBe('green');
    expect(scoreColor(100)).toBe('green');
    expect(scoreColor(95)).toBe('green');
  });

  it('returns blue for scores >= 60 and < 80', () => {
    expect(scoreColor(60)).toBe('blue');
    expect(scoreColor(79)).toBe('blue');
    expect(scoreColor(70)).toBe('blue');
  });

  it('returns gray for scores >= 40 and < 60', () => {
    expect(scoreColor(40)).toBe('gray');
    expect(scoreColor(59)).toBe('gray');
    expect(scoreColor(50)).toBe('gray');
  });

  it('returns red for scores < 40', () => {
    expect(scoreColor(0)).toBe('red');
    expect(scoreColor(39)).toBe('red');
    expect(scoreColor(20)).toBe('red');
  });
});
