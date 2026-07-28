// Exotel <Say> TTS — completely FREE (included in Exotel call cost).
// Exotel's ExoML <Say> element uses Amazon Polly but only the standard voices
// (Polly.Aditi for Hindi, Polly.Raveena for en-IN) — not Neural/Premium.
// This is the default TTS for the Exotel+Sarvam stack (~₹1.07/min total).

import type { TtsProvider, SynthesiseParams, SynthesiseResult } from '../../types.js';

interface ExotelSayConfig {
  voice?:    string;   // default: 'Polly.Aditi' (Hindi — widely supported on Exotel)
  language?: string;   // default: 'hi-IN'
}

const LANGUAGE_TO_POLLY: Record<string, string> = {
  'hi-IN': 'Polly.Aditi',     // Hindi — standard Polly voice (Exotel-compatible)
  'en-IN': 'Polly.Raveena',   // English-India
  'ta-IN': 'Polly.Aditi',     // Tamil (fallback to Aditi)
  'te-IN': 'Polly.Aditi',
  'kn-IN': 'Polly.Aditi',
  'mr-IN': 'Polly.Aditi',
  'en-US': 'Polly.Joanna',
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function createExotelSayProvider(config: ExotelSayConfig = {}): TtsProvider {
  return {
    name: 'exotel_say',

    async synthesise({ text, language, voice }: SynthesiseParams): Promise<SynthesiseResult> {
      const resolvedVoice =
        voice ??
        config.voice ??
        LANGUAGE_TO_POLLY[language] ??
        LANGUAGE_TO_POLLY['hi-IN']!;

      const safeText = escapeXml(text);
      const twimlSaySnippet = `<Say voice="${resolvedVoice}" language="${language}">${safeText}</Say>`;

      return { twimlSaySnippet };
    },

    async validate(): Promise<boolean> {
      return true;
    },
  };
}
