/**
 * Message kind classifier.
 * Runs on every inbound message before intent analysis.
 * Classification hierarchy (evaluated top-to-bottom, first match wins):
 *   1. opt_out          — STOP/UNSUBSCRIBE keywords (run first, before everything else)
 *   2. auto_reply       — OOO / vacation / auto-generated patterns
 *   3. template_feedback — delivery receipts / template status callbacks
 *   4. human_reply      — all remaining inbound text
 *   5. unrelated        — non-text media with no caption
 */

export type MessageKind =
  | 'human_reply'
  | 'auto_reply'
  | 'opt_out'
  | 'template_feedback'
  | 'system'
  | 'unrelated'
  | 'outbound';

/** Bump this when classification logic changes — triggers background re-classification. */
export const KIND_CLASSIFIER_VERSION = 1;

const OPT_OUT_PATTERNS = [
  /^stop$/i,
  /^unsubscribe$/i,
  /^opt.?out$/i,
  /^remove me$/i,
  /^do not (contact|message)$/i,
  /^(dnc|block)$/i,
  /^no more (messages|updates|notifications)$/i,
];

const AUTO_REPLY_PATTERNS = [
  /out of (office|town)/i,
  /auto.?reply/i,
  /automatic(ally)? (generated|reply|response)/i,
  /i (am|will be) (away|on leave|on vacation)/i,
  /this is an automated/i,
  /do not reply to this (email|message)/i,
];

/** Classify a single inbound message. Returns the most specific kind. */
export function classifyMessageKind(text: string | null | undefined, mediaType?: string | null): MessageKind {
  if (!text && mediaType) {
    return 'unrelated'; // image/audio/video with no caption
  }

  const t = (text ?? '').trim();

  // 1. Opt-out — must be checked before everything else
  if (OPT_OUT_PATTERNS.some(re => re.test(t))) return 'opt_out';

  // 2. Auto-reply patterns
  if (AUTO_REPLY_PATTERNS.some(re => re.test(t))) return 'auto_reply';

  // 3. Template feedback (WhatsApp sends short system strings)
  if (t === '' && !mediaType) return 'system';

  // 4. Default: treat as a genuine human reply
  return 'human_reply';
}
