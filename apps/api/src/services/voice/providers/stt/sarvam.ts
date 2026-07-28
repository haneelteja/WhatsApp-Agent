// Sarvam AI STT — India-native, Hindi + 10 regional Indian languages.
// Cheapest for Indian language calls. Cost: ~₹0.25/min.
// Docs: https://docs.sarvam.ai/api-reference-docs/speech-to-text

import type { SttProvider, TranscribeParams, TranscribeResult } from '../../types.js';

interface SarvamConfig {
  api_key:       string;
  model?:        string;   // default: 'saaras:v2'
  language_code?: string;  // default: 'hi-IN'
}

export function createSarvamSttProvider(config: SarvamConfig): SttProvider {
  const model         = config.model ?? 'saaras:v2';

  return {
    name: 'sarvam',

    async transcribe({ recordingUrl, recordingAuth, audioBuffer, audioMimeType, language }): Promise<TranscribeResult> {
      // Sarvam expects multipart/form-data with file upload
      const form = new FormData();

      if (audioBuffer) {
        const blob = new Blob([audioBuffer], { type: audioMimeType ?? 'audio/wav' });
        form.append('file', blob, 'audio.wav');
      } else if (recordingUrl) {
        // Fetch audio first (Sarvam doesn't support URL input)
        const fetchHeaders: Record<string, string> = {};
        if (recordingAuth) fetchHeaders['Authorization'] = recordingAuth;
        const audioRes = await fetch(recordingUrl, { headers: fetchHeaders });
        if (!audioRes.ok) throw new Error(`Failed to fetch recording for Sarvam: ${audioRes.status}`);
        const buf = Buffer.from(await audioRes.arrayBuffer());
        const blob = new Blob([buf], { type: audioMimeType ?? 'audio/mpeg' });
        form.append('file', blob, 'audio.mp3');
      } else {
        throw new Error('Sarvam STT: provide recordingUrl or audioBuffer');
      }

      form.append('model', model);
      form.append('language_code', language ?? config.language_code ?? 'hi-IN');
      form.append('with_timestamps', 'false');
      form.append('with_disfluencies', 'false');

      const res = await fetch('https://api.sarvam.ai/speech-to-text', {
        method:  'POST',
        headers: { 'api-subscription-key': config.api_key },
        body:    form,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Sarvam STT error ${res.status}: ${text.slice(0, 300)}`);
      }

      const json = await res.json() as { transcript: string; language_code?: string; disfluencies?: unknown[] };

      return {
        transcript:  json.transcript ?? '',
        confidence:  0.9,   // Sarvam doesn't return confidence scores
        language:    json.language_code ?? language,
        durationMs:  0,
      };
    },

    async validate(): Promise<boolean> {
      return !!config.api_key;  // no lightweight ping endpoint available
    },
  };
}
