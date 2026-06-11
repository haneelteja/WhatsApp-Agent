// Paragraph-aware text chunker for KB document ingestion.
// Target: ~400 tokens per chunk (≈ 1500 chars at ~3.75 chars/token).
// No overlap — each chunk is independent to minimise embedding count.

const MAX_CHUNK_CHARS = 1500;
const MIN_CHUNK_CHARS = 80;

export interface TextChunk {
  title:   string;   // used as knowledge_base.question
  content: string;   // used as knowledge_base.answer
}

export function chunkText(rawText: string, docName: string): TextChunk[] {
  const text = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g,   '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  if (text.length < MIN_CHUNK_CHARS) {
    return text.length ? [{ title: docName, content: text }] : [];
  }

  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length >= MIN_CHUNK_CHARS / 2);
  const chunks: TextChunk[] = [];
  let buffer = '';
  let sectionTitle = '';
  let chunkIndex = 0;

  const flush = () => {
    const trimmed = buffer.trim();
    if (trimmed.length >= MIN_CHUNK_CHARS) {
      chunkIndex++;
      chunks.push({
        title:   sectionTitle || `${docName} — part ${chunkIndex}`,
        content: trimmed,
      });
    }
    buffer = '';
    sectionTitle = '';
  };

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // Detect markdown headings as natural section breaks
    const headingMatch = /^#{1,3}\s+(.+)/.exec(trimmed);
    const isHeading = headingMatch !== null;

    if (isHeading && buffer.length >= MIN_CHUNK_CHARS) {
      flush();
      sectionTitle = (headingMatch![1] ?? '').slice(0, 100);
      buffer = trimmed + '\n\n';
      continue;
    }

    // Para would push buffer over limit — flush first
    if (buffer.length + trimmed.length > MAX_CHUNK_CHARS && buffer.length >= MIN_CHUNK_CHARS) {
      flush();
    }

    // Single paragraph larger than max — split by sentence
    if (trimmed.length > MAX_CHUNK_CHARS) {
      const sentences = trimmed.match(/[^.!?]+[.!?]+[\s]*/g) ?? [trimmed];
      for (const sentence of sentences) {
        if (buffer.length + sentence.length > MAX_CHUNK_CHARS && buffer.length >= MIN_CHUNK_CHARS) {
          flush();
        }
        buffer += sentence;
      }
      continue;
    }

    if (isHeading) sectionTitle = (headingMatch![1] ?? '').slice(0, 100);
    buffer += trimmed + '\n\n';
  }

  flush();

  // If nothing chunked (e.g. single very short doc) return as-is
  if (!chunks.length && text.length) {
    chunks.push({ title: docName, content: text.slice(0, MAX_CHUNK_CHARS) });
  }

  return chunks;
}
