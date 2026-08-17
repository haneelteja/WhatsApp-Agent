// LLM cost estimation in INR.
// Prices are in USD per 1,000,000 tokens; converted to INR at runtime.

// USD per 1M tokens for known models
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-haiku-4-5-20251001':   { input: 0.80,  output: 4.00  },
  'claude-haiku-3-5-20241022':   { input: 0.80,  output: 4.00  },
  'claude-3-5-haiku-20241022':   { input: 0.80,  output: 4.00  },
  'claude-sonnet-4-6':           { input: 3.00,  output: 15.00 },
  'claude-sonnet-5':             { input: 3.00,  output: 15.00 },
  'claude-3-5-sonnet-20241022':  { input: 3.00,  output: 15.00 },
  'claude-opus-5':               { input: 15.00, output: 75.00 },
  // OpenAI
  'gpt-4o-mini':                 { input: 0.15,  output: 0.60  },
  'gpt-4o':                      { input: 2.50,  output: 10.00 },
  'gpt-4-turbo':                 { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo':               { input: 0.50,  output: 1.50  },
  // Google Gemini
  'gemini-2.0-flash':            { input: 0.10,  output: 0.40  },
  'gemini-1.5-flash':            { input: 0.075, output: 0.30  },
  'gemini-1.5-pro':              { input: 3.50,  output: 10.50 },
  'gemini-2.5-pro':              { input: 3.50,  output: 10.50 },
};

// Fallback when model is unknown — use cheapest known model to avoid inflating cost
const FALLBACK_MODEL = 'claude-haiku-4-5-20251001';

function getUsdToInr(): number {
  const v = parseFloat(process.env['USD_TO_INR'] ?? '');
  return Number.isFinite(v) && v > 0 ? v : 84;
}

export function calcCostInr(
  inputTokens:  number,
  outputTokens: number,
  model:        string,
): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[FALLBACK_MODEL]!;
  const costUsd = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
  return parseFloat((costUsd * getUsdToInr()).toFixed(6));
}
