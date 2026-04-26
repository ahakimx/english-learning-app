import type { SessionInfoPanelProps } from '../../types';

/**
 * Formats a duration in seconds to MM:SS string.
 */
export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Returns a dot color class and label for the given connection state.
 */
function connectionIndicator(state: 'connected' | 'reconnecting' | 'disconnected') {
  switch (state) {
    case 'connected':
      return { dotClass: 'bg-tertiary', label: 'Connected' };
    case 'reconnecting':
      return { dotClass: 'bg-yellow-500', label: 'Reconnecting' };
    case 'disconnected':
      return { dotClass: 'bg-error', label: 'Disconnected' };
  }
}

/**
 * Capitalizes the first letter of a string.
 */
function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * SessionInfoPanel — right-side panel (35% width) displaying session metadata,
 * a real-time duration timer, question progress, filler word count, and
 * connection state.
 *
 * Requirements: 3.4, 9.1, 9.4, 9.5
 */
export default function SessionInfoPanel({
  jobPosition,
  seniorityLevel,
  questionCategory,
  sessionDuration,
  questionCount,
  currentQuestionNumber,
  fillerWordCount,
  connectionState,
}: SessionInfoPanelProps) {
  const { dotClass, label } = connectionIndicator(connectionState);

  return (
    <div
      className="flex flex-col h-full w-full bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden"
      data-testid="session-info-panel"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-outline-variant/10 bg-surface-container-low">
        <span className="material-symbols-outlined text-primary text-sm">info</span>
        <h3 className="text-sm font-headline font-bold text-primary">Session Info</h3>

        {/* Connection state indicator */}
        <div className="ml-auto flex items-center gap-2" data-testid="connection-state">
          <span
            className={`w-2 h-2 rounded-full ${dotClass} ${connectionState === 'reconnecting' ? 'animate-pulse' : ''}`}
            aria-hidden="true"
          />
          <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            {label}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Session duration timer */}
        <div
          className="flex flex-col items-center justify-center py-4 bg-surface-container rounded-xl"
          data-testid="session-timer"
        >
          <span className="material-symbols-outlined text-primary text-2xl mb-1">timer</span>
          <span className="text-3xl font-headline font-extrabold text-on-surface tracking-tight">
            {formatDuration(sessionDuration)}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mt-1">
            Session Duration
          </span>
        </div>

        {/* Question progress */}
        <div
          className="flex items-center gap-3 p-4 bg-surface-container rounded-xl"
          data-testid="question-progress"
        >
          <span className="material-symbols-outlined text-primary text-lg">quiz</span>
          <div className="flex-1">
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              Question
            </span>
            <p className="text-lg font-headline font-extrabold text-on-surface">
              {currentQuestionNumber}
              <span className="text-sm font-normal text-on-surface-variant"> / {questionCount}</span>
            </p>
          </div>
        </div>

        {/* Filler word counter */}
        <div
          className="flex items-center gap-3 p-4 bg-surface-container rounded-xl"
          data-testid="filler-word-counter"
        >
          <span className="material-symbols-outlined text-secondary text-lg">record_voice_over</span>
          <div className="flex-1">
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              Filler Words
            </span>
            <p className="text-lg font-headline font-extrabold text-on-surface">
              {fillerWordCount}
            </p>
          </div>
        </div>

        {/* Session details */}
        <div className="space-y-3" data-testid="session-details">
          <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
            Session Details
          </h4>

          <div className="flex items-center gap-3 p-3 bg-surface-container rounded-lg">
            <span className="material-symbols-outlined text-primary text-sm">work</span>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] text-on-surface-variant uppercase tracking-wider">
                Position
              </span>
              <p
                className="text-sm font-semibold text-on-surface truncate"
                title={jobPosition}
              >
                {jobPosition}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-surface-container rounded-lg">
            <span className="material-symbols-outlined text-primary text-sm">trending_up</span>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] text-on-surface-variant uppercase tracking-wider">
                Seniority
              </span>
              <p className="text-sm font-semibold text-on-surface">
                {capitalize(seniorityLevel)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-surface-container rounded-lg">
            <span className="material-symbols-outlined text-primary text-sm">category</span>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] text-on-surface-variant uppercase tracking-wider">
                Category
              </span>
              <p className="text-sm font-semibold text-on-surface">
                {capitalize(questionCategory)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
