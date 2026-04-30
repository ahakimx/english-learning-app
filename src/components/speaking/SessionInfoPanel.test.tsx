import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SessionInfoPanel, { formatDuration } from './SessionInfoPanel';
import type { SessionInfoPanelProps } from '../../types';

const baseProps: SessionInfoPanelProps = {
  jobPosition: 'Frontend Developer',
  seniorityLevel: 'mid',
  questionCategory: 'technical',
  sessionDuration: 125, // 2:05
  questionCount: 5,
  currentQuestionNumber: 3,
  fillerWordCount: 7,
  connectionState: 'connected',
};

describe('formatDuration', () => {
  it('formats 0 seconds as 00:00', () => {
    expect(formatDuration(0)).toBe('00:00');
  });

  it('formats seconds less than a minute', () => {
    expect(formatDuration(45)).toBe('00:45');
  });

  it('formats exact minutes', () => {
    expect(formatDuration(120)).toBe('02:00');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('02:05');
  });

  it('formats large durations', () => {
    expect(formatDuration(3661)).toBe('61:01');
  });

  it('handles negative values by clamping to 0', () => {
    expect(formatDuration(-10)).toBe('00:00');
  });

  it('floors fractional seconds', () => {
    expect(formatDuration(59.9)).toBe('00:59');
  });
});

describe('SessionInfoPanel', () => {
  it('renders the session info panel', () => {
    render(<SessionInfoPanel {...baseProps} />);
    expect(screen.getByTestId('session-info-panel')).toBeInTheDocument();
  });

  it('displays the session duration formatted as MM:SS', () => {
    render(<SessionInfoPanel {...baseProps} />);
    const timer = screen.getByTestId('session-timer');
    expect(timer).toHaveTextContent('02:05');
  });

  it('displays question progress', () => {
    render(<SessionInfoPanel {...baseProps} />);
    const progress = screen.getByTestId('question-progress');
    expect(progress).toHaveTextContent('3');
    expect(progress).toHaveTextContent('/ 5');
  });

  it('displays filler word count', () => {
    render(<SessionInfoPanel {...baseProps} />);
    const counter = screen.getByTestId('filler-word-counter');
    expect(counter).toHaveTextContent('7');
  });

  it('displays job position', () => {
    render(<SessionInfoPanel {...baseProps} />);
    const details = screen.getByTestId('session-details');
    expect(details).toHaveTextContent('Frontend Developer');
  });

  it('displays seniority level capitalized', () => {
    render(<SessionInfoPanel {...baseProps} />);
    const details = screen.getByTestId('session-details');
    expect(details).toHaveTextContent('Mid');
  });

  it('displays question category capitalized', () => {
    render(<SessionInfoPanel {...baseProps} />);
    const details = screen.getByTestId('session-details');
    expect(details).toHaveTextContent('Technical');
  });

  it('shows green dot for connected state', () => {
    render(<SessionInfoPanel {...baseProps} connectionState="connected" />);
    const stateEl = screen.getByTestId('connection-state');
    expect(stateEl).toHaveTextContent('Connected');
  });

  it('shows reconnecting state with label', () => {
    render(<SessionInfoPanel {...baseProps} connectionState="reconnecting" />);
    const stateEl = screen.getByTestId('connection-state');
    expect(stateEl).toHaveTextContent('Reconnecting');
  });

  it('shows disconnected state with label', () => {
    render(<SessionInfoPanel {...baseProps} connectionState="disconnected" />);
    const stateEl = screen.getByTestId('connection-state');
    expect(stateEl).toHaveTextContent('Disconnected');
  });

  it('updates displayed duration when prop changes', () => {
    const { rerender } = render(<SessionInfoPanel {...baseProps} sessionDuration={60} />);
    expect(screen.getByTestId('session-timer')).toHaveTextContent('01:00');

    rerender(<SessionInfoPanel {...baseProps} sessionDuration={90} />);
    expect(screen.getByTestId('session-timer')).toHaveTextContent('01:30');
  });

  it('updates filler word count when prop changes', () => {
    const { rerender } = render(<SessionInfoPanel {...baseProps} fillerWordCount={0} />);
    expect(screen.getByTestId('filler-word-counter')).toHaveTextContent('0');

    rerender(<SessionInfoPanel {...baseProps} fillerWordCount={12} />);
    expect(screen.getByTestId('filler-word-counter')).toHaveTextContent('12');
  });
});
