// Google Cloud Text-to-Speech Neural2 — ~₹0.05/min.
// Returns base64-encoded MP3 audio for use in Twilio <Play> tags.
// Best for non-Indian languages or when richer voice quality is needed.
// Docs: https://cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize

import type { TtsProvider, SynthesiseParams, SynthesiseResult } from '../../types.js';

interface GoogleTtsConfig {
  api_key:     string;
  voice_name?: string;   // default: 'en-IN-Neural2-A'
}

const GOOGLE_TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';

const LANGUAGE_TO_GOOGLE_VOICE: Record<string, { name: string; gender: string }> = {
  'en-IN': { name: 'en-IN-Neural2-A',  gender: 'FEMALE' },
  'hi-IN': { name: 'hi-IN-Neural2-A',  gender: 'FEMALE' },
  'ta-IN': { name: 'ta-IN-Neural2-A',  gender: 'FEMALE' },
  'te-IN': { name: 'te-IN-Standard-A', gender: 'FEMALE' },
  'kn-IN': { name: 'kn-IN-Standard-A', gender: 'FEMALE' },
  'en-US': { name: 'en-US-Neural2-C',  gender: 'FEMALE' },
};

export function createGoogleTtsProvider(config: GoogleTtsConfig): TtsProvider {
  return {
    name: 'google_tts',

    async synthesise({ text, language, voice, speakingRate }: SynthesiseParams): Promise<SynthesiseResult> {
      const voiceInfo = LANGUAGE_TO_GOOGLE_VOICE[language] ?? LANGUAGE_TO_GOOGLE_VOICE['en-IN']!;
      const voiceName = voice ?? config.voice_name ?? voiceInfo.name;

      const body = {
        input:       { text },
        voice:       { languageCode: language, name: voiceName, ssmlGender: voiceInfo.gender },
        audioConfig: {
          audioEncoding:     'MP3',
          speakingRate:      speakingRate ?? 1.0,
          effectsProfileId:  ['telephony-class-application'],
        },
      };

      const res = await fetch(`${GOOGLE_TTS_URL}?key=${config.api_key}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Google TTS error ${res.status}: ${text.slice(0, 300)}`);
      }

      const json = await res.json() as { audioContent: string };
      return { audioBase64: json.audioContent, audioMimeType: 'audio/mpeg' };
    },

    async validate(): Promise<boolean> {
      return !!config.api_key;
    },
  };
}
