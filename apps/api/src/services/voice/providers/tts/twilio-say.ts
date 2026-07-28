// Twilio <Say> TTS — completely FREE (included in Twilio call cost).
// Returns a TwiML <Say> snippet which the voice pipeline embeds in the response.
// Supports Amazon Polly voices with Neural engine for natural sound.
// Indian voices: Polly.Aditi (hi-IN), Polly.Raveena (en-IN), Polly.Kajal (hi-IN Neural)

import type { TtsProvider, SynthesiseParams, SynthesiseResult } from '../../types.js';

interface TwilioSayConfig {
  voice?:           string;   // default: 'Polly.Aditi' (Hindi, Indian English)
  language?:        string;   // default: 'hi-IN'
  fallback_voice?:  string;   // used if primary voice doesn't support the language
}

/** Maps BCP-47 language codes to Polly voice names (best Indian voices). */
const LANGUAGE_TO_POLLY: Record<string, string> = {
  'hi-IN': 'Polly.Kajal',       // Hindi — Neural, high quality
  'en-IN': 'Polly.Raveena',     // English-India
  'ta-IN': 'Polly.Aditi',       // Tamil fallback (Aditi is multi-lingual)
  'te-IN': 'Polly.Aditi',       // Telugu fallback
  'kn-IN': 'Polly.Aditi',       // Kannada fallback
  'mr-IN': 'Polly.Aditi',       // Marathi fallback
  'en-US': 'Polly.Joanna',
  'en-GB': 'Polly.Amy',
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function createTwilioSayProvider(config: TwilioSayConfig = {}): TtsProvider {
  return {
    name: 'twilio_say',

    async synthesise({ text, language, voice }: SynthesiseParams): Promise<SynthesiseResult> {
      const resolvedVoice =
        voice ??
        config.voice ??
        LANGUAGE_TO_POLLY[language] ??
        LANGUAGE_TO_POLLY['en-IN']!;

      const safeText = escapeXml(text);

      // Return a TwiML <Say> snippet. The pipeline wraps this in a <Response>.
      const twimlSaySnippet = `<Say voice="${resolvedVoice}" language="${language}">${safeText}</Say>`;

      return { twimlSaySnippet };
    },

    async validate(): Promise<boolean> {
      return true;  // always available — no credentials required
    },
  };
}
