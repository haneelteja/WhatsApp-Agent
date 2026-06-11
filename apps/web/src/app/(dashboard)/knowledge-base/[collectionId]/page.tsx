'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, Plus, Pencil, Trash2, Search, X,
  Upload, ToggleLeft, ToggleRight, BookOpen,
  FileText, ImageIcon, FileCode, File, AlertCircle, CheckCircle2, Loader2,
} from 'lucide-react';
import { kbFetch, kbUpload } from '@/lib/kb-client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Collection {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  entry_count: number;
  embedding_model: string;
}

interface BotAssignment { product_slug: string; }

interface Entry {
  id: string;
  question: string;
  answer: string;
  category: string;
  status: string;
  version: number;
  source_document_id: string | null;
  created_at: string;
}

interface KBDoc {
  id: string;
  name: string;
  file_type: 'pdf' | 'docx' | 'txt' | 'md' | 'image';
  file_size: number | null;
  status: 'pending' | 'processing' | 'done' | 'error';
  error_message: string | null;
  chunk_count: number;
  created_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BOTS = [
  { slug: 'support_bot',   label: 'Support Bot',   on: 'bg-sky-50 text-sky-700 border-sky-200',         off: 'bg-gray-50 text-gray-400 border-gray-200' },
  { slug: 'sales_bot',     label: 'Sales Bot',     on: 'bg-violet-50 text-violet-700 border-violet-200', off: 'bg-gray-50 text-gray-400 border-gray-200' },
  { slug: 'lifecycle_bot', label: 'Lifecycle Bot', on: 'bg-orange-50 text-orange-700 border-orange-200', off: 'bg-gray-50 text-gray-400 border-gray-200' },
];

const EMPTY_ENTRY = { question: '', answer: '', category: '', status: 'live' };
const PAGE_SIZE = 20;

const ACCEPT_TYPES = '.pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp,.gif';

function formatBytes(b: number | null): string {
  if (!b) return '';
  if (b < 1024)        return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function DocIcon({ type }: { type: KBDoc['file_type'] }) {
  if (type === 'image') return <ImageIcon size={14} className="text-violet-400" />;
  if (type === 'pdf')   return <FileText  size={14} className="text-red-400" />;
  if (type === 'docx')  return <FileText  size={14} className="text-blue-400" />;
  if (type === 'md')    return <FileCode  size={14} className="text-emerald-400" />;
  return <File size={14} className="text-gray-400" />;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CollectionDetailPage() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'entries' | 'documents'>('entries');

  // Collection
  const [collection,   setCollection]   = useState<Collection | null>(null);
  const [bots,         setBots]         = useState<string[]>([]);
  const [togglingBot,  setTogglingBot]  = useState<string | null>(null);

  // Entries
  const [entries,    setEntries]    = useState<Entry[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [search,     setSearch]     = useState('');
  const [loadingEntries, setLoadingEntries] = useState(true);

  // Entry form modal
  const [showForm,   setShowForm]   = useState(false);
  const [editing,    setEditing]    = useState<Entry | null>(null);
  const [form,       setForm]       = useState(EMPTY_ENTRY);
  const [saving,     setSaving]     = useState(false);
  const [formError,  setFormError]  = useState('');

  // Bulk import modal
  const [showBulk,   setShowBulk]   = useState(false);
  const [bulkText,   setBulkText]   = useState('');
  const [bulkError,  setBulkError]  = useState('');
  const [importing,  setImporting]  = useState(false);

  // Documents
  const [documents,     setDocuments]     = useState<KBDoc[]>([]);
  const [loadingDocs,   setLoadingDocs]   = useState(false);
  const [uploading,     setUploading]     = useState(false);
  const [uploadError,   setUploadError]   = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data loading ─────────────────────────────────────────────────────────────

  const loadCollection = useCallback(async () => {
    const res = await kbFetch(`/api/kb/collections/${collectionId}`);
    if (!res.ok) { router.push('/knowledge-base'); return; }
    const json = await res.json() as { data: Collection & { kb_collection_bots: BotAssignment[] } };
    const { kb_collection_bots, ...col } = json.data;
    setCollection(col);
    setBots((kb_collection_bots ?? []).map((b: BotAssignment) => b.product_slug));
  }, [collectionId, router]);

  const loadEntries = useCallback(async () => {
    setLoadingEntries(true);
    const params = new URLSearchParams({
      page: String(page), limit: String(PAGE_SIZE),
      ...(search.trim() ? { search: search.trim() } : {}),
    });
    const res = await kbFetch(`/api/kb/collections/${collectionId}?${params}`);
    if (!res.ok) { setLoadingEntries(false); return; }
    const json = await res.json() as { entries: Entry[]; total: number };
    setEntries(json.entries ?? []);
    setTotal(json.total ?? 0);
    setLoadingEntries(false);
  }, [collectionId, page, search]);

  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true);
    const res = await kbFetch(`/api/kb/collections/${collectionId}/documents`);
    if (res.ok) {
      const json = await res.json() as { data: KBDoc[] };
      setDocuments(json.data ?? []);
    }
    setLoadingDocs(false);
  }, [collectionId]);

  useEffect(() => { void loadCollection(); }, [loadCollection]);
  useEffect(() => { void loadEntries();    }, [loadEntries]);
  useEffect(() => { void loadDocuments();  }, [loadDocuments]);
  useEffect(() => { setPage(1); }, [search]);

  // Poll for document processing status while any doc is pending/processing
  useEffect(() => {
    const hasActive = documents.some(d => d.status === 'pending' || d.status === 'processing');
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(() => {
        void loadDocuments();
        void loadCollection(); // refreshes entry_count
      }, 3000);
    }
    if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      void loadEntries(); // reload entries now that processing finished
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [documents, loadDocuments, loadCollection, loadEntries]);

  // ── Bot assignment ────────────────────────────────────────────────────────────

  async function toggleBot(slug: string) {
    if (togglingBot) return;
    setTogglingBot(slug);
    const assigned = bots.includes(slug);
    if (assigned) {
      await kbFetch(`/api/kb/collections/${collectionId}/bots/${slug}`, { method: 'DELETE' });
      setBots(prev => prev.filter(b => b !== slug));
    } else {
      await kbFetch(`/api/kb/collections/${collectionId}/bots`, {
        method: 'POST', body: JSON.stringify({ product_slug: slug }),
      });
      setBots(prev => [...prev, slug]);
    }
    setTogglingBot(null);
  }

  async function toggleActive() {
    if (!collection) return;
    const res = await kbFetch(`/api/kb/collections/${collectionId}`, {
      method: 'PATCH', body: JSON.stringify({ active: !collection.active }),
    });
    if (res.ok) setCollection({ ...collection, active: !collection.active });
  }

  // ── Entry form ────────────────────────────────────────────────────────────────

  function openNew() { setEditing(null); setForm(EMPTY_ENTRY); setFormError(''); setShowForm(true); }
  function openEdit(e: Entry) {
    setEditing(e);
    setForm({ question: e.question, answer: e.answer, category: e.category, status: e.status });
    setFormError(''); setShowForm(true);
  }

  async function handleSaveEntry() {
    if (!form.question.trim() || !form.answer.trim()) { setFormError('Question and answer are required.'); return; }
    setSaving(true); setFormError('');
    const res = editing
      ? await kbFetch(`/api/kb/entries/${editing.id}`, { method: 'PUT', body: JSON.stringify(form) })
      : await kbFetch(`/api/kb/collections/${collectionId}/entries`, { method: 'POST', body: JSON.stringify(form) });
    if (!res.ok) { setFormError((await res.json() as { error?: string }).error ?? 'Save failed'); setSaving(false); return; }
    setSaving(false); setShowForm(false);
    void loadEntries(); void loadCollection();
  }

  async function handleDeleteEntry(id: string) {
    if (!confirm('Delete this entry?')) return;
    await kbFetch(`/api/kb/entries/${id}`, { method: 'DELETE' });
    void loadEntries(); void loadCollection();
  }

  // ── Bulk import ───────────────────────────────────────────────────────────────

  function parseBulkCSV(raw: string) {
    const rows: { question: string; answer: string; category: string }[] = [];
    const errors: string[] = [];
    raw.split('\n').forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const cols: string[] = []; let current = ''; let inQuote = false;
      for (const ch of trimmed) {
        if (ch === '"') { inQuote = !inQuote; continue; }
        if (ch === ',' && !inQuote) { cols.push(current.trim()); current = ''; continue; }
        current += ch;
      }
      cols.push(current.trim());
      if (cols.length < 2) { errors.push(`Line ${i + 1}: need at least question,answer`); return; }
      rows.push({ question: cols[0] ?? '', answer: cols[1] ?? '', category: cols[2] ?? 'General' });
    });
    return { rows, errors };
  }

  async function handleBulkImport() {
    setBulkError('');
    const { rows, errors } = parseBulkCSV(bulkText);
    if (errors.length) { setBulkError(errors.join('\n')); return; }
    if (!rows.length)  { setBulkError('No valid rows found.'); return; }
    if (rows.length > 100) { setBulkError('Max 100 entries per import.'); return; }
    setImporting(true);
    const res = await kbFetch(`/api/kb/collections/${collectionId}/entries/bulk`, {
      method: 'POST', body: JSON.stringify({ entries: rows }),
    });
    if (!res.ok) { setBulkError((await res.json() as { error?: string }).error ?? 'Import failed'); setImporting(false); return; }
    const result = await res.json() as { inserted: number };
    setImporting(false); setShowBulk(false); setBulkText('');
    void loadEntries(); void loadCollection();
    alert(`Imported ${result.inserted} entries successfully.`);
  }

  // ── Document upload ───────────────────────────────────────────────────────────

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError('');
    setUploading(true);

    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append('file', file);
      const res = await kbUpload(`/api/kb/collections/${collectionId}/documents`, fd);
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        setUploadError(json.error ?? `Upload failed: ${file.name}`);
        setUploading(false);
        return;
      }
    }
    setUploading(false);
    void loadDocuments();
  }

  async function handleDeleteDoc(id: string, name: string) {
    if (!confirm(`Delete "${name}" and all its extracted entries? This cannot be undone.`)) return;
    await kbFetch(`/api/kb/documents/${id}`, { method: 'DELETE' });
    void loadDocuments(); void loadEntries(); void loadCollection();
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!collection) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-5">

      {/* Breadcrumb + header */}
      <div className="space-y-2">
        <Link href="/knowledge-base" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-emerald-600 transition-colors font-medium">
          <ChevronLeft size={13} /> Knowledge Base
        </Link>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">{collection.name}</h2>
            <button
              type="button" onClick={() => void toggleActive()}
              className={`text-[11px] px-2.5 py-1 rounded-full font-semibold border transition-colors ${
                collection.active
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200'
              }`}
            >
              {collection.active ? 'Active' : 'Inactive'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'entries' ? (
              <>
                <button type="button" onClick={() => setShowBulk(true)}
                  className="flex items-center gap-2 text-sm px-3.5 py-2 rounded-xl border border-green-200 text-gray-600 hover:bg-green-50 transition-colors font-medium">
                  <Upload size={14} /> Bulk Import
                </button>
                <button type="button" onClick={openNew}
                  className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold shadow-sm shadow-emerald-200">
                  <Plus size={15} /> Add Entry
                </button>
              </>
            ) : (
              <>
                <input
                  ref={fileInputRef} type="file" multiple accept={ACCEPT_TYPES}
                  aria-label="Upload documents"
                  title="Upload documents"
                  className="hidden"
                  onChange={e => void handleFileUpload(e.target.files)}
                />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors font-semibold shadow-sm shadow-emerald-200">
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {uploading ? 'Uploading…' : 'Upload Document'}
                </button>
              </>
            )}
          </div>
        </div>
        {collection.description && <p className="text-sm text-gray-500">{collection.description}</p>}
      </div>

      {/* Bot assignment */}
      <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Bot Assignments</p>
        <div className="flex flex-wrap gap-2">
          {BOTS.map(bot => {
            const on = bots.includes(bot.slug);
            const busy = togglingBot === bot.slug;
            return (
              <button key={bot.slug} type="button" onClick={() => void toggleBot(bot.slug)} disabled={busy}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-medium transition-all disabled:opacity-60 ${on ? bot.on : bot.off}`}>
                {busy ? <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                       : on ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                {bot.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Active bots will search this collection when answering messages.</p>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 bg-white border border-green-100 rounded-xl shadow-sm p-1 w-fit">
        <button type="button" onClick={() => setActiveTab('entries')}
          className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors ${
            activeTab === 'entries' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}>
          Entries <span className="ml-1.5 text-xs opacity-70">{total}</span>
        </button>
        <button type="button" onClick={() => setActiveTab('documents')}
          className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors ${
            activeTab === 'documents' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}>
          Documents <span className="ml-1.5 text-xs opacity-70">{documents.length}</span>
        </button>
      </div>

      {/* ── ENTRIES TAB ───────────────────────────────────────────────────────── */}
      {activeTab === 'entries' && (
        <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="px-5 py-3 border-b border-green-50 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search entries…"
                className="w-full pl-8 pr-8 py-2 text-sm rounded-xl border border-green-200 bg-green-50/50 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={13} />
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 shrink-0">{total} {total === 1 ? 'entry' : 'entries'}</p>
          </div>

          {loadingEntries && (
            <div className="flex items-center justify-center py-16">
              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loadingEntries && !entries.length && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center mb-3 border border-green-100">
                <BookOpen size={20} className="text-green-400" />
              </div>
              <p className="text-sm font-semibold text-gray-600">
                {search ? `No entries matching "${search}"` : 'No entries yet'}
              </p>
              {!search && <p className="text-xs text-gray-400 mt-1">Add entries manually, bulk import CSV, or upload a document.</p>}
            </div>
          )}

          {!loadingEntries && entries.length > 0 && (
            <div className="divide-y divide-green-50">
              {entries.map(entry => (
                <div key={entry.id} className="flex items-start gap-4 px-5 py-4 hover:bg-green-50/40 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {entry.source_document_id && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-500 border border-violet-100 font-medium shrink-0 flex items-center gap-0.5">
                          <FileText size={9} /> doc
                        </span>
                      )}
                      {entry.category && (
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 font-medium shrink-0">{entry.category}</span>
                      )}
                      <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium shrink-0 ${
                        entry.status === 'live' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'
                      }`}>{entry.status}</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-800 truncate">{entry.question}</p>
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{entry.answer}</p>
                  </div>
                  {!entry.source_document_id && (
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button type="button" onClick={() => openEdit(entry)} aria-label="Edit"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button type="button" onClick={() => void handleDeleteEntry(entry.id)} aria-label="Delete"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-green-50 flex items-center justify-between">
              <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="text-xs px-3 py-1.5 rounded-lg border border-green-200 text-gray-600 hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium">
                Previous
              </button>
              <p className="text-xs text-gray-400">Page {page} of {totalPages}</p>
              <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="text-xs px-3 py-1.5 rounded-lg border border-green-200 text-gray-600 hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium">
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── DOCUMENTS TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'documents' && (
        <div className="space-y-3">
          {/* Supported formats note */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs text-emerald-700 flex items-start gap-2">
            <BookOpen size={13} className="shrink-0 mt-0.5" />
            <span>
              Supported: <strong>PDF, DOCX, TXT, MD</strong> (auto-chunked) and <strong>JPG, PNG, WEBP</strong> (AI text extraction via Claude Haiku).
              Each document is chunked into KB entries and embedded automatically — no manual work needed.
            </span>
          </div>

          {uploadError && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-600 flex items-center gap-2">
              <AlertCircle size={13} className="shrink-0" /> {uploadError}
              <button type="button" aria-label="Dismiss error" onClick={() => setUploadError('')} className="ml-auto"><X size={12} /></button>
            </div>
          )}

          {/* Drop zone */}
          <div
            className="border-2 border-dashed border-green-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); void handleFileUpload(e.dataTransfer.files); }}
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <Upload size={20} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700">Drop files here or click to upload</p>
              <p className="text-xs text-gray-400 mt-0.5">PDF · DOCX · TXT · MD · JPG · PNG · WEBP — up to 50 MB each</p>
            </div>
          </div>

          {/* Documents list */}
          {loadingDocs && !documents.length ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : documents.length === 0 ? (
            <div className="bg-white rounded-2xl border border-green-100 shadow-sm flex flex-col items-center justify-center py-10 text-center">
              <p className="text-sm font-semibold text-gray-500">No documents uploaded yet</p>
              <p className="text-xs text-gray-400 mt-1">Upload a PDF, DOCX, image, or text file to get started.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-green-100 shadow-sm divide-y divide-green-50 overflow-hidden">
              {documents.map(doc => (
                <div key={doc.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-green-50/30 transition-colors group">
                  {/* Icon */}
                  <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                    <DocIcon type={doc.file_type} />
                  </div>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{doc.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatBytes(doc.file_size)}
                      {doc.status === 'done' && <span className="ml-2 text-gray-500">{doc.chunk_count} chunk{doc.chunk_count !== 1 ? 's' : ''}</span>}
                      {doc.status === 'error' && <span className="ml-2 text-red-400 truncate max-w-xs">{doc.error_message}</span>}
                    </p>
                  </div>

                  {/* Status badge */}
                  <div className="shrink-0">
                    {doc.status === 'done' && (
                      <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">
                        <CheckCircle2 size={11} /> Ready
                      </span>
                    )}
                    {(doc.status === 'pending' || doc.status === 'processing') && (
                      <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-100 font-medium">
                        <Loader2 size={11} className="animate-spin" />
                        {doc.status === 'pending' ? 'Queued' : 'Processing…'}
                      </span>
                    )}
                    {doc.status === 'error' && (
                      <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-red-50 text-red-600 border border-red-100 font-medium">
                        <AlertCircle size={11} /> Failed
                      </span>
                    )}
                  </div>

                  {/* Delete */}
                  <button type="button" onClick={() => void handleDeleteDoc(doc.id, doc.name)} aria-label="Delete document"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:bg-red-50 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Add / Edit Entry Modal ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 border border-green-100">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">{editing ? 'Edit Entry' : 'New Entry'}</h2>
              <button type="button" aria-label="Close" onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">Category</label>
                <input className="w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Shipping" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">Status</label>
                <select aria-label="Status" className="w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="live">Live</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">Question <span className="text-red-400">*</span></label>
              <input autoFocus={!editing}
                className="w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                value={form.question} onChange={e => setForm({ ...form, question: e.target.value })} placeholder="What is your return policy?" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">Answer <span className="text-red-400">*</span></label>
              <textarea className="w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                rows={4} value={form.answer} onChange={e => setForm({ ...form, answer: e.target.value })}
                placeholder="We accept returns within 30 days…" />
            </div>
            {formError && <p className="text-xs text-red-500">{formError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowForm(false)}
                className="text-sm px-4 py-2.5 rounded-xl border border-green-200 text-gray-600 hover:bg-green-50 transition-colors font-medium">Cancel</button>
              <button type="button" onClick={() => void handleSaveEntry()} disabled={saving}
                className="text-sm px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold disabled:opacity-50 shadow-sm shadow-emerald-200">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Import Modal ──────────────────────────────────────────────────── */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-4 border border-green-100">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Bulk Import</h2>
              <button type="button" aria-label="Close" onClick={() => { setShowBulk(false); setBulkText(''); setBulkError(''); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"><X size={16} /></button>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-xs text-gray-600 space-y-1 border border-green-100">
              <p className="font-semibold text-gray-700">CSV format — one row per entry:</p>
              <code className="block font-mono text-[11px] text-gray-500">question,answer,category</code>
              <code className="block font-mono text-[11px] text-gray-500">&quot;How do I reset?&quot;,&quot;Go to Settings → Security.&quot;,Account</code>
              <p className="text-gray-400 pt-1">Lines starting with # are ignored. Max 100 rows.</p>
            </div>
            <textarea className="w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              rows={10} value={bulkText} onChange={e => setBulkText(e.target.value)}
              placeholder={`# Paste your CSV here\n"How do I track my order?","Visit tracking.example.com with your order ID.","Orders"`} />
            {bulkError && <pre className="text-xs text-red-500 whitespace-pre-wrap">{bulkError}</pre>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => { setShowBulk(false); setBulkText(''); setBulkError(''); }}
                className="text-sm px-4 py-2.5 rounded-xl border border-green-200 text-gray-600 hover:bg-green-50 transition-colors font-medium">Cancel</button>
              <button type="button" onClick={() => void handleBulkImport()} disabled={importing || !bulkText.trim()}
                className="text-sm px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold disabled:opacity-50 shadow-sm shadow-emerald-200">
                {importing ? 'Importing…' : 'Import Entries'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
