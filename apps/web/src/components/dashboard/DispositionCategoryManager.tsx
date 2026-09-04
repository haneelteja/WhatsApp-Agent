'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2, Check, X } from 'lucide-react';
import type { DispositionCategory } from '@/app/actions/disposition';
import {
  createDispositionCategoryAction,
  deleteDispositionCategoryAction,
  updateDispositionCategoryAction,
} from '@/app/actions/disposition';

const PRESET_COLORS = [
  '#6B7280', '#EF4444', '#F59E0B', '#10B981',
  '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6',
];

interface Props {
  initialCategories: DispositionCategory[];
}

export function DispositionCategoryManager({ initialCategories }: Props) {
  const [categories, setCategories] = useState<DispositionCategory[]>(initialCategories);
  const [showForm, setShowForm]     = useState(false);
  const [name, setName]             = useState('');
  const [color, setColor]           = useState('#6B7280');
  const [description, setDescription] = useState('');
  const [error, setError]           = useState('');
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editName, setEditName]     = useState('');
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (!name.trim()) { setError('Name is required'); return; }
    setError('');
    startTransition(async () => {
      const res = await createDispositionCategoryAction(name.trim(), color, description.trim());
      if (res.error) { setError(res.error); return; }
      // Optimistic: refetch by reloading page or just push to local state
      const newCat: DispositionCategory = {
        id: crypto.randomUUID(),
        name: name.trim(),
        color,
        description: description.trim() || null,
        sort_order: categories.length,
      };
      setCategories(prev => [...prev, newCat]);
      setName(''); setColor('#6B7280'); setDescription(''); setShowForm(false);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteDispositionCategoryAction(id);
      setCategories(prev => prev.filter(c => c.id !== id));
    });
  }

  function startEdit(cat: DispositionCategory) {
    setEditingId(cat.id);
    setEditName(cat.name);
  }

  function saveEdit(id: string) {
    if (!editName.trim()) return;
    startTransition(async () => {
      await updateDispositionCategoryAction(id, { name: editName.trim() });
      setCategories(prev => prev.map(c => c.id === id ? { ...c, name: editName.trim() } : c));
      setEditingId(null);
    });
  }

  return (
    <div className="space-y-3">
      {/* Category list */}
      {categories.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">No categories yet. Add one below.</p>
      ) : (
        <div className="space-y-2">
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 group">
              <span
                className="w-3 h-3 rounded-full shrink-0 border"
                style={{ background: cat.color, borderColor: cat.color }}
              />
              {editingId === cat.id ? (
                <>
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(cat.id); if (e.key === 'Escape') setEditingId(null); }}
                    className="flex-1 text-xs border border-emerald-400 rounded-lg px-2 py-1 focus:outline-none"
                    autoFocus
                  />
                  <button onClick={() => saveEdit(cat.id)} disabled={isPending} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40">
                    <Check size={14} />
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => startEdit(cat)}
                    className="flex-1 text-left text-xs font-medium text-gray-700 hover:text-emerald-700 transition-colors"
                  >
                    {cat.name}
                    {cat.description && (
                      <span className="ml-2 text-[10px] text-gray-400 font-normal">{cat.description}</span>
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(cat.id)}
                    disabled={isPending}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all disabled:opacity-30"
                    title="Delete category"
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showForm ? (
        <div className="border border-emerald-100 rounded-xl p-3 bg-emerald-50/30 space-y-2">
          <input
            placeholder="Category name *"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowForm(false); }}
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 bg-white"
            autoFocus
          />
          <input
            placeholder="Short description (optional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 bg-white"
          />
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500">Color:</span>
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-transform ${color === c ? 'scale-125' : 'hover:scale-110'}`}
                style={{ background: c, borderColor: color === c ? c : 'transparent' }}
                title={c}
              />
            ))}
          </div>
          {error && <p className="text-[11px] text-red-500">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={isPending || !name.trim()}
              className="text-xs font-semibold bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
            >
              {isPending ? 'Saving…' : 'Add category'}
            </button>
            <button
              onClick={() => { setShowForm(false); setName(''); setError(''); }}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
        >
          <Plus size={13} />
          Add category
        </button>
      )}
    </div>
  );
}
