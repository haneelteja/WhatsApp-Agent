import { getServerClient } from '@alphabot/database';

/** Minimum seconds between campaign messages per phone number. */
const MIN_INTERVAL_SECONDS = 30;
/** Additional random jitter (0–15 s) to avoid thundering-herd patterns. */
const MAX_JITTER_SECONDS = 15;

interface CapacityRow {
  id:                 string;
  daily_limit:        number;
  messages_sent_today: number;
  next_send_at:       string | null;
  paused_today:       boolean;
  last_reset_at:      string;
}

/**
 * Checks whether the sender can dispatch a message right now.
 * Returns true if within limit and past the spacing clock.
 * Resets the daily counter if the row's date has rolled over.
 */
export async function canSendNow(tenantId: string, phoneNumberId: string): Promise<boolean> {
  const db  = getServerClient();
  const now = new Date();

  const { data: row } = await db
    .from('wa_sender_capacity')
    .select('id, daily_limit, messages_sent_today, next_send_at, paused_today, last_reset_at')
    .eq('tenant_id', tenantId)
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();

  // No row yet — allow the send (row will be created on recordSend)
  if (!row) return true;

  const cap = row as CapacityRow;

  // Auto-reset if the date has rolled over (a different day from last_reset_at)
  const today = now.toISOString().slice(0, 10);
  if (cap.last_reset_at < today) {
    await db
      .from('wa_sender_capacity')
      .update({ messages_sent_today: 0, paused_today: false, last_reset_at: today })
      .eq('id', cap.id);
    return true;
  }

  if (cap.paused_today) return false;
  if (cap.messages_sent_today >= cap.daily_limit) return false;
  if (cap.next_send_at && new Date(cap.next_send_at) > now) return false;

  return true;
}

/**
 * Records a successful send: increments the daily counter and sets the next_send_at clock.
 * Upserts the row so the first send creates it.
 */
export async function recordSend(tenantId: string, phoneNumberId: string): Promise<void> {
  const db    = getServerClient();
  const today = new Date().toISOString().slice(0, 10);

  const jitterMs   = Math.floor(Math.random() * MAX_JITTER_SECONDS * 1000);
  const nextSendAt = new Date(Date.now() + MIN_INTERVAL_SECONDS * 1000 + jitterMs).toISOString();

  const { data: existing } = await db
    .from('wa_sender_capacity')
    .select('id, messages_sent_today, last_reset_at')
    .eq('tenant_id', tenantId)
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();

  if (existing) {
    const cap = existing as { id: string; messages_sent_today: number; last_reset_at: string };
    const sentToday = cap.last_reset_at < today ? 1 : cap.messages_sent_today + 1;
    await db
      .from('wa_sender_capacity')
      .update({ messages_sent_today: sentToday, next_send_at: nextSendAt, last_reset_at: today })
      .eq('id', cap.id);
  } else {
    await db.from('wa_sender_capacity').insert({
      tenant_id:           tenantId,
      phone_number_id:     phoneNumberId,
      daily_limit:         250,
      messages_sent_today: 1,
      next_send_at:        nextSendAt,
      last_reset_at:       today,
    });
  }
}

/** Called by the nightly cron to reset all daily counters. */
export async function resetAllDailyCounts(): Promise<void> {
  const db    = getServerClient();
  const today = new Date().toISOString().slice(0, 10);
  await db
    .from('wa_sender_capacity')
    .update({ messages_sent_today: 0, paused_today: false, last_reset_at: today })
    .lt('last_reset_at', today);
}
