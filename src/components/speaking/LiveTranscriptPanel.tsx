import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import type { LiveTranscriptPanelProps, TranscriptEntry, FeedbackReport } from '../../types';
import InlineFeedbackCard from './InlineFeedbackCard';

/**
 * Deduplicate transcripts: when a final entry arrives with the same id
 * as a partial entry, keep only the final version.
 */
function deduplicateTranscripts(transcripts: TranscriptEntry[]): TranscriptEntry[] {
  const seen = new Map<string, TranscriptEntry>();
  for (const entry of transcripts) {
    const existing = seen.get(entry.id);
    // Replace partial with final, or keep the first occurrence
    if (!existing || (!entry.partial && existing.partial)) {
      seen.set(entry.id, entry);
    }
  }
  return Array.from(seen.values());
}

/** Typing indicator (three bouncing dots) */
function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1" data-testid="typing-indicator">
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
    </span>
  );
}

/** Green waveform indicator for when user is speaking */
function WaveformIndicator() {
  return (
    <div className="flex items-end gap-0.5 h-5" data-testid="waveform-indicator">
      {[3, 5, 4, 6, 3, 5, 4, 6, 3, 5].map((h, i) => (
        <span
          key={i}
          className="w-0.5 rounded-full bg-tertiary animate-pulse"
          style={{
            height: `${(h / 6) * 100}%`,
            animationDelay: `${i * 80}ms`,
          }}
        />
      ))}
    </div>
  );
}

/** Single transcript bubble */
function TranscriptBubble({
  entry,
  isCurrentTurnUser,
  isCurrentTurnAi,
}: {
  entry: TranscriptEntry;
  isCurrentTurnUser: boolean;
  isCurrentTurnAi: boolean;
}) {
  const isUser = entry.role === 'user';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}
      data-testid={`transcript-bubble-${entry.role}`}
      data-entry-id={entry.id}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-primary text-on-primary rounded-br-md'
            : 'bg-surface-container-low text-on-surface border border-outline-variant/10 rounded-bl-md'
        }`}
      >
        {/* Role label */}
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${
            isUser ? 'text-on-primary/70' : 'text-on-surface-variant'
          }`}>
            {isUser ? 'You' : 'AI Interviewer'}
          </span>
          {/* Waveform for user when speaking */}
          {isUser && entry.partial && isCurrentTurnUser && <WaveformIndicator />}
        </div>

        {/* Transcript text */}
        <p className={`text-sm leading-relaxed ${
          isUser ? 'text-on-primary' : 'text-on-surface'
        }`}>
          {entry.text}
          {/* Typing indicator for partial user entries */}
          {isUser && entry.partial && (
            <span className="ml-1 text-on-primary/60">
              <TypingIndicator />
            </span>
          )}
        </p>

        {/* Typing indicator for AI when it's AI's turn and this is the last AI entry */}
        {!isUser && isCurrentTurnAi && entry.partial && (
          <span className="text-on-surface-variant mt-1 block">
            <TypingIndicator />
          </span>
        )}
      </div>
    </div>
  );
}

export default function LiveTranscriptPanel({
  transcripts,
  currentTurn,
  feedbackCards,
}: LiveTranscriptPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [expandedCards, setExpandedCards] = useState<Map<string, boolean>>(new Map());

  const toggleCardExpanded = useCallback((questionId: string) => {
    setExpandedCards(prev => {
      const next = new Map(prev);
      next.set(questionId, !prev.get(questionId));
      return next;
    });
  }, []);

  // Deduplicate: partial-to-final replacement
  const dedupedTranscripts = useMemo(
    () => deduplicateTranscripts(transcripts),
    [transcripts],
  );

  // Auto-scroll to bottom when new transcripts arrive
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [dedupedTranscripts]);

  // Find the last AI entry to show typing indicator only on it
  const lastAiEntryId = useMemo(() => {
    for (let i = dedupedTranscripts.length - 1; i >= 0; i--) {
      if (dedupedTranscripts[i].role === 'ai') {
        return dedupedTranscripts[i].id;
      }
    }
    return null;
  }, [dedupedTranscripts]);

  // Build rendered items: transcripts interleaved with feedback cards
  const renderedItems = useMemo(() => {
    const items: Array<
      | { type: 'transcript'; entry: TranscriptEntry }
      | { type: 'feedback'; questionId: string; report: FeedbackReport }
    > = [];

    for (let i = 0; i < dedupedTranscripts.length; i++) {
      const entry = dedupedTranscripts[i];
      items.push({ type: 'transcript', entry });

      // Insert feedback card between user answer and next AI question
      // Check if current entry is a user entry with a questionId and next entry is AI
      if (
        entry.role === 'user' &&
        !entry.partial &&
        entry.questionId &&
        feedbackCards.has(entry.questionId)
      ) {
        const nextEntry = dedupedTranscripts[i + 1];
        // Insert feedback before the next AI entry (or at the end if no next entry)
        if (!nextEntry || nextEntry.role === 'ai') {
          items.push({
            type: 'feedback',
            questionId: entry.questionId,
            report: feedbackCards.get(entry.questionId)!,
          });
        }
      }
    }

    return items;
  }, [dedupedTranscripts, feedbackCards]);

  return (
    <div
      className="flex flex-col h-full bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden"
      data-testid="live-transcript-panel"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-outline-variant/10 bg-surface-container-low">
        <span className="material-symbols-outlined text-primary text-sm">chat</span>
        <h3 className="text-sm font-headline font-bold text-primary">Live Transcript</h3>
        {currentTurn === 'user' && (
          <div className="ml-auto flex items-center gap-2">
            <WaveformIndicator />
            <span className="text-[10px] font-bold text-tertiary uppercase tracking-wider">
              Recording
            </span>
          </div>
        )}
        {currentTurn === 'ai' && (
          <div className="ml-auto flex items-center gap-2 text-on-surface-variant">
            <TypingIndicator />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              AI Speaking
            </span>
          </div>
        )}
      </div>

      {/* Transcript area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-1"
        data-testid="transcript-scroll-container"
      >
        {dedupedTranscripts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl mb-2 text-outline">forum</span>
            <p className="text-sm">Percakapan akan muncul di sini...</p>
          </div>
        )}

        {renderedItems.map((item) => {
          if (item.type === 'feedback') {
            return (
              <InlineFeedbackCard
                key={`feedback-${item.questionId}`}
                feedbackReport={item.report}
                expanded={!!expandedCards.get(item.questionId)}
                onToggleExpand={() => toggleCardExpanded(item.questionId)}
              />
            );
          }

          const entry = item.entry;
          const isLastAi = entry.role === 'ai' && entry.id === lastAiEntryId;

          return (
            <TranscriptBubble
              key={entry.id}
              entry={entry}
              isCurrentTurnUser={currentTurn === 'user'}
              isCurrentTurnAi={isLastAi && currentTurn === 'ai'}
            />
          );
        })}

        {/* Show AI typing indicator when AI turn but no AI partial entry yet */}
        {currentTurn === 'ai' &&
          dedupedTranscripts.length > 0 &&
          !dedupedTranscripts.some(
            (e) => e.role === 'ai' && e.partial && e.id === lastAiEntryId,
          ) && (
            <div className="flex justify-start mb-3" data-testid="ai-typing-bubble">
              <div className="bg-surface-container-low text-on-surface-variant border border-outline-variant/10 rounded-2xl rounded-bl-md px-4 py-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant block mb-1">
                  AI Interviewer
                </span>
                <TypingIndicator />
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
