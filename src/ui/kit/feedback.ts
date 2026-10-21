export type FeedbackKind = 'tap' | 'confirm' | 'open' | 'close' | 'error';

let handler: ((kind: FeedbackKind) => void) | null = null;

/** The app registers its sound player here; the kit only announces taps. */
export function setFeedbackHandler(fn: ((kind: FeedbackKind) => void) | null): void {
  handler = fn;
}

export function feedback(kind: FeedbackKind): void {
  try {
    handler?.(kind);
  } catch {
    /* feedback is never allowed to break a click */
  }
}
