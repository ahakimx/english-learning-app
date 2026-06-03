/**
 * Privacy helpers for Job Description (JD) handling.
 *
 * These helpers enforce two privacy guarantees:
 *   1. `stripJdFromError` — ensures that raw JD text never leaks through error
 *      messages returned to callers or written to logs. Any occurrence of the
 *      raw JD text inside an error message is replaced with `[redacted]`.
 *   2. `logJdEvent` — provides a narrow, typed logging surface that accepts
 *      only non-sensitive metadata about a JD-related request. It intentionally
 *      does NOT accept raw JD text, `jdContext`, or any other free-form field,
 *      so that JD content cannot accidentally be written to CloudWatch logs.
 *
 * Requirements: 11.1, 11.2, 11.7
 */

/**
 * Replace any occurrence of the raw JD text inside an error message with
 * `[redacted]`. If the error is not an `Error` instance, it is coerced to a
 * string first. When `jdRawText` is empty or does not appear in the message,
 * the original message string is returned unchanged.
 *
 * @param err - The error value whose message should be sanitized.
 * @param jdRawText - The raw JD text that must not leak through the message.
 * @returns The error message with all occurrences of `jdRawText` replaced by
 *          `[redacted]`.
 */
export function stripJdFromError(err: unknown, jdRawText: string): string {
  let msg: string;
  if (err instanceof Error) {
    msg = err.message;
  } else if (typeof err === 'string') {
    msg = err;
  } else {
    try {
      msg = String(err);
    } catch {
      msg = '[unknown error]';
    }
  }
  if (jdRawText && jdRawText.length > 0 && msg.includes(jdRawText)) {
    return msg.split(jdRawText).join('[redacted]');
  }
  return msg;
}

/**
 * Allowed outcomes for a JD-related request. Kept as a narrow union so that
 * log consumers can rely on a fixed vocabulary.
 */
export type JdEventOutcome = 'success' | 'error' | 'rate_limited' | 'invalid_input';

/**
 * The ONLY fields permitted when logging a JD event. Adding raw JD text or
 * `jdContext` to this shape is a privacy violation — do not extend this
 * interface with free-form content fields.
 */
export interface JdLogEvent {
  userId: string;
  requestId: string;
  outcome: JdEventOutcome;
  jdLength: number;
  errorCode?: string;
}

/**
 * Emit a structured JD event log line. The log record is tagged with
 * `kind: 'jd_event'` so it can be filtered in CloudWatch without inspecting
 * message contents. The function accepts only the fields declared on
 * {@link JdLogEvent} — never raw JD text.
 *
 * @param event - Non-sensitive metadata describing the JD event.
 */
export function logJdEvent(event: JdLogEvent): void {
  console.log(JSON.stringify({ kind: 'jd_event', ...event }));
}
