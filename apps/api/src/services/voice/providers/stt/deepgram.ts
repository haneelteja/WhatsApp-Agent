// Deepgram Nova-2 STT — REST pre-recorded transcription.
// Cost: ~$0.0043/min = ₹0.36/min. Best accuracy for English + Indian English.
// Docs: https://developers.deepgram.com/reference/pre-recorded

import type { SttProvider, TranscribeParams, TranscribeResult } from '../../types.js';

interface DeepgramConfig {
  api_key: string;
  model?:  string;   // default: 'nova-2'
}

const DEEPGRAM_BASE = 'https://api.deepgram.com/v1/listen';

export function createDeepgramProvider(config: DeepgramConfig): SttProvider {
  const model    = config.model ?? 'nova-2';

  return {
    name: 'deepgram',

    async transcribe({ recordingUrl, recordingAuth, audioBuffer, audioMimeType, language }): Promise<TranscribeResult> {
      const params = new URLSearchParams({
        model,
        language:  language.split('-')[0]!,  // Deepgram uses 'en', 'hi' etc.
        punctuate: 'true',
        smart_format: 'true',
        utterances: 'false',
      });

      const url = `${DEEPGRAM_BASE}?${params.toString()}`;
      const headers: Record<string, string> = {
        Authorization: `Token ${config.api_key}`,
      };

      let body: Buffer | string;

      if (audioBuffer) {
        headers['Content-Type'] = audioMimeType ?? 'audio/wav';
        body = audioBuffer;
      } else if (recordingUrl) {
        // Pass URL — Deepgram fetches the audio itself.
        // If recording needs auth (e.g. Twilio), we must download first.
        if (recordingAuth) {
          const audioRes = await fetch(recordingUrl, {
            headers: { Authorization: recordingAuth },
          });
          if (!audioRes.ok) throw new Error(`Failed to fetch recording: ${audioRes.status}`);
          const buf = Buffer.from(await audioRes.arrayBuffer());
          headers['Content-Type'] = audioMimeType ?? 'audio/mpeg';
          body = buf;
        } else {
          headers['Content-Type'] = 'application/json';
          body = JSON.stringify({ url: recordingUrl });
        }
      } else {
        throw new Error('Deepgram: provide recordingUrl or audioBuffer');
      }

      const res = await fetch(url, { method: 'POST', headers, body });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Deepgram error ${res.status}: ${text.slice(0, 300)}`);
      }

      const json = await res.json() as {
        results: {
          channels: Array<{
            alternatives: Array<{ transcript: string; confidence: number }>;
            detected_language?: string;
          }>;
          metadata?: { duration?: number };
        };
        metadata?: { duration?: number };
      };

      const alt        = json.results.channels[0]?.alternatives[0];
      const transcript = alt?.transcript ?? '';
      const confidence = alt?.confidence ?? 0;
      const detectedLang = json.results.channels[0]?.detected_language ?? language;
      const durationMs = Math.round((json.metadata?.duration ?? 0) * 1000);

      return { transcript, confidence, language: detectedLang, durationMs };
    },

    async validate(): Promise<boolean> {
      try {
        const res = await fetch('https://api.deepgram.com/v1/projects', {
          headers: { Authorization: `Token ${config.api_key}` },
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
