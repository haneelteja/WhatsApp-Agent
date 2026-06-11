// Extract structured text from images via OpenRouter's free vision models.
// Default: meta-llama/llama-3.2-11b-vision-instruct:free (zero cost, ~200 req/day).
// Override with OPENROUTER_VISION_MODEL env var if you need higher throughput.

import { chatCompletion, VISION_MODEL } from '../../lib/openrouter.js';

const SUPPORTED_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']);

export async function extractImageContent(
  imageBuffer: Buffer,
  mimeType:    string,
): Promise<string> {
  const normalized = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
  if (!SUPPORTED_MIMES.has(normalized)) {
    throw new Error(`Unsupported image MIME type: ${mimeType}`);
  }

  // OpenRouter vision models accept base64 data URIs
  const dataUrl = `data:${normalized};base64,${imageBuffer.toString('base64')}`;

  const { content } = await chatCompletion({
    model:      VISION_MODEL,
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: dataUrl } },
        {
          type: 'text',
          text: 'Extract all text, tables, labels, and key facts from this image. Output only the extracted information, structured and concise. No commentary.',
        },
      ],
    }],
  });

  return content.trim();
}
