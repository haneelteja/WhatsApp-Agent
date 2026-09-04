'use client';

import { useState, useTransition } from 'react';
import { Plus, X, Save } from 'lucide-react';
import { createBotProductAction } from '@/app/actions/products';

const MODEL_SUGGESTIONS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'nvidia/llama-3.1-nemotron-70b-instruct:free',
  'anthropic/claude-3.5-haiku',
  'anthropic/claude-sonnet-4-5',
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'google/gemini-flash-1.5',
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/, '')
    .replace(/_+/g, '_');
}

export function AddProductModal() {
  const [open,       setOpen]       = useState(false);
  const [pending,    startTx]       = useTransition();
  const [error,      setError]      = useState<string | null>(null);
  const [name,       setName]       = useState('');
  const [slug,       setSlug]       = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [model,      setModel]      = useState('meta-llama/llama-3.3-70b-instruct:free');
  const [prompt,     setPrompt]     = useState('');

  function handleNameChange(val: string) {
    setName(val);
    if (!slugEdited) setSlug(slugify(val));
  }

  function handleSlugChange(val: string) {
    setSlugEdited(true);
    setSlug(val.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  }

  function reset() {
    setName(''); setSlug(''); setSlugEdited(false);
    setDescription(''); setModel('meta-llama/llama-3.3-70b-instruct:free');
    setPrompt(''); setError(null);
  }

  function handleClose() {
    if (pending) return;
    reset();
    setOpen(false);
  }

  function handleSave() {
    setError(null);
    startTx(async () => {
      const result = await createBotProductAction({
        name, slug, description, default_prompt: prompt, default_model: model,
      });
      if (result.error) { setError(result.error); return; }
      handleClose();
    });
  }

  const canSave = !pending && name.trim() && slug.trim() && model.trim() && prompt.trim();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
      >
        <Plus size={14} />
        Add Product
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">Add New Product</h2>
              <button type="button" onClick={handleClose} disabled={pending}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
                aria-label="Close">
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4 max-h-[68vh] overflow-y-auto">

              {/* Name */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Product Name <span className="text-red-400">*</span>
                </label>
                <input
                  value={name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="e.g. Booking Bot"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* Slug */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Slug <span className="text-red-400">*</span>
                </label>
                <p className="text-xs text-slate-400">Unique identifier — auto-generated from name; lowercase letters, numbers, underscores only</p>
                <input
                  value={slug}
                  onChange={e => handleSlugChange(e.target.value)}
                  placeholder="booking_bot"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Description
                </label>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Short description of what this bot does"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* Default AI Model */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Default AI Model <span className="text-red-400">*</span>
                </label>
                <p className="text-xs text-slate-400">
                  OpenRouter format: <code className="font-mono bg-slate-100 px-1 rounded">provider/model-name</code> — add <code className="font-mono bg-slate-100 px-1 rounded">:free</code> for free-tier
                </p>
                <input
                  list="add-product-models"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  placeholder="meta-llama/llama-3.3-70b-instruct:free"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
                />
                <datalist id="add-product-models">
                  {MODEL_SUGGESTIONS.map(m => <option key={m} value={m} />)}
                </datalist>
              </div>

              {/* Default System Prompt */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Default System Prompt <span className="text-red-400">*</span>
                </label>
                <p className="text-xs text-slate-400">Used for all clients until they configure their own prompt</p>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  rows={5}
                  placeholder="You are a helpful assistant..."
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y font-mono"
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button type="button" onClick={handleClose} disabled={pending}
                className="px-4 py-2 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                <Save size={13} />
                {pending ? 'Creating…' : 'Create Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
