import type { TelephonyProvider, OutboundCallParams, OutboundCallResult } from '../../types.js';
import type { VoiceCallStatus } from '@alphabot/shared';

interface TwilioConfig {
  account_sid: string;
  auth_token:  string;
}

const TWILIO_BASE = 'https://api.twilio.com/2010-04-01';

function basicAuth(sid: string, token: string): string {
  return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
}

async function twilioRequest(
  sid: string,
  token: string,
  method: 'POST' | 'GET' | 'DELETE',
  path: string,
  body?: Record<string, string>,
): Promise<unknown> {
  const url = `${TWILIO_BASE}/Accounts/${sid}${path}`;
  const headers: Record<string, string> = { Authorization: basicAuth(sid, token) };

  let fetchBody: string | undefined;
  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    fetchBody = new URLSearchParams(body).toString();
  }

  const res = await fetch(url, { method, headers, body: fetchBody });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function mapTwilioStatus(status: string): VoiceCallStatus {
  switch (status) {
    case 'queued':
    case 'initiated': return 'initiated';
    case 'ringing':   return 'ringing';
    case 'in-progress': return 'in_progress';
    case 'completed':   return 'completed';
    case 'failed':      return 'failed';
    case 'busy':        return 'busy';
    case 'no-answer':   return 'no_answer';
    default:            return 'initiated';
  }
}

export function createTwilioProvider(config: TwilioConfig): TelephonyProvider {
  const { account_sid, auth_token } = config;

  return {
    name: 'twilio',

    async dispatch({ to, from, twimlUrl, statusCallback }): Promise<OutboundCallResult> {
      const data = await twilioRequest(account_sid, auth_token, 'POST', '/Calls.json', {
        To:             to,
        From:           from,
        Url:            twimlUrl,
        StatusCallback: statusCallback,
        StatusCallbackMethod: 'POST',
        StatusCallbackEvent: 'initiated ringing answered completed',
        // Enable recording — Twilio sends RecordingUrl in the status callback when done
        Record:                  'true',
        RecordingStatusCallback: statusCallback,
        RecordingStatusCallbackMethod: 'POST',
        Timeout:        '30',   // ring for 30s before no-answer
      }) as { sid: string; status: string };

      return {
        callSid: data.sid,
        status:  mapTwilioStatus(data.status),
      };
    },

    async hangup(callSid): Promise<void> {
      await twilioRequest(account_sid, auth_token, 'POST', `/Calls/${callSid}.json`, {
        Status: 'completed',
      });
    },

    async validate(): Promise<boolean> {
      try {
        await twilioRequest(account_sid, auth_token, 'GET', '.json');
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Download a Twilio recording as a Buffer (requires Twilio auth). */
export async function fetchTwilioRecording(
  recordingUrl: string,
  accountSid: string,
  authToken: string,
): Promise<Buffer> {
  const res = await fetch(recordingUrl, {
    headers: { Authorization: basicAuth(accountSid, authToken) },
  });
  if (!res.ok) throw new Error(`Failed to fetch Twilio recording: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
