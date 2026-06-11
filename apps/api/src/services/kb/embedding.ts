// Voyage AI embedding service — https://docs.voyageai.com/reference/embeddings-api
// Anthropic's recommended embedding partner. Free tier: 50M tokens/month.
// Model: voyage-3 → 1024-dimensional vectors, optimal for RAG retrieval.

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL   = 'voyage-3';

interface VoyageResponse {
  data: Array<{ embedding: number[] }>;
  usage: { total_tokens: number };
}

/**
 * Generate a 1024-dim embedding vector for a single text string.
 * input_type: 'query'    — for user messages (retrieval queries)
 * input_type: 'document' — for KB entries (indexed content)
 */
export async function generateEmbedding(
  text: string,
  inputType: 'query' | 'document' = 'document'
): Promise<number[]> {
  const apiKey = process.env['VOYAGE_API_KEY'];
  if (!apiKey) {
    console.warn('[Embedding] VOYAGE_API_KEY not set — returning zero vector');
    return new Array(1024).fill(0) as number[];
  }

  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: [text],
      input_type: inputType,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Voyage AI embedding failed (${response.status}): ${err}`);
  }

  const json = (await response.json()) as VoyageResponse;
  return json.data[0]!.embedding;
}

/**
 * Batch-generate embeddings for multiple texts in a single API call.
 * Voyage AI supports up to 128 inputs per request.
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  inputType: 'query' | 'document' = 'document'
): Promise<number[][]> {
  const apiKey = process.env['VOYAGE_API_KEY'];
  if (!apiKey) {
    return texts.map(() => new Array(1024).fill(0) as number[]);
  }

  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: texts,
      input_type: inputType,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Voyage AI batch embedding failed (${response.status}): ${err}`);
  }

  const json = (await response.json()) as VoyageResponse;
  return json.data.map(d => d.embedding);
}
