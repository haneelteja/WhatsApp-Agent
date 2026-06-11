// Extract structured text from images using Claude Haiku vision.
// Haiku is the cheapest model — keeps cost minimal for image ingestion.
// Max 400 output tokens per image (just the facts, no prose).

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

type SupportedMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

const SUPPORTED_MIMES = new Set<string>(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']);

export async function extractImageContent(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  const normalized = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
  if (!SUPPORTED_MIMES.has(normalized)) {
    throw new Error(`Unsupported image MIME type: ${mimeType}`);
  }

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: [
        {
          type:   'image',
          source: {
            type:       'base64',
            media_type: normalized as SupportedMime,
            data:       imageBuffer.toString('base64'),
          },
        },
        {
          type: 'text',
          text: 'Extract all text, tables, labels, and key facts from this image. Output only the extracted information, structured and concise. No commentary.',
        },
      ],
    }],
  });

  const block = response.content[0];
  return block?.type === 'text' ? block.text.trim() : '';
}
