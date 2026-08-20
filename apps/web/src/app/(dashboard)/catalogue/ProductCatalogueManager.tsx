'use client';

import { useState, useTransition } from 'react';
import {
  Plus, Pencil, Trash2, Loader2, Check, X,
  Package, IndianRupee, Tag, Hash, Info,
} from 'lucide-react';
import {
  createProductAction,
  updateProductAction,
  deleteProductAction,
} from '@/app/actions/products';
import type { ProductCatalogueItem } from '@alphabot/shared';

// ── helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number | null): string {
  if (n === null) return '—';
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

// ── sub-components ─────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  description: string;
  price_inr: string;
  category: string;
  sku: string;
}

const EMPTY_FORM: FormState = { name: '', description: '', price_inr: '', category: '', sku: '' };

function parsePrice(s: string): number | null {
  const v = parseFloat(s.replace(/,/g, ''));
  return isNaN(v) || v < 0 ? null : v;
}

function ProductForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: FormState;
  onSave: (f: FormState) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [f, setF] = useState(initial);
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {/* Name */}
      <div className="sm:col-span-2">
        <label className="block text-xs font-semibold text-slate-600 mb-1">Product name *</label>
        <input
          autoFocus
          value={f.name}
          onChange={set('name')}
          placeholder="e.g. Premium Water Pump"
          className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
      </div>

      {/* SKU */}
      <div>
        <label className="flex items-center gap-1 text-xs font-semibold text-slate-600 mb-1">
          <Hash size={10} /> SKU / Code
        </label>
        <input
          value={f.sku}
          onChange={set('sku')}
          placeholder="e.g. PUMP-001"
          className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
      </div>

      {/* Category */}
      <div>
        <label className="flex items-center gap-1 text-xs font-semibold text-slate-600 mb-1">
          <Tag size={10} /> Category
        </label>
        <input
          value={f.category}
          onChange={set('category')}
          placeholder="e.g. Pumps, Tanks"
          className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
      </div>

      {/* Price */}
      <div>
        <label className="flex items-center gap-1 text-xs font-semibold text-slate-600 mb-1">
          <IndianRupee size={10} /> Price (INR)
        </label>
        <input
          type="number"
          min={0}
          step={0.01}
          value={f.price_inr}
          onChange={set('price_inr')}
          placeholder="e.g. 45000"
          className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
      </div>

      {/* Description */}
      <div className="sm:col-span-2">
        <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
        <textarea
          rows={2}
          value={f.description}
          onChange={set('description')}
          placeholder="Short product description shown to the bot and in the WhatsApp catalogue message"
          className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
      </div>

      {/* Actions */}
      <div className="sm:col-span-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSave(f)}
          disabled={saving || !f.name.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          <X size={13} /> Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ProductCatalogueManager({ initialProducts }: { initialProducts: ProductCatalogueItem[] }) {
  const [products, setProducts] = useState<ProductCatalogueItem[]>(initialProducts);
  const [showAdd,   setShowAdd]   = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [, startTransition]       = useTransition();
  const [saving, setSaving]       = useState(false);
  const [toggling, setToggling]   = useState<string | null>(null);

  // ── Add ──────────────────────────────────────────────────────────────────────

  async function handleAdd(f: FormState) {
    if (!f.name.trim()) return;
    setSaving(true);
    setError(null);

    const result = await createProductAction({
      name:        f.name.trim(),
      description: f.description.trim() || undefined,
      price_inr:   parsePrice(f.price_inr),
      category:    f.category.trim() || undefined,
      sku:         f.sku.trim() || undefined,
    });

    setSaving(false);
    if (result.error) { setError(result.error); return; }
    startTransition(() => {
      if (result.product) setProducts(prev => [...prev, result.product!]);
      setShowAdd(false);
    });
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────

  async function handleEdit(id: string, f: FormState) {
    setSaving(true);
    setError(null);

    const result = await updateProductAction(id, {
      name:        f.name.trim(),
      description: f.description.trim() || null,
      price_inr:   parsePrice(f.price_inr),
      category:    f.category.trim() || null,
      sku:         f.sku.trim() || null,
    });

    setSaving(false);
    if (result.error) { setError(result.error); return; }
    startTransition(() => {
      setProducts(prev => prev.map(p =>
        p.id === id
          ? {
              ...p,
              name:        f.name.trim(),
              description: f.description.trim() || null,
              price_inr:   parsePrice(f.price_inr),
              category:    f.category.trim() || null,
              sku:         f.sku.trim() || null,
            }
          : p,
      ));
      setEditingId(null);
    });
  }

  // ── Toggle active ─────────────────────────────────────────────────────────────

  async function handleToggle(p: ProductCatalogueItem) {
    setToggling(p.id);
    const result = await updateProductAction(p.id, { active: !p.active });
    setToggling(null);
    if (result.error) { setError(result.error); return; }
    startTransition(() =>
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, active: !x.active } : x))
    );
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    setDeletingId(id);
    const result = await deleteProductAction(id);
    setDeletingId(null);
    if (result.error) { setError(result.error); return; }
    startTransition(() => setProducts(prev => prev.filter(p => p.id !== id)));
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const activeCount = products.filter(p => p.active).length;

  return (
    <div className="space-y-4">

      {/* Info banner */}
      <div className="flex items-start gap-2.5 bg-violet-50 border border-violet-100 rounded-xl px-4 py-3">
        <Info size={14} className="text-violet-500 mt-0.5 shrink-0" />
        <div className="text-[12px] text-violet-700 space-y-0.5">
          <p><strong>{activeCount} active product{activeCount !== 1 ? 's' : ''}</strong> are currently visible to the sales bot.</p>
          <p>The bot will quote exact prices and can send a formatted product list when a customer asks.</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">
          <X size={13} className="shrink-0" />
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto"><X size={12} /></button>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">
          {products.length} product{products.length !== 1 ? 's' : ''}
        </p>
        {!showAdd && (
          <button
            type="button"
            onClick={() => { setShowAdd(true); setEditingId(null); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
          >
            <Plus size={14} /> Add product
          </button>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white border border-violet-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-violet-700 mb-3 flex items-center gap-1.5">
            <Package size={12} /> New product
          </p>
          <ProductForm
            initial={EMPTY_FORM}
            onSave={f => void handleAdd(f)}
            onCancel={() => setShowAdd(false)}
            saving={saving}
          />
        </div>
      )}

      {/* Product list */}
      {products.length === 0 && !showAdd ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl px-6 py-12 text-center">
          <Package size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-500">No products yet</p>
          <p className="text-xs text-slate-400 mt-1">Add your first product and the sales bot will start quoting prices in chat.</p>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
          >
            <Plus size={14} /> Add product
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="divide-y divide-slate-50">
            {products.map((p, i) => (
              <div key={p.id} className={`${i % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}`}>

                {/* Row — normal view */}
                {editingId !== p.id ? (
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Active toggle */}
                    <button
                      type="button"
                      onClick={() => void handleToggle(p)}
                      disabled={toggling === p.id}
                      title={p.active ? 'Click to deactivate' : 'Click to activate'}
                      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-1 ${
                        p.active ? 'bg-emerald-500' : 'bg-slate-200'
                      } ${toggling === p.id ? 'opacity-50' : ''}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${p.active ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>

                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold truncate ${p.active ? 'text-slate-800' : 'text-slate-400'}`}>
                          {p.name}
                        </span>
                        {p.sku && (
                          <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded shrink-0">
                            {p.sku}
                          </span>
                        )}
                        {p.category && (
                          <span className="text-[10px] bg-violet-50 text-violet-600 border border-violet-100 px-1.5 py-0.5 rounded-full shrink-0">
                            {p.category}
                          </span>
                        )}
                      </div>
                      {p.description && (
                        <p className="text-xs text-slate-400 truncate mt-0.5">{p.description}</p>
                      )}
                    </div>

                    {/* Price */}
                    <div className="text-sm font-semibold text-emerald-700 tabular-nums shrink-0 mr-2">
                      {fmt(p.price_inr)}
                    </div>

                    {/* Edit button */}
                    <button
                      type="button"
                      onClick={() => { setEditingId(p.id); setShowAdd(false); }}
                      className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors shrink-0"
                      title="Edit"
                    >
                      <Pencil size={13} />
                    </button>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => void handleDelete(p.id)}
                      disabled={deletingId === p.id}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                      title="Delete"
                    >
                      {deletingId === p.id
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Trash2 size={13} />
                      }
                    </button>
                  </div>
                ) : (
                  /* Row — edit view */
                  <div className="px-4 py-4 border-l-2 border-violet-400">
                    <p className="text-xs font-semibold text-violet-700 mb-3 flex items-center gap-1.5">
                      <Pencil size={11} /> Editing: {p.name}
                    </p>
                    <ProductForm
                      initial={{
                        name:        p.name,
                        description: p.description ?? '',
                        price_inr:   p.price_inr !== null ? String(p.price_inr) : '',
                        category:    p.category ?? '',
                        sku:         p.sku ?? '',
                      }}
                      onSave={f => void handleEdit(p.id, f)}
                      onCancel={() => setEditingId(null)}
                      saving={saving}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
