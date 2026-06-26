import type { Message } from '@alphabot/shared';

/** Number of recent message pairs (user + assistant) sent verbatim to the LLM. */
const RECENT_TURNS = 6;

/** Max characters per older message to include in the archive summary. */
const ARCHIVE_MSG_CHARS = 120;

/** Max total characters for the archive block injected into the system prompt. */
const ARCHIVE_MAX_CHARS = 1200;

export interface AssembledHistory {
  /** Append to the system prompt (empty string if no archive). */
  archiveBlock: string;
  /** Recent messages to pass as the conversation array — verbatim, ordered oldest-first. */
  recentMessages: Message[];
  stats: {
    total:    number;
    archived: number;
    sent:     number;
  };
}

/**
 * Split conversation history into three tiers:
 *
 * Tier 1 — Contact memory   : already in system prompt (caller responsibility)
 * Tier 2 — Recent verbatim  : last RECENT_TURNS pairs, passed as messages[]
 * Tier 3 — Archive summary  : older turns compressed into a system prompt block
 */
export function assembleHistory(messages: Message[]): AssembledHistory {
  if (messages.length === 0) {
    return { archiveBlock: '', recentMessages: [], stats: { total: 0, archived: 0, sent: 0 } };
  }

  // Keep last N pairs verbatim (each pair = 1 user + 1 assistant message)
  const recentCutoff = RECENT_TURNS * 2;
  const recentMessages = messages.slice(-recentCutoff);
  const olderMessages  = messages.slice(0, -recentCutoff);

  if (olderMessages.length === 0) {
    return {
      archiveBlock:   '',
      recentMessages,
      stats: { total: messages.length, archived: 0, sent: recentMessages.length },
    };
  }

  const archiveBlock = buildArchiveBlock(olderMessages);

  return {
    archiveBlock,
    recentMessages,
    stats: {
      total:    messages.length,
      archived: olderMessages.length,
      sent:     recentMessages.length,
    },
  };
}

/**
 * Build a compact archive summary from older messages.
 * Extracts substantive pairs (questions + answers) and formats as a brief block.
 * No API call — pure heuristic, zero cost.
 */
function buildArchiveBlock(messages: Message[]): string {
  const pairs: string[] = [];
  let totalChars = 0;

  // Walk pairs: user[i] + assistant[i+1]
  for (let i = 0; i < messages.length - 1; i += 2) {
    const user      = messages[i];
    const assistant = messages[i + 1];

    // Skip if roles don't match the expected pair shape
    if (!user || !assistant) continue;
    if (user.role !== 'user' || assistant.role !== 'assistant') continue;

    const userText      = user.content.slice(0, ARCHIVE_MSG_CHARS).trim();
    const assistantText = assistant.content.slice(0, ARCHIVE_MSG_CHARS).trim();

    // Only include pairs where the user asked something substantive
    const isSubstantive =
      userText.length > 15 &&
      (userText.includes('?') || userText.split(' ').length > 5);

    if (!isSubstantive) continue;

    const pair = `• Q: ${userText}\n  A: ${assistantText}`;

    if (totalChars + pair.length > ARCHIVE_MAX_CHARS) break;

    pairs.push(pair);
    totalChars += pair.length;
  }

  if (pairs.length === 0) {
    return `[Earlier conversation: ${messages.length} messages — no substantive queries recorded]`;
  }

  return `EARLIER CONVERSATION SUMMARY (${messages.length} messages):\n${pairs.join('\n')}`;
}
