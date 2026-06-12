'use client';

import { useState, useTransition } from 'react';
import { Save, Info } from 'lucide-react';
import { saveProductDefaultsAction } from '@/app/actions/products';

// Popular OpenRouter models — free tier first, then paid
// Full list at https://openrouter.ai/models
const MODEL_SUGGESTIONS = [
  // ── Free tier ──────────────────────────────────────────────────
  'meta-llama/llama-3.1-8b-instruct:free',
  'meta-llama/llama-3.2-11b-vision-instruct:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'nvidia/llama-3.1-nemotron-70b-instruct:free',
  'nvidia/nemotron-3-ultra-253b-v1:free',
  'google/gemma-2-9b-it:free',
  'google/gemini-2.0-flash-exp:free',
  'microsoft/phi-3-mini-128k-instruct:free',
  'qwen/qwen-2-7b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  // ── Paid (high quality) ────────────────────────────────────────
  'anthropic/claude-3.5-haiku',
  'anthropic/claude-sonnet-4-5',
  'anthropic/claude-opus-4',
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'google/gemini-flash-1.5',
  'mistralai/mixtral-8x7b-instruct',
];

export function ProductDefaultsForm({
  slug,
  initialPrompt,
  initialModel,
}: {
  slug: string;
  initialPrompt: string;
  initialModel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [saved,   setSaved]        = useState(false);
  const [error,   setError]        = useState<string | null>(null);
  const [prompt,  setPrompt]       = useState(initialPrompt);
  const [model,   setModel]        = useState(initialModel);

  const isFree = model.endsWith(':free');

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveProductDefaultsAction(slug, prompt, model);
      if ('error' in result && result.error) setError(result.error);
      else { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    });
  }

  return (
    <div className="space-y-4">
      {/* Default Model */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Default AI Model
          </label>
          {model && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${isFree ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
              {isFree ? 'Free tier' : 'Paid'}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400">
          Used when no per-client or per-bot AI Model is configured. Type any{' '}
          <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" className="text-indigo-500 underline">
            OpenRouter model ID
          </a>{' '}
          or pick a suggestion below.
        </p>
        <input
          list={`models-${slug}`}
          value={model}
          onChange={e => setModel(e.target.value)}
          placeholder="e.g. meta-llama/llama-3.1-8b-instruct:free"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
        />
        <datalist id={`models-${slug}`}>
          {MODEL_SUGGESTIONS.map(m => <option key={m} value={m} />)}
        </datalist>
      </div>

      {/* Helper for model name format */}
      <div className="flex items-start gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5">
        <Info size={12} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-500 leading-relaxed">
          OpenRouter format: <code className="font-mono bg-slate-100 px-1 rounded">provider/model-name</code> — add <code className="font-mono bg-slate-100 px-1 rounded">:free</code> suffix for free-tier models.
          Your current platform API key is used for all models configured here.
        </p>
      </div>

      {/* Default System Prompt */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Default System Prompt
        </label>
        <p className="text-xs text-gray-400">
          Clients who haven&apos;t set their own prompt use this. Guardrail rules are appended automatically.
        </p>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={6}
          placeholder="You are a helpful assistant..."
          title="Default system prompt"
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y font-mono"
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Save size={14} />
          {pending ? 'Saving…' : 'Save Defaults'}
        </button>
        {saved && <span className="text-sm text-indigo-600 font-medium">Saved!</span>}
      </div>
    </div>
  );
}
