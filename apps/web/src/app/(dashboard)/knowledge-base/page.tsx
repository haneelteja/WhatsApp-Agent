'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Plus, BookOpen, Trash2, ChevronRight, X,
  Sparkles, ChevronLeft, CheckSquare, Square,
  Loader2, AlertCircle, Check, Pencil,
  ImageIcon, FileText, Upload, Eye, EyeOff, Send, Package, Wand2,
} from 'lucide-react';
import { kbFetch, kbUpload } from '@/lib/kb-client';
import { ProductCatalogueManager } from '@/app/(dashboard)/catalogue/ProductCatalogueManager';
import { getProductsAction } from '@/app/actions/products';
import type { ProductCatalogueItem } from '@alphabot/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CollectionRow {
  id: string;
  name: string;
  description: string | null;
  entry_count: number;
  active: boolean;
  created_at: string;
  kb_collection_bots: { product_slug: string }[];
}

interface GeneratedEntry {
  question: string;
  answer:   string;
  category: string;
  selected: boolean;
}

interface Product {
  name:        string;
  description: string;
  price:       string;
}

type WizardStep = 1 | 2 | 3 | 4 | 'generating' | 'preview' | 'import-setup' | 'done';

// ── Constants ─────────────────────────────────────────────────────────────────

const BOT_PILL: Record<string, string> = {
  support_bot:   'bg-sky-50 text-sky-600 border-sky-200',
  sales_bot:     'bg-violet-50 text-violet-600 border-violet-200',
  lifecycle_bot: 'bg-orange-50 text-orange-600 border-orange-200',
};
const BOT_LABEL: Record<string, string> = {
  support_bot: 'Support', sales_bot: 'Sales', lifecycle_bot: 'Lifecycle',
};

const INDUSTRIES = [
  'Retail', 'Manufacturing', 'Real Estate', 'Finance',
  'Healthcare', 'SaaS', 'Professional Services', 'Education',
  'Hospitality', 'Logistics', 'Other',
];

const CATEGORY_COLORS: Record<string, string> = {
  Products:  'bg-blue-50 text-blue-700 border-blue-200',
  Pricing:   'bg-violet-50 text-violet-700 border-violet-200',
  Ordering:  'bg-amber-50 text-amber-700 border-amber-200',
  Delivery:  'bg-sky-50 text-sky-700 border-sky-200',
  Returns:   'bg-rose-50 text-rose-700 border-rose-200',
  Support:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  Company:   'bg-gray-100 text-gray-600 border-gray-200',
  General:   'bg-gray-50 text-gray-500 border-gray-200',
};

const EMPTY_STEP1 = { businessOverview: '', industry: '', customerType: 'B2C' };
const EMPTY_STEP3 = { returns: '', shipping: '', payment: '', supportHours: '', warranty: '' };

// ── Step indicator ─────────────────────────────────────────────────────────────

const WIZARD_STEPS = ['Business', 'Products', 'Policies', 'Questions'];

function StepIndicator({ current }: { current: WizardStep }) {
  const idx = typeof current === 'number' ? current - 1 : 4;
  return (
    <div className="flex items-center gap-0 mb-8">
      {WIZARD_STEPS.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            i < idx   ? 'bg-emerald-100 text-emerald-700' :
            i === idx ? 'bg-emerald-600 text-white shadow-sm' :
                        'bg-gray-100 text-gray-400'
          }`}>
            {i < idx ? <Check size={11} /> : <span>{i + 1}</span>}
            {label}
          </div>
          {i < WIZARD_STEPS.length - 1 && (
            <div className={`w-6 h-px mx-1 ${i < idx ? 'bg-emerald-300' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {

  // ── Bot filter — read client-side only to avoid SSR/hydration mismatch ───────
  const [botParam, setBotParam] = useState<string | null>(null);
  useEffect(() => {
    setBotParam(new URLSearchParams(window.location.search).get('bot'));
  }, []);

  // ── Collections tab state ──────────────────────────────────────────────────
  const [activeTab,    setActiveTab]    = useState<'collections' | 'builder' | 'media' | 'catalogue'>('collections');
  const [collections,  setCollections]  = useState<CollectionRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showNew,      setShowNew]      = useState(false);
  const [newForm,      setNewForm]      = useState({ name: '', description: '' });
  const [saving,       setSaving]       = useState(false);
  const [colError,     setColError]     = useState('');

  // ── Builder wizard state ───────────────────────────────────────────────────
  const [wizardStep,   setWizardStep]   = useState<WizardStep>(1);
  const [step1,        setStep1]        = useState(EMPTY_STEP1);
  const [products,     setProducts]     = useState<Product[]>([{ name: '', description: '', price: '' }]);
  const [step3,        setStep3]        = useState(EMPTY_STEP3);
  const [faqSeeds,     setFaqSeeds]     = useState('');
  const [generating,   setGenerating]   = useState(false);
  const [genError,     setGenError]     = useState('');
  const [entries,      setEntries]      = useState<GeneratedEntry[]>([]);
  const [editingIdx,   setEditingIdx]   = useState<number | null>(null);
  const [editDraft,    setEditDraft]    = useState<{ question: string; answer: string } | null>(null);
  const [importMode,   setImportMode]   = useState<'new' | 'existing'>('new');
  const [newColName,   setNewColName]   = useState('');
  const [targetColId,  setTargetColId]  = useState('');
  const [importing,    setImporting]    = useState(false);
  const [importError,  setImportError]  = useState('');
  const [importedCol,  setImportedCol]  = useState<{ id: string; name: string } | null>(null);

  // ── File Library state ─────────────────────────────────────────────────────
  interface MediaRow {
    id: string;
    name: string;
    description: string | null;
    file_type: 'image' | 'document';
    mime_type: string;
    original_filename: string;
    public_url: string;
    file_size: number;
    send_count: number;
    active: boolean;
    collection_id: string | null;
    created_at: string;
  }

  interface QueuedFile {
    file: File;
    status: 'pending' | 'uploading' | 'done' | 'error';
    error?: string;
  }

  const [mediaFiles,       setMediaFiles]       = useState<MediaRow[]>([]);
  const [mediaLoading,     setMediaLoading]      = useState(false);
  const [uploadForm,       setUploadForm]        = useState({ description: '', collectionId: '' });
  const [uploadQueue,      setUploadQueue]       = useState<QueuedFile[]>([]);
  const [uploading,        setUploading]         = useState(false);
  const [dragOver,         setDragOver]          = useState(false);

  // ── Optimise KB state ──────────────────────────────────────────────────────
  interface OptimisedEntry { question: string; answer: string; category: string; selected: boolean; }
  const [optimisingColId,    setOptimisingColId]    = useState<string | null>(null);
  const [optimisingStep,     setOptimisingStep]     = useState<'idle' | 'loading' | 'preview' | 'applying' | 'done'>('idle');
  const [optimisedEntries,   setOptimisedEntries]   = useState<OptimisedEntry[]>([]);
  const [optimiseOrigCount,  setOptimiseOrigCount]  = useState(0);
  const [optimiseColName,    setOptimiseColName]    = useState('');
  const [optimiseError,      setOptimiseError]      = useState('');
  const [optEditIdx,         setOptEditIdx]         = useState<number | null>(null);
  const [optEditDraft,       setOptEditDraft]       = useState<{ question: string; answer: string } | null>(null);

  // ── Catalogue tab state ────────────────────────────────────────────────────
  const [catalogueProducts,  setCatalogueProducts]  = useState<ProductCatalogueItem[] | null>(null);
  const [catalogueLoading,   setCatalogueLoading]   = useState(false);

  // ── Load collections ───────────────────────────────────────────────────────
  const loadCollections = useCallback(async () => {
    setLoading(true);
    const res = await kbFetch('/api/kb/collections');
    if (!res.ok) { setLoading(false); return; }
    const json = await res.json() as { data: CollectionRow[] };
    setCollections(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void loadCollections(); }, [loadCollections]);

  const visibleCollections = useMemo(() => {
    if (!botParam) return collections;
    return collections.filter(c => c.kb_collection_bots.some(b => b.product_slug === botParam));
  }, [collections, botParam]);

  // ── Collection CRUD ────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!newForm.name.trim()) return;
    setSaving(true); setColError('');
    const res = await kbFetch('/api/kb/collections', {
      method: 'POST',
      body: JSON.stringify({ name: newForm.name.trim(), description: newForm.description.trim() || undefined }),
    });
    if (!res.ok) {
      setColError((await res.json() as { error?: string }).error ?? 'Failed to create');
      setSaving(false); return;
    }
    setSaving(false); setShowNew(false); setNewForm({ name: '', description: '' });
    void loadCollections();
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    if (!confirm('Delete this collection and all its entries? This cannot be undone.')) return;
    await kbFetch(`/api/kb/collections/${id}`, { method: 'DELETE' });
    void loadCollections();
  }

  // ── File Library helpers ───────────────────────────────────────────────────
  const loadMedia = useCallback(async () => {
    setMediaLoading(true);
    const res = await kbFetch('/api/kb/media');
    if (res.ok) {
      const json = await res.json() as { data: MediaRow[] };
      setMediaFiles(json.data ?? []);
    }
    setMediaLoading(false);
  }, []);

  useEffect(() => { if (activeTab === 'media') void loadMedia(); }, [activeTab, loadMedia]);

  useEffect(() => {
    if (activeTab === 'catalogue' && catalogueProducts === null && !catalogueLoading) {
      setCatalogueLoading(true);
      void getProductsAction().then(({ products }) => {
        setCatalogueProducts(products);
        setCatalogueLoading(false);
      });
    }
  }, [activeTab, catalogueProducts, catalogueLoading]);

  function addFilesToQueue(files: FileList | File[]) {
    const arr = Array.from(files);
    setUploadQueue(q => [
      ...q,
      ...arr.map(f => ({ file: f, status: 'pending' as const })),
    ]);
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files.length) addFilesToQueue(e.dataTransfer.files);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) addFilesToQueue(e.target.files);
    e.target.value = '';
  }

  function removeFromQueue(idx: number) {
    setUploadQueue(q => q.filter((_, i) => i !== idx));
  }

  async function handleUpload() {
    const pending = uploadQueue.filter(q => q.status === 'pending');
    if (!pending.length) return;
    setUploading(true);

    for (const item of pending) {
      setUploadQueue(q => q.map(i => i === item ? { ...i, status: 'uploading' } : i));
      try {
        const formData = new FormData();
        formData.append('file', item.file);
        const name = item.file.name.replace(/\.[^.]+$/, '');
        const params = new URLSearchParams({ name });
        if (uploadForm.description.trim()) params.set('description', uploadForm.description.trim());
        if (uploadForm.collectionId) params.set('collection_id', uploadForm.collectionId);
        const res = await kbUpload(`/api/kb/media/upload?${params.toString()}`, formData);
        const json = await res.json() as { error?: string };
        if (!res.ok) {
          setUploadQueue(q => q.map(i => i === item ? { ...i, status: 'error', error: json.error ?? 'Upload failed' } : i));
        } else {
          setUploadQueue(q => q.map(i => i === item ? { ...i, status: 'done' } : i));
        }
      } catch {
        setUploadQueue(q => q.map(i => i === item ? { ...i, status: 'error', error: 'Network error' } : i));
      }
    }

    setUploading(false);
    void loadMedia();
    // Clear done items after a short delay so user sees the green ticks
    setTimeout(() => {
      setUploadQueue(q => q.filter(i => i.status !== 'done'));
    }, 1500);
  }

  async function handleToggleActive(id: string, active: boolean) {
    await kbFetch(`/api/kb/media/${id}`, { method: 'PATCH', body: JSON.stringify({ active: !active }) });
    void loadMedia();
  }

  async function handleDeleteMedia(id: string) {
    if (!confirm('Delete this file? This cannot be undone.')) return;
    await kbFetch(`/api/kb/media/${id}`, { method: 'DELETE' });
    void loadMedia();
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  // ── Builder helpers ────────────────────────────────────────────────────────
  function addProduct() {
    if (products.length >= 10) return;
    setProducts([...products, { name: '', description: '', price: '' }]);
  }
  function removeProduct(i: number) {
    setProducts(products.filter((_, idx) => idx !== i));
  }
  function updateProduct(i: number, field: keyof Product, value: string) {
    setProducts(products.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  }

  function toggleEntry(i: number) {
    setEntries(entries.map((e, idx) => idx === i ? { ...e, selected: !e.selected } : e));
  }
  function toggleAll() {
    const allSelected = entries.every(e => e.selected);
    setEntries(entries.map(e => ({ ...e, selected: !allSelected })));
  }

  function startEdit(i: number) {
    setEditingIdx(i);
    setEditDraft({ question: entries[i]!.question, answer: entries[i]!.answer });
  }
  function saveEdit() {
    if (editingIdx === null || !editDraft) return;
    setEntries(entries.map((e, i) => i === editingIdx ? { ...e, ...editDraft } : e));
    setEditingIdx(null); setEditDraft(null);
  }

  function resetBuilder() {
    setWizardStep(1);
    setStep1(EMPTY_STEP1);
    setProducts([{ name: '', description: '', price: '' }]);
    setStep3(EMPTY_STEP3);
    setFaqSeeds('');
    setEntries([]);
    setGenError('');
    setImportError('');
    setImportedCol(null);
    setNewColName('');
    setTargetColId('');
    setEditingIdx(null); setEditDraft(null);
  }

  // ── Generate ───────────────────────────────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true); setGenError(''); setWizardStep('generating');
    try {
      const seeds = faqSeeds.split('\n').map(s => s.trim()).filter(Boolean);
      const res = await kbFetch('/api/kb/generate', {
        method: 'POST',
        body: JSON.stringify({
          businessOverview: step1.businessOverview,
          industry:         step1.industry,
          customerType:     step1.customerType,
          products:         products.filter(p => p.name.trim()),
          policies:         step3,
          faqSeeds:         seeds,
        }),
      });
      if (!res.ok) {
        const err = (await res.json() as { error?: string }).error ?? 'Generation failed';
        setGenError(err); setWizardStep(4); setGenerating(false); return;
      }
      const json = await res.json() as { entries: Array<{ question: string; answer: string; category: string }> };
      setEntries((json.entries ?? []).map(e => ({ ...e, selected: true })));
      setWizardStep('preview');
    } catch {
      setGenError('Network error — please try again');
      setWizardStep(4);
    }
    setGenerating(false);
  }

  // ── Import ─────────────────────────────────────────────────────────────────
  async function handleImport() {
    const selected = entries.filter(e => e.selected);
    if (!selected.length) { setImportError('Select at least one entry'); return; }
    if (importMode === 'new' && !newColName.trim()) { setImportError('Enter a collection name'); return; }
    if (importMode === 'existing' && !targetColId) { setImportError('Select a collection'); return; }

    setImporting(true); setImportError('');

    try {
      let collectionId = targetColId;
      let collectionName = collections.find(c => c.id === targetColId)?.name ?? '';

      if (importMode === 'new') {
        const createRes = await kbFetch('/api/kb/collections', {
          method: 'POST',
          body: JSON.stringify({ name: newColName.trim() }),
        });
        if (!createRes.ok) {
          setImportError((await createRes.json() as { error?: string }).error ?? 'Failed to create collection');
          setImporting(false); return;
        }
        const created = (await createRes.json() as { data: { id: string; name: string } }).data;
        collectionId   = created.id;
        collectionName = created.name;
      }

      const bulkRes = await kbFetch(`/api/kb/collections/${collectionId}/entries/bulk`, {
        method: 'POST',
        body: JSON.stringify({ entries: selected.map(e => ({ question: e.question, answer: e.answer, category: e.category })) }),
      });
      if (!bulkRes.ok) {
        setImportError((await bulkRes.json() as { error?: string }).error ?? 'Import failed');
        setImporting(false); return;
      }

      setImportedCol({ id: collectionId, name: collectionName });
      setWizardStep('done');
      void loadCollections();
    } catch {
      setImportError('Network error — please try again');
    }
    setImporting(false);
  }

  // ── Optimise KB handlers ───────────────────────────────────────────────────

  async function handleOptimise(col: CollectionRow, e: React.MouseEvent) {
    e.preventDefault();
    setOptimisingColId(col.id);
    setOptimiseColName(col.name);
    setOptimisedEntries([]);
    setOptimiseError('');
    setOptEditIdx(null);
    setOptEditDraft(null);
    setOptimisingStep('loading');

    const res = await kbFetch(`/api/kb/collections/${col.id}/optimise`, { method: 'POST' });
    const json = await res.json() as { entries?: Array<{ question: string; answer: string; category: string }>; originalCount?: number; error?: string };
    if (!res.ok) {
      setOptimiseError(json.error ?? 'Optimisation failed — please try again');
      setOptimisingStep('preview');
      return;
    }
    setOptimisedEntries((json.entries ?? []).map(e => ({ ...e, selected: true })));
    setOptimiseOrigCount(json.originalCount ?? col.entry_count);
    setOptimisingStep('preview');
  }

  function toggleOptEntry(i: number) {
    setOptimisedEntries(es => es.map((e, idx) => idx === i ? { ...e, selected: !e.selected } : e));
  }
  function toggleAllOpt() {
    const allSel = optimisedEntries.every(e => e.selected);
    setOptimisedEntries(es => es.map(e => ({ ...e, selected: !allSel })));
  }

  function startOptEdit(i: number) {
    setOptEditIdx(i);
    setOptEditDraft({ question: optimisedEntries[i]!.question, answer: optimisedEntries[i]!.answer });
  }
  function saveOptEdit() {
    if (optEditIdx === null || !optEditDraft) return;
    setOptimisedEntries(es => es.map((e, i) => i === optEditIdx ? { ...e, ...optEditDraft } : e));
    setOptEditIdx(null); setOptEditDraft(null);
  }

  async function handleApplyOptimise() {
    const selected = optimisedEntries.filter(e => e.selected);
    if (!selected.length || !optimisingColId) return;
    setOptimisingStep('applying');
    const res = await kbFetch(`/api/kb/collections/${optimisingColId}/optimise/apply`, {
      method: 'POST',
      body: JSON.stringify({ entries: selected.map(({ question, answer, category }) => ({ question, answer, category })) }),
    });
    if (!res.ok) {
      const json = await res.json() as { error?: string };
      setOptimiseError(json.error ?? 'Apply failed — please try again');
      setOptimisingStep('preview');
      return;
    }
    setOptimisingStep('done');
    void loadCollections();
  }

  function closeOptimise() {
    setOptimisingColId(null);
    setOptimisingStep('idle');
    setOptimisedEntries([]);
    setOptimiseError('');
    setOptEditIdx(null);
    setOptEditDraft(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const selectedCount = entries.filter(e => e.selected).length;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {activeTab === 'catalogue' ? 'Product Catalogue' : 'Knowledge Base'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeTab === 'catalogue'
              ? 'Active products are injected into the sales bot — it can quote exact prices and send a formatted product list on request.'
              : 'Collections of Q&A entries that power your AI bots'}
          </p>
        </div>
        {activeTab === 'collections' && (
          <button type="button" onClick={() => setShowNew(true)}
            className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold shadow-sm shadow-emerald-200 shrink-0">
            <Plus size={15} /> New Collection
          </button>
        )}
        {activeTab === 'media' && (
          <div className="text-xs text-gray-400 bg-white border border-green-100 px-3 py-1.5 rounded-full shadow-sm self-start">
            {mediaFiles.length} file{mediaFiles.length !== 1 ? 's' : ''} uploaded
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 bg-white border border-green-100 rounded-xl shadow-sm p-1 w-fit">
        <button type="button" onClick={() => setActiveTab('collections')}
          className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'collections' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}>
          <BookOpen size={14} /> Collections
        </button>
        <button type="button" onClick={() => { setActiveTab('builder'); }}
          className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'builder' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}>
          <Sparkles size={14} /> AI Builder
        </button>
        <button type="button" onClick={() => setActiveTab('media')}
          className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'media' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}>
          <ImageIcon size={14} /> File Library
        </button>
        <button type="button" onClick={() => setActiveTab('catalogue')}
          className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'catalogue' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}>
          <Package size={14} /> Catalogue
        </button>
      </div>

      {/* ── COLLECTIONS TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'collections' && (
        <>
          {loading && (
            <div className="flex items-center justify-center py-24">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && !collections.length && (
            <div className="bg-white rounded-2xl border border-green-100 shadow-sm flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mb-4 border border-green-100">
                <BookOpen size={28} className="text-green-400" />
              </div>
              <p className="text-sm font-semibold text-gray-600">No collections yet</p>
              <p className="text-xs text-gray-400 mt-1 mb-4">Create a collection manually or use the AI Builder to generate one.</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setShowNew(true)}
                  className="text-sm px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold">
                  New Collection
                </button>
                <button type="button" onClick={() => setActiveTab('builder')}
                  className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border border-green-200 text-emerald-700 hover:bg-green-50 transition-colors font-semibold">
                  <Sparkles size={14} /> Try AI Builder
                </button>
              </div>
            </div>
          )}

          {!loading && collections.length > 0 && visibleCollections.length === 0 && botParam && (
            <div className="py-10 text-center">
              <p className="text-sm font-semibold text-gray-600">No collections for this bot</p>
              <p className="text-xs text-gray-400 mt-1">Create a collection and link it to this bot when editing.</p>
            </div>
          )}

          {!loading && visibleCollections.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visibleCollections.map((col) => (
                <div key={col.id} className="relative bg-white rounded-2xl border border-green-100 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all group">
                  <Link href={`/knowledge-base/${col.id}`} className="block p-5 pr-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                        <BookOpen size={16} className="text-emerald-600" />
                      </div>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${col.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                        {col.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="font-semibold text-gray-900 text-sm">{col.name}</p>
                    {col.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{col.description}</p>}
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
                  <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {col.entry_count > 0 && (
                      <button type="button" onClick={(e) => void handleOptimise(col, e)} aria-label="Optimise KB"
                        title="Optimise KB with AI"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:bg-violet-50 hover:text-violet-500 transition-colors">
                        <Wand2 size={13} />
                      </button>
                    )}
                    <button type="button" onClick={(e) => void handleDelete(col.id, e)} aria-label="Delete collection"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:bg-red-50 hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <ChevronRight size={14} className="absolute bottom-5 right-4 text-gray-200 group-hover:text-emerald-400 transition-colors" />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── AI BUILDER TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'builder' && (
        <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-6 lg:p-8">

          {/* ── STEP 1 — Business Overview ── */}
          {wizardStep === 1 && (
            <div className="max-w-2xl">
              <StepIndicator current={1} />
              <h3 className="text-base font-bold text-gray-900 mb-1">Business Overview</h3>
              <p className="text-sm text-gray-500 mb-6">Tell us about your business so we can tailor the knowledge base.</p>

              <div className="space-y-5">
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                    What does your business do? <span className="text-red-400">*</span>
                  </label>
                  <textarea rows={3} value={step1.businessOverview}
                    onChange={e => setStep1({ ...step1, businessOverview: e.target.value })}
                    placeholder="e.g. We manufacture and sell premium stainless steel kitchen equipment to hotels and restaurants across India. Our flagship products include industrial ovens, refrigeration units, and food prep stations."
                    className="w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Industry <span className="text-red-400">*</span></label>
                    <select value={step1.industry} onChange={e => setStep1({ ...step1, industry: e.target.value })}
                      className="w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      <option value="">Select industry…</option>
                      {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Primary customers <span className="text-red-400">*</span></label>
                    <div className="flex gap-2 mt-1">
                      {['B2B', 'B2C', 'Both'].map(opt => (
                        <button key={opt} type="button" onClick={() => setStep1({ ...step1, customerType: opt })}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                            step1.customerType === opt
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-gray-600 border-green-200 hover:border-emerald-300'
                          }`}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end mt-8">
                <button type="button"
                  disabled={!step1.businessOverview.trim() || !step1.industry}
                  onClick={() => setWizardStep(2)}
                  className="flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold disabled:opacity-40 shadow-sm shadow-emerald-200">
                  Next <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2 — Products & Services ── */}
          {wizardStep === 2 && (
            <div className="max-w-2xl">
              <StepIndicator current={2} />
              <h3 className="text-base font-bold text-gray-900 mb-1">Products &amp; Services</h3>
              <p className="text-sm text-gray-500 mb-6">Add up to 10 products or services. These become the core of your KB.</p>

              <div className="space-y-3">
                {products.map((p, i) => (
                  <div key={i} className="bg-green-50/50 border border-green-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Product / Service {i + 1}</p>
                      {products.length > 1 && (
                        <button type="button" onClick={() => removeProduct(i)}
                          className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2">
                        <input placeholder="Product / service name *" value={p.name}
                          onChange={e => updateProduct(i, 'name', e.target.value)}
                          className="w-full rounded-xl border border-green-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                      </div>
                      <div className="sm:col-span-2">
                        <textarea rows={2} placeholder="Brief description (features, benefits, who it's for)"
                          value={p.description} onChange={e => updateProduct(i, 'description', e.target.value)}
                          className="w-full rounded-xl border border-green-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
                      </div>
                      <div>
                        <input placeholder="Price / pricing model (e.g. ₹999/mo, Quote-based)"
                          value={p.price} onChange={e => updateProduct(i, 'price', e.target.value)}
                          className="w-full rounded-xl border border-green-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                      </div>
                    </div>
                  </div>
                ))}

                {products.length < 10 && (
                  <button type="button" onClick={addProduct}
                    className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border border-green-200 text-emerald-700 hover:bg-green-50 transition-colors font-medium w-full justify-center">
                    <Plus size={14} /> Add another product
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between mt-8">
                <button type="button" onClick={() => setWizardStep(1)}
                  className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border border-green-200 text-gray-600 hover:bg-green-50 transition-colors font-medium">
                  <ChevronLeft size={15} /> Back
                </button>
                <button type="button" onClick={() => setWizardStep(3)}
                  disabled={!products.some(p => p.name.trim())}
                  className="flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold disabled:opacity-40 shadow-sm shadow-emerald-200">
                  Next <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3 — Policies & Operations ── */}
          {wizardStep === 3 && (
            <div className="max-w-2xl">
              <StepIndicator current={3} />
              <h3 className="text-base font-bold text-gray-900 mb-1">Policies &amp; Operations</h3>
              <p className="text-sm text-gray-500 mb-6">Fill in what you know — skip fields that don&apos;t apply.</p>

              <div className="space-y-4">
                {[
                  { key: 'returns',      label: 'Return / Refund policy',       placeholder: 'e.g. Returns accepted within 7 days of delivery for unused items. Contact support@company.com to initiate.' },
                  { key: 'shipping',     label: 'Delivery / Shipping info',      placeholder: 'e.g. Free delivery within Mumbai (3–5 days). Pan-India delivery ₹150 flat (5–7 days). Express available.' },
                  { key: 'payment',      label: 'Payment methods accepted',      placeholder: 'e.g. UPI, credit/debit card, net banking, EMI via Bajaj Finance, COD up to ₹5,000.' },
                  { key: 'supportHours', label: 'Support hours & channels',      placeholder: 'e.g. Mon–Sat 9 AM–7 PM IST via WhatsApp, email, and phone. Response within 2 hours on WhatsApp.' },
                  { key: 'warranty',     label: 'Warranty / Guarantee',          placeholder: 'e.g. 1-year manufacturer warranty on all products. Extended 2-year warranty available at checkout.' },
                ] .map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="text-xs font-semibold text-gray-700 mb-1.5 block">{label}</label>
                    <textarea rows={2} placeholder={placeholder}
                      value={step3[key as keyof typeof step3]}
                      onChange={e => setStep3({ ...step3, [key]: e.target.value })}
                      className="w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between mt-8">
                <button type="button" onClick={() => setWizardStep(2)}
                  className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border border-green-200 text-gray-600 hover:bg-green-50 transition-colors font-medium">
                  <ChevronLeft size={15} /> Back
                </button>
                <button type="button" onClick={() => setWizardStep(4)}
                  className="flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold shadow-sm shadow-emerald-200">
                  Next <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 4 — FAQ Seeds ── */}
          {wizardStep === 4 && (
            <div className="max-w-2xl">
              <StepIndicator current={4} />
              <h3 className="text-base font-bold text-gray-900 mb-1">Top Customer Questions</h3>
              <p className="text-sm text-gray-500 mb-2">Optional — but even 5 real questions dramatically improve KB quality.</p>
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-800 mb-6">
                💡 Paste the questions your customers ask most — one per line. These become primary KB entries and seed related questions.
              </div>

              <textarea rows={10} value={faqSeeds} onChange={e => setFaqSeeds(e.target.value)}
                placeholder={`What is the minimum order quantity?\nDo you offer installation services?\nCan I get a product demo before buying?\nWhat are your payment terms for bulk orders?\nHow long does delivery take to Bangalore?`}
                className="w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-mono" />
              <p className="text-xs text-gray-400 mt-1.5">{faqSeeds.split('\n').filter(l => l.trim()).length} questions</p>

              {genError && (
                <div className="flex items-center gap-2 mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  <AlertCircle size={15} className="shrink-0" /> {genError}
                </div>
              )}

              <div className="flex items-center justify-between mt-8">
                <button type="button" onClick={() => setWizardStep(3)}
                  className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border border-green-200 text-gray-600 hover:bg-green-50 transition-colors font-medium">
                  <ChevronLeft size={15} /> Back
                </button>
                <button type="button" onClick={() => void handleGenerate()} disabled={generating}
                  className="flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold shadow-sm shadow-emerald-200 disabled:opacity-50">
                  <Sparkles size={15} /> Generate Knowledge Base
                </button>
              </div>
            </div>
          )}

          {/* ── GENERATING ── */}
          {wizardStep === 'generating' && (
            <div className="flex flex-col items-center justify-center py-24 text-center max-w-sm mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-5">
                <Loader2 size={28} className="text-emerald-500 animate-spin" />
              </div>
              <p className="text-base font-bold text-gray-900 mb-2">Building your Knowledge Base…</p>
              <p className="text-sm text-gray-400">Claude is generating 30–50 Q&amp;A entries based on your business info. This takes about 15 seconds.</p>
            </div>
          )}

          {/* ── PREVIEW ── */}
          {wizardStep === 'preview' && (
            <div>
              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
                <div>
                  <h3 className="text-base font-bold text-gray-900">Review Generated Entries</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {entries.length} entries generated — {selectedCount} selected. Click any row to edit.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={toggleAll}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-green-200 text-gray-600 hover:bg-green-50 transition-colors font-medium">
                    {entries.every(e => e.selected) ? <Square size={12} /> : <CheckSquare size={12} />}
                    {entries.every(e => e.selected) ? 'Deselect all' : 'Select all'}
                  </button>
                  <button type="button" onClick={() => void handleGenerate()}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-green-200 text-gray-600 hover:bg-green-50 transition-colors font-medium">
                    <Sparkles size={12} /> Regenerate
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="border border-green-100 rounded-xl overflow-hidden mb-5">
                <div className="divide-y divide-green-50">
                  {entries.map((entry, i) => (
                    <div key={i}
                      className={`flex items-start gap-3 px-4 py-3 transition-colors ${entry.selected ? 'bg-white' : 'bg-gray-50/50 opacity-60'}`}>
                      <button type="button" onClick={() => toggleEntry(i)} className="shrink-0 mt-0.5 text-emerald-500 hover:text-emerald-700">
                        {entry.selected ? <CheckSquare size={16} /> : <Square size={16} className="text-gray-300" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        {editingIdx === i ? (
                          <div className="space-y-2">
                            <input autoFocus value={editDraft?.question ?? ''} onChange={e => setEditDraft(d => d ? { ...d, question: e.target.value } : d)}
                              className="w-full rounded-lg border border-emerald-300 px-2.5 py-1.5 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                            <textarea rows={2} value={editDraft?.answer ?? ''} onChange={e => setEditDraft(d => d ? { ...d, answer: e.target.value } : d)}
                              className="w-full rounded-lg border border-emerald-300 px-2.5 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
                            <div className="flex gap-2">
                              <button type="button" onClick={saveEdit}
                                className="text-xs px-3 py-1 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors">Save</button>
                              <button type="button" onClick={() => { setEditingIdx(null); setEditDraft(null); }}
                                className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 cursor-pointer" onClick={() => startEdit(i)}>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 leading-snug">{entry.question}</p>
                              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{entry.answer}</p>
                            </div>
                            <Pencil size={12} className="text-gray-300 shrink-0 mt-1" />
                          </div>
                        )}
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 mt-0.5 ${CATEGORY_COLORS[entry.category] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                        {entry.category}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">{selectedCount} of {entries.length} selected</p>
                <button type="button" onClick={() => setWizardStep('import-setup')} disabled={selectedCount === 0}
                  className="flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold disabled:opacity-40 shadow-sm shadow-emerald-200">
                  Import {selectedCount} {selectedCount === 1 ? 'entry' : 'entries'} →
                </button>
              </div>
            </div>
          )}

          {/* ── IMPORT SETUP ── */}
          {wizardStep === 'import-setup' && (
            <div className="max-w-lg">
              <h3 className="text-base font-bold text-gray-900 mb-1">Import {selectedCount} Entries</h3>
              <p className="text-sm text-gray-500 mb-6">Choose where to import the selected entries.</p>

              <div className="space-y-3 mb-6">
                <button type="button" onClick={() => setImportMode('new')}
                  className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-colors ${importMode === 'new' ? 'border-emerald-500 bg-emerald-50/50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${importMode === 'new' ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'}`}>
                    {importMode === 'new' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Create new collection</p>
                    <p className="text-xs text-gray-500 mt-0.5">A new collection will be created and entries imported into it</p>
                  </div>
                </button>

                {importMode === 'new' && (
                  <input value={newColName} onChange={e => setNewColName(e.target.value)}
                    placeholder="Collection name, e.g. Product FAQ"
                    className="w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                )}

                {collections.length > 0 && (
                  <>
                    <button type="button" onClick={() => setImportMode('existing')}
                      className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-colors ${importMode === 'existing' ? 'border-emerald-500 bg-emerald-50/50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${importMode === 'existing' ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'}`}>
                        {importMode === 'existing' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">Add to existing collection</p>
                        <p className="text-xs text-gray-500 mt-0.5">Append to one of your existing collections</p>
                      </div>
                    </button>

                    {importMode === 'existing' && (
                      <select value={targetColId} onChange={e => setTargetColId(e.target.value)}
                        className="w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                        <option value="">Select a collection…</option>
                        {collections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.entry_count} entries)</option>)}
                      </select>
                    )}
                  </>
                )}
              </div>

              {importError && (
                <div className="flex items-center gap-2 mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  <AlertCircle size={15} className="shrink-0" /> {importError}
                </div>
              )}

              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setWizardStep('preview')}
                  className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border border-green-200 text-gray-600 hover:bg-green-50 transition-colors font-medium">
                  <ChevronLeft size={15} /> Back to Preview
                </button>
                <button type="button" onClick={() => void handleImport()} disabled={importing}
                  className="flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold disabled:opacity-50 shadow-sm shadow-emerald-200">
                  {importing ? <><Loader2 size={15} className="animate-spin" /> Importing…</> : <>Import →</>}
                </button>
              </div>
            </div>
          )}

          {/* ── DONE ── */}
          {wizardStep === 'done' && importedCol && (
            <div className="flex flex-col items-center justify-center py-16 text-center max-w-sm mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-5">
                <Check size={28} className="text-emerald-500" />
              </div>
              <p className="text-base font-bold text-gray-900 mb-2">
                {selectedCount} {selectedCount === 1 ? 'entry' : 'entries'} imported!
              </p>
              <p className="text-sm text-gray-400 mb-6">
                Added to <span className="font-semibold text-gray-700">{importedCol.name}</span>. Assign it to a bot and your AI is ready.
              </p>
              <div className="flex items-center gap-2">
                <Link href={`/knowledge-base/${importedCol.id}`}
                  className="text-sm px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold">
                  View Collection →
                </Link>
                <button type="button" onClick={() => { resetBuilder(); }}
                  className="text-sm px-4 py-2.5 rounded-xl border border-green-200 text-gray-600 hover:bg-green-50 transition-colors font-medium">
                  Build Another
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── FILE LIBRARY TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'media' && (
        <div className="space-y-5">

          {/* Upload card */}
          <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-6">
            <div className="mb-5">
              <h3 className="text-sm font-bold text-gray-900">Upload Files</h3>
              <p className="text-xs text-gray-400 mt-0.5">Images and PDFs the bot will send inline when answering relevant questions</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              {/* Drop zone */}
              <div className="lg:col-span-2 flex flex-col gap-3">
                <label
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { handleFileDrop(e); }}
                  className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors ${
                    dragOver ? 'border-emerald-400 bg-emerald-50/60' : uploadQueue.length ? 'border-emerald-300 bg-emerald-50/30' : 'border-green-200 hover:border-emerald-300 hover:bg-green-50/40'
                  }`}>
                  <input type="file" accept="image/*,.pdf" multiple className="hidden" onChange={handleFileInput} />
                  <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                    <Upload size={18} className="text-emerald-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-gray-700">Drop files here</p>
                    <p className="text-xs text-gray-400 mt-0.5">or click to browse · select multiple</p>
                    <p className="text-[11px] text-gray-300 mt-1.5">JPEG, PNG, WEBP, GIF, PDF · Max 20 MB each</p>
                  </div>
                </label>

                {/* Queued file list */}
                {uploadQueue.length > 0 && (
                  <div className="space-y-1.5">
                    {uploadQueue.map((item, idx) => (
                      <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${
                        item.status === 'done'      ? 'bg-emerald-50 border-emerald-100' :
                        item.status === 'error'     ? 'bg-red-50 border-red-100' :
                        item.status === 'uploading' ? 'bg-blue-50 border-blue-100' :
                                                      'bg-gray-50 border-gray-100'
                      }`}>
                        {item.file.type.startsWith('image/') ? (
                          <ImageIcon size={13} className="shrink-0 text-gray-400" />
                        ) : (
                          <FileText size={13} className="shrink-0 text-rose-400" />
                        )}
                        <span className="flex-1 truncate text-gray-700 font-medium">{item.file.name}</span>
                        <span className="text-gray-300 shrink-0">{formatBytes(item.file.size)}</span>
                        {item.status === 'pending' && (
                          <button type="button" onClick={() => removeFromQueue(idx)} className="shrink-0 text-gray-300 hover:text-red-400 transition-colors">
                            <X size={12} />
                          </button>
                        )}
                        {item.status === 'uploading' && <Loader2 size={12} className="shrink-0 text-blue-400 animate-spin" />}
                        {item.status === 'done'      && <Check size={12} className="shrink-0 text-emerald-500" />}
                        {item.status === 'error'     && <span title={item.error}><AlertCircle size={12} className="shrink-0 text-red-400" /></span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Form fields */}
              <div className="lg:col-span-3 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
                    Description
                    <span className="text-gray-300 font-normal normal-case tracking-normal ml-1">— applied to all files in this batch</span>
                  </label>
                  <input
                    value={uploadForm.description}
                    onChange={e => setUploadForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="e.g. Full product catalogue with prices, specifications and images"
                    className="w-full rounded-xl border border-green-200 bg-green-50/40 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
                    Link to Collection
                    <span className="text-gray-300 font-normal normal-case tracking-normal ml-1">— bot sends these when matching that collection</span>
                  </label>
                  <select
                    value={uploadForm.collectionId}
                    onChange={e => setUploadForm(f => ({ ...f, collectionId: e.target.value }))}
                    className="w-full rounded-xl border border-green-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">No collection (available to all queries)</option>
                    {collections.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => void handleUpload()}
                  disabled={uploading || uploadQueue.filter(q => q.status === 'pending').length === 0}
                  className="flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold disabled:opacity-40 shadow-sm shadow-emerald-200"
                >
                  {uploading
                    ? <><Loader2 size={15} className="animate-spin" /> Uploading…</>
                    : <><Upload size={15} /> Upload {uploadQueue.filter(q => q.status === 'pending').length || ''} {uploadQueue.filter(q => q.status === 'pending').length === 1 ? 'File' : 'Files'}</>
                  }
                </button>
              </div>
            </div>
          </div>

          {/* File grid */}
          {mediaLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : mediaFiles.length === 0 ? (
            <div className="bg-white rounded-2xl border border-green-100 shadow-sm flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mb-4 border border-green-100">
                <ImageIcon size={24} className="text-green-400" />
              </div>
              <p className="text-sm font-semibold text-gray-600">No files yet</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs">Upload images or PDFs above and the bot will send them automatically when answering related questions.</p>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Uploaded Files</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {mediaFiles.map(file => {
                  const isImage = file.file_type === 'image';
                  const col = collections.find(c => c.id === file.collection_id);
                  return (
                    <div
                      key={file.id}
                      className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
                        file.active ? 'border-green-100 hover:border-emerald-200' : 'border-gray-100 opacity-60'
                      }`}
                    >
                      {/* Preview area */}
                      {isImage ? (
                        <div className="h-36 bg-gray-50 flex items-center justify-center overflow-hidden border-b border-green-50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={file.public_url}
                            alt={file.name}
                            className="h-full w-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      ) : (
                        <div className="h-36 bg-rose-50 flex flex-col items-center justify-center border-b border-rose-100/50 gap-2">
                          <FileText size={32} className="text-rose-400" />
                          <span className="text-[11px] font-semibold text-rose-500 uppercase tracking-wider">PDF Document</span>
                        </div>
                      )}

                      {/* Info */}
                      <div className="p-4 space-y-2.5">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 leading-tight">{file.name}</p>
                          {file.description && (
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{file.description}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {col ? (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">
                              {col.name}
                            </span>
                          ) : (
                            <span className="text-[11px] text-gray-300 italic">no collection</span>
                          )}
                          {file.send_count > 0 && (
                            <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-600 border border-sky-100 font-medium">
                              <Send size={9} /> sent {file.send_count}×
                            </span>
                          )}
                          <span className="text-[11px] text-gray-300 ml-auto">{formatBytes(file.file_size)}</span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between pt-2 border-t border-green-50">
                          <button
                            type="button"
                            onClick={() => void handleToggleActive(file.id, file.active)}
                            className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
                              file.active
                                ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                                : 'text-gray-400 bg-gray-50 hover:bg-gray-100'
                            }`}
                          >
                            {file.active ? <Eye size={12} /> : <EyeOff size={12} />}
                            {file.active ? 'Active' : 'Inactive'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteMedia(file.id)}
                            className="flex items-center gap-1.5 text-xs font-medium text-gray-300 hover:text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors"
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CATALOGUE TAB ────────────────────────────────────────────────────── */}
      {activeTab === 'catalogue' && (
        <div>
          {catalogueLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <ProductCatalogueManager initialProducts={catalogueProducts ?? []} />
          )}
        </div>
      )}

      {/* ── Optimise KB Modal ── */}
      {optimisingColId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-green-100">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
                  <Wand2 size={15} className="text-violet-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">Optimise KB</p>
                  <p className="text-xs text-gray-400 truncate max-w-xs">{optimiseColName}</p>
                </div>
              </div>
              {optimisingStep !== 'loading' && optimisingStep !== 'applying' && (
                <button type="button" onClick={closeOptimise} aria-label="Close"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Loading */}
            {optimisingStep === 'loading' && (
              <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center mb-4">
                  <Loader2 size={26} className="text-violet-500 animate-spin" />
                </div>
                <p className="text-sm font-bold text-gray-900 mb-1">Analysing your Knowledge Base…</p>
                <p className="text-xs text-gray-400 max-w-xs">The AI is reading all your entries and rewriting them for better bot comprehension. This takes about 15–30 seconds.</p>
              </div>
            )}

            {/* Applying */}
            {optimisingStep === 'applying' && (
              <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center mb-4">
                  <Loader2 size={26} className="text-violet-500 animate-spin" />
                </div>
                <p className="text-sm font-bold text-gray-900 mb-1">Applying optimised entries…</p>
                <p className="text-xs text-gray-400">Replacing existing entries with the optimised set.</p>
              </div>
            )}

            {/* Done */}
            {optimisingStep === 'done' && (
              <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-4">
                  <Check size={26} className="text-emerald-500" />
                </div>
                <p className="text-sm font-bold text-gray-900 mb-1">Knowledge Base optimised!</p>
                <p className="text-xs text-gray-400 mb-6">
                  {optimisedEntries.filter(e => e.selected).length} optimised entries replaced {optimiseOrigCount} original entries.
                </p>
                <button type="button" onClick={closeOptimise}
                  className="text-sm px-5 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold shadow-sm shadow-emerald-200">
                  Done
                </button>
              </div>
            )}

            {/* Preview */}
            {optimisingStep === 'preview' && (
              <>
                {/* Sub-header */}
                <div className="px-6 py-3 border-b border-gray-50 bg-violet-50/40 flex items-center justify-between shrink-0">
                  <p className="text-xs text-gray-600">
                    <span className="font-semibold text-violet-700">{optimisedEntries.length}</span> optimised entries
                    {optimiseOrigCount > 0 && <span className="text-gray-400"> · was {optimiseOrigCount}</span>}
                    {' · '}<span className="text-violet-700 font-semibold">{optimisedEntries.filter(e => e.selected).length}</span> selected
                  </p>
                  <button type="button" onClick={toggleAllOpt}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-white transition-colors font-medium">
                    {optimisedEntries.every(e => e.selected) ? <Square size={11} /> : <CheckSquare size={11} />}
                    {optimisedEntries.every(e => e.selected) ? 'Deselect all' : 'Select all'}
                  </button>
                </div>

                {/* Error banner */}
                {optimiseError && (
                  <div className="mx-6 mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 shrink-0">
                    <AlertCircle size={14} className="shrink-0" /> {optimiseError}
                  </div>
                )}

                {/* Entry list */}
                <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
                  {optimisedEntries.map((entry, i) => (
                    <div key={i} className={`flex items-start gap-3 px-6 py-3.5 transition-colors ${entry.selected ? 'bg-white hover:bg-gray-50/40' : 'bg-gray-50/50 opacity-50'}`}>
                      <button type="button" onClick={() => toggleOptEntry(i)} className="shrink-0 mt-0.5 text-violet-500 hover:text-violet-700">
                        {entry.selected ? <CheckSquare size={15} /> : <Square size={15} className="text-gray-300" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        {optEditIdx === i ? (
                          <div className="space-y-2">
                            <input autoFocus value={optEditDraft?.question ?? ''} onChange={e => setOptEditDraft(d => d ? { ...d, question: e.target.value } : d)}
                              className="w-full rounded-lg border border-violet-300 px-2.5 py-1.5 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400" />
                            <textarea rows={2} value={optEditDraft?.answer ?? ''} onChange={e => setOptEditDraft(d => d ? { ...d, answer: e.target.value } : d)}
                              className="w-full rounded-lg border border-violet-300 px-2.5 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none" />
                            <div className="flex gap-2">
                              <button type="button" onClick={saveOptEdit}
                                className="text-xs px-3 py-1 rounded-lg bg-violet-600 text-white font-semibold hover:bg-violet-700 transition-colors">Save</button>
                              <button type="button" onClick={() => { setOptEditIdx(null); setOptEditDraft(null); }}
                                className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 cursor-pointer" onClick={() => startOptEdit(i)}>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 leading-snug">{entry.question}</p>
                              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{entry.answer}</p>
                            </div>
                            <Pencil size={11} className="text-gray-300 shrink-0 mt-1" />
                          </div>
                        )}
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 mt-0.5 ${CATEGORY_COLORS[entry.category] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                        {entry.category}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Footer actions */}
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0 bg-white rounded-b-2xl">
                  <button type="button" onClick={closeOptimise}
                    className="text-sm px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors font-medium">
                    Cancel
                  </button>
                  <button type="button"
                    onClick={() => void handleApplyOptimise()}
                    disabled={optimisedEntries.filter(e => e.selected).length === 0}
                    className="flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition-colors font-semibold disabled:opacity-40 shadow-sm shadow-violet-200">
                    <Wand2 size={14} />
                    Apply {optimisedEntries.filter(e => e.selected).length} entries
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── New Collection Modal ── */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-green-100">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">New Collection</h2>
              <button type="button" aria-label="Close" onClick={() => { setShowNew(false); setColError(''); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">Name <span className="text-red-400">*</span></label>
                <input autoFocus value={newForm.name} onChange={e => setNewForm({ ...newForm, name: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && void handleCreate()}
                  placeholder="e.g. Support FAQ"
                  className="w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">Description <span className="text-gray-300">(optional)</span></label>
                <input value={newForm.description} onChange={e => setNewForm({ ...newForm, description: e.target.value })}
                  placeholder="What this collection covers…"
                  className="w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
              </div>
              {colError && <p className="text-xs text-red-500">{colError}</p>}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => { setShowNew(false); setColError(''); }}
                className="text-sm px-4 py-2.5 rounded-xl border border-green-200 text-gray-600 hover:bg-green-50 transition-colors font-medium">Cancel</button>
              <button type="button" onClick={() => void handleCreate()} disabled={saving || !newForm.name.trim()}
                className="text-sm px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold disabled:opacity-50 shadow-sm shadow-emerald-200">
                {saving ? 'Creating…' : 'Create Collection'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
