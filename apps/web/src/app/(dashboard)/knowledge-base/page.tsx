'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { BookOpen, Plus, Pencil, Trash2, Search, X } from 'lucide-react';

interface KBEntry {
  id: string;
  category: string;
  question: string;
  answer: string;
  status: string;
  product_type: string;
}

const EMPTY_FORM = {
  category: '',
  question: '',
  answer: '',
  product_type: 'support_bot',
  status: 'live',
};

const PRODUCT_OPTIONS = [
  { value: 'support_bot',   label: 'Support Bot' },
  { value: 'sales_bot',     label: 'Sales Bot' },
  { value: 'lifecycle_bot', label: 'Lifecycle Bot' },
];

const PRODUCT_COLORS: Record<string, string> = {
  support_bot:   'bg-sky-50 text-sky-600',
  sales_bot:     'bg-violet-50 text-violet-600',
  lifecycle_bot: 'bg-orange-50 text-orange-600',
};

export default function KnowledgeBasePage() {
  const [entries,   setEntries]   = useState<KBEntry[]>([]);
  const [filtered,  setFiltered]  = useState<KBEntry[]>([]);
  const [search,    setSearch]    = useState('');
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [editing,   setEditing]   = useState<KBEntry | null>(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);

  const supabase = getSupabaseBrowserClient();

  async function loadEntries() {
    const { data } = await supabase
      .from('knowledge_base')
      .select('id, category, question, answer, status, product_type')
      .order('category', { ascending: true });
    const list = data ?? [];
    setEntries(list);
    setFiltered(list);
    setLoading(false);
  }

  useEffect(() => { void loadEntries(); }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      q
        ? entries.filter(
            (e) =>
              e.question.toLowerCase().includes(q) ||
              e.answer.toLowerCase().includes(q) ||
              e.category.toLowerCase().includes(q)
          )
        : entries
    );
  }, [search, entries]);

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(entry: KBEntry) {
    setEditing(entry);
    setForm({
      category: entry.category,
      question: entry.question,
      answer: entry.answer,
      product_type: entry.product_type,
      status: entry.status,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.question.trim() || !form.answer.trim()) return;
    setSaving(true);
    if (editing) {
      await supabase.from('knowledge_base').update(form as never).eq('id', editing.id);
    } else {
      await supabase.from('knowledge_base').insert(form as never);
    }
    setSaving(false);
    setShowForm(false);
    void loadEntries();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this entry?')) return;
    await supabase.from('knowledge_base').delete().eq('id', id);
    void loadEntries();
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Knowledge Base</h2>
          <p className="text-sm text-gray-500 mt-0.5">Q&amp;A entries that power your AI bots</p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold shadow-sm shadow-emerald-200 shrink-0"
        >
          <Plus size={15} />
          Add Entry
        </button>
      </div>

      {/* Search bar */}
      {!loading && entries.length > 0 && (
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entries…"
            className="w-full pl-9 pr-9 py-2.5 text-sm rounded-xl border border-green-200 bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent shadow-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 border border-green-100">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">
                {editing ? 'Edit Entry' : 'New Knowledge Base Entry'}
              </h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label="Close"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">Category</label>
                <input
                  className="w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g. Shipping"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">Bot</label>
                <select
                  aria-label="Bot type"
                  className="w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.product_type}
                  onChange={(e) => setForm({ ...form, product_type: e.target.value })}
                >
                  {PRODUCT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">Question</label>
              <input
                className="w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
                placeholder="What is your return policy?"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">Answer</label>
              <textarea
                className="w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                rows={4}
                value={form.answer}
                onChange={(e) => setForm({ ...form, answer: e.target.value })}
                placeholder="We accept returns within 30 days of purchase…"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-sm px-4 py-2.5 rounded-xl border border-green-200 text-gray-600 hover:bg-green-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="text-sm px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold disabled:opacity-50 shadow-sm shadow-emerald-200"
              >
                {saving ? 'Saving…' : 'Save Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !entries.length && (
        <div className="bg-white rounded-2xl border border-green-100 shadow-sm flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mb-4 border border-green-100">
            <BookOpen size={28} className="text-green-400" />
          </div>
          <p className="text-sm font-semibold text-gray-600">No entries yet</p>
          <p className="text-xs text-gray-400 mt-1">Add Q&amp;As to help the bot answer accurately.</p>
        </div>
      )}

      {/* Table */}
      {!loading && entries.length > 0 && (
        <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
          <div className="px-6 py-3 border-b border-green-50 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
              {search && ` matching "${search}"`}
            </p>
          </div>
          <div className="divide-y divide-green-50">
            {filtered.map((entry) => (
              <div key={entry.id} className="flex items-start gap-4 px-6 py-4 hover:bg-green-50/50 transition-colors group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    {entry.category && (
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 font-medium">
                        {entry.category}
                      </span>
                    )}
                    <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${PRODUCT_COLORS[entry.product_type] ?? 'bg-gray-100 text-gray-500'}`}>
                      {PRODUCT_OPTIONS.find((o) => o.value === entry.product_type)?.label ?? entry.product_type}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{entry.question}</p>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{entry.answer}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => openEdit(entry)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                    aria-label="Edit entry"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(entry.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    aria-label="Delete entry"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
