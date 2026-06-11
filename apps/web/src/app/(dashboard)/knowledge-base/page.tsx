'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, BookOpen, Trash2, ChevronRight, X } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { kbFetch } from '@/lib/kb-client';

interface CollectionRow {
  id: string;
  name: string;
  description: string | null;
  entry_count: number;
  active: boolean;
  created_at: string;
  kb_collection_bots: { product_slug: string }[];
}

const BOT_PILL: Record<string, string> = {
  support_bot:   'bg-sky-50 text-sky-600 border-sky-200',
  sales_bot:     'bg-violet-50 text-violet-600 border-violet-200',
  lifecycle_bot: 'bg-orange-50 text-orange-600 border-orange-200',
};
const BOT_LABEL: Record<string, string> = {
  support_bot: 'Support', sales_bot: 'Sales', lifecycle_bot: 'Lifecycle',
};

export default function KnowledgeBasePage() {
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showNew,     setShowNew]     = useState(false);
  const [form,        setForm]        = useState({ name: '', description: '' });
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');

  const supabase = getSupabaseBrowserClient();

  async function load() {
    const { data } = await supabase
      .from('kb_collections')
      .select('*, kb_collection_bots(product_slug)')
      .order('created_at', { ascending: false });
    setCollections((data ?? []) as CollectionRow[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate() {
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    const res = await kbFetch('/api/kb/collections', {
      method: 'POST',
      body: JSON.stringify({ name: form.name.trim(), description: form.description.trim() || undefined }),
    });
    if (!res.ok) {
      setError((await res.json() as { error?: string }).error ?? 'Failed to create');
      setSaving(false);
      return;
    }
    setSaving(false);
    setShowNew(false);
    setForm({ name: '', description: '' });
    void load();
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    if (!confirm('Delete this collection and all its entries? This cannot be undone.')) return;
    await kbFetch(`/api/kb/collections/${id}`, { method: 'DELETE' });
    void load();
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Knowledge Base</h2>
          <p className="text-sm text-gray-500 mt-0.5">Collections of Q&amp;A entries that power your AI bots</p>
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold shadow-sm shadow-emerald-200 shrink-0"
        >
          <Plus size={15} />
          New Collection
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!loading && !collections.length && (
        <div className="bg-white rounded-2xl border border-green-100 shadow-sm flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mb-4 border border-green-100">
            <BookOpen size={28} className="text-green-400" />
          </div>
          <p className="text-sm font-semibold text-gray-600">No collections yet</p>
          <p className="text-xs text-gray-400 mt-1 mb-4">Create a collection and assign it to a bot to get started.</p>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="text-sm px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold"
          >
            Create your first collection
          </button>
        </div>
      )}

      {/* Grid */}
      {!loading && collections.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {collections.map((col) => (
            <div key={col.id} className="relative bg-white rounded-2xl border border-green-100 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all group">
              <Link href={`/knowledge-base/${col.id}`} className="block p-5 pr-10">
                {/* Icon + status */}
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                    <BookOpen size={16} className="text-emerald-600" />
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${col.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                    {col.active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {/* Name + description */}
                <p className="font-semibold text-gray-900 text-sm">{col.name}</p>
                {col.description && (
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{col.description}</p>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-green-50">
                  <p className="text-xs text-gray-400">
                    <span className="font-semibold text-gray-700">{col.entry_count}</span>{' '}
                    {col.entry_count === 1 ? 'entry' : 'entries'}
                  </p>
                  <div className="flex items-center gap-1 flex-wrap justify-end">
                    {col.kb_collection_bots.length ? (
                      col.kb_collection_bots.map((b) => (
                        <span key={b.product_slug} className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${BOT_PILL[b.product_slug] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                          {BOT_LABEL[b.product_slug] ?? b.product_slug}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-gray-300 italic">no bots</span>
                    )}
                  </div>
                </div>
              </Link>

              {/* Hover actions */}
              <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => void handleDelete(col.id, e)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:bg-red-50 hover:text-red-400 transition-colors"
                  aria-label="Delete collection"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <ChevronRight size={14} className="absolute bottom-5 right-4 text-gray-200 group-hover:text-emerald-400 transition-colors" />
            </div>
          ))}
        </div>
      )}

      {/* New Collection Modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-green-100">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">New Collection</h2>
              <button type="button" aria-label="Close" onClick={() => { setShowNew(false); setError(''); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">Name <span className="text-red-400">*</span></label>
                <input
                  autoFocus
                  className="w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
                  placeholder="e.g. Support FAQ"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">Description <span className="text-gray-300">(optional)</span></label>
                <input
                  className="w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What this collection covers…"
                />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => { setShowNew(false); setError(''); }} className="text-sm px-4 py-2.5 rounded-xl border border-green-200 text-gray-600 hover:bg-green-50 transition-colors font-medium">
                Cancel
              </button>
              <button type="button" onClick={() => void handleCreate()} disabled={saving || !form.name.trim()} className="text-sm px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold disabled:opacity-50 shadow-sm shadow-emerald-200">
                {saving ? 'Creating…' : 'Create Collection'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
