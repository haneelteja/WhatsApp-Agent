'use client';

import { useState, useTransition } from 'react';
import { Save } from 'lucide-react';
import { saveProductDefaultsAction } from '@/app/actions/products';

const AVAILABLE_MODELS = [
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-7',
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
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Default AI Model</label>
        <p className="text-xs text-gray-400">Used for all clients of this bot type unless they override it.</p>
        <select
          value={model}
          onChange={e => setModel(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          {AVAILABLE_MODELS.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
          {/* Allow showing current model even if not in preset list */}
          {!AVAILABLE_MODELS.includes(model) && (
            <option value={model}>{model}</option>
          )}
        </select>
      </div>

      {/* Default System Prompt */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Default System Prompt</label>
        <p className="text-xs text-gray-400">
          Clients who haven't set their own system prompt will use this.
          It's injected before any guardrail instructions.
        </p>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={6}
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
