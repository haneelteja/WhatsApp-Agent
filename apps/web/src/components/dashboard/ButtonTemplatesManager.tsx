'use client';

import { useState } from 'react';
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronUp,
  Zap, List, Link as LinkIcon, MessageSquareMore,
  Loader2, AlertTriangle, Check, X,
} from 'lucide-react';
import {
  createButtonTemplateAction,
  updateButtonTemplateAction,
  deleteButtonTemplateAction,
  type ButtonTemplateRow,
} from '@/app/actions/button-templates';

// ─── Types ────────────────────────────────────────────────────────────────────

type TemplateType = 'quick_reply' | 'list' | 'cta_url';

interface QuickReplyButton { id: string; title: string }
interface ListRow          { id: string; title: string; description: string }
interface ListSection      { title: string; rows: ListRow[] }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_META: Record<TemplateType, { label: string; icon: React.ElementType; color: string }> = {
  quick_reply: { label: 'Quick Reply',  icon: MessageSquareMore, color: 'text-emerald-600 bg-emerald-50 border-emerald-200'  },
  list:        { label: 'List Menu',    icon: List,              color: 'text-sky-600     bg-sky-50     border-sky-200'       },
  cta_url:     { label: 'CTA URL',      icon: LinkIcon,          color: 'text-violet-600  bg-violet-50  border-violet-200'    },
};

const PRODUCTS = [
  { slug: null,           label: 'All bots'     },
  { slug: 'sales_bot',    label: 'Sales bot'    },
  { slug: 'support_bot',  label: 'Support bot'  },
  { slug: 'lifecycle_bot',label: 'Lifecycle bot' },
];

function slug(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

// ─── Template preview chip ────────────────────────────────────────────────────

function TypeChip({ type }: { type: TemplateType }) {
  const m = TYPE_META[type];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${m.color}`}>
      <Icon size={10} />
      {m.label}
    </span>
  );
}

// ─── Quick-reply button row editor ────────────────────────────────────────────

function QuickReplyEditor({ buttons, onChange }: {
  buttons:  QuickReplyButton[];
  onChange: (b: QuickReplyButton[]) => void;
}) {
  function add() {
    if (buttons.length >= 3) return;
    const id = `btn_${Date.now()}`;
    onChange([...buttons, { id, title: '' }]);
  }
  function update(idx: number, field: keyof QuickReplyButton, val: string) {
    const next = [...buttons];
    next[idx] = { ...next[idx]!, [field]: val };
    onChange(next);
  }
  function remove(idx: number) { onChange(buttons.filter((_, i) => i !== idx)); }

  return (
    <div className="space-y-2">
      {buttons.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={b.title}
            onChange={e => update(i, 'title', e.target.value)}
            maxLength={20}
            placeholder={`Button ${i + 1} label (max 20 chars)`}
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-400 outline-none"
          />
          <span className="text-[10px] text-slate-400 shrink-0">{b.title.length}/20</span>
          <button type="button" onClick={() => remove(i)} className="text-slate-400 hover:text-red-500"><X size={14}/></button>
        </div>
      ))}
      {buttons.length < 3 && (
        <button type="button" onClick={add}
          className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium">
          <Plus size={12}/> Add button
        </button>
      )}
    </div>
  );
}

// ─── List section editor ──────────────────────────────────────────────────────

function ListSectionEditor({ sections, onChange }: {
  sections: ListSection[];
  onChange: (s: ListSection[]) => void;
}) {
  const totalRows = sections.reduce((n, s) => n + s.rows.length, 0);

  function addSection() {
    onChange([...sections, { title: '', rows: [{ id: `row_${Date.now()}`, title: '', description: '' }] }]);
  }
  function updateSection(si: number, title: string) {
    const next = [...sections];
    next[si] = { ...next[si]!, title };
    onChange(next);
  }
  function removeSection(si: number) { onChange(sections.filter((_, i) => i !== si)); }

  function addRow(si: number) {
    if (totalRows >= 10) return;
    const next = [...sections];
    next[si]!.rows = [...next[si]!.rows, { id: `row_${Date.now()}`, title: '', description: '' }];
    onChange(next);
  }
  function updateRow(si: number, ri: number, field: keyof ListRow, val: string) {
    const next = [...sections];
    next[si]!.rows = [...next[si]!.rows];
    next[si]!.rows[ri] = { ...next[si]!.rows[ri]!, [field]: val };
    onChange(next);
  }
  function removeRow(si: number, ri: number) {
    const next = [...sections];
    next[si]!.rows = next[si]!.rows.filter((_, i) => i !== ri);
    onChange(next);
  }

  return (
    <div className="space-y-4">
      {sections.map((s, si) => (
        <div key={si} className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              value={s.title}
              onChange={e => updateSection(si, e.target.value)}
              placeholder="Section title"
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-1 focus:ring-sky-400 outline-none"
            />
            {sections.length > 1 && (
              <button type="button" onClick={() => removeSection(si)} className="text-slate-400 hover:text-red-500"><X size={14}/></button>
            )}
          </div>
          <div className="space-y-1.5 pl-2">
            {s.rows.map((r, ri) => (
              <div key={ri} className="flex items-start gap-2">
                <div className="flex-1 space-y-1">
                  <input
                    value={r.title}
                    onChange={e => updateRow(si, ri, 'title', e.target.value)}
                    maxLength={24}
                    placeholder="Row title (max 24 chars)"
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-sky-400 outline-none"
                  />
                  <input
                    value={r.description}
                    onChange={e => updateRow(si, ri, 'description', e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-500 focus:ring-1 focus:ring-sky-400 outline-none"
                  />
                </div>
                {s.rows.length > 1 && (
                  <button type="button" onClick={() => removeRow(si, ri)} className="mt-1 text-slate-400 hover:text-red-500"><X size={12}/></button>
                )}
              </div>
            ))}
            {totalRows < 10 && (
              <button type="button" onClick={() => addRow(si)}
                className="flex items-center gap-1 text-[11px] text-sky-600 hover:text-sky-700 font-medium mt-1">
                <Plus size={11}/> Add row
              </button>
            )}
          </div>
        </div>
      ))}
      <button type="button" onClick={addSection}
        className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-medium">
        <Plus size={12}/> Add section
      </button>
      <p className="text-[10px] text-slate-400">{totalRows}/10 rows used</p>
    </div>
  );
}

// ─── Template form ────────────────────────────────────────────────────────────

interface FormState {
  name:             string;
  description:      string;
  type:             TemplateType;
  product_slug:     string | null;
  trigger_keywords: string;
  is_active:        boolean;
  // quick_reply
  qr_body:    string;
  qr_buttons: QuickReplyButton[];
  // list
  list_body:         string;
  list_button_label: string;
  list_sections:     ListSection[];
  // cta_url
  cta_body:        string;
  cta_button_text: string;
  cta_url:         string;
}

function defaultForm(row?: ButtonTemplateRow): FormState {
  const j = row?.template_json ?? {};
  return {
    name:             row?.name        ?? '',
    description:      row?.description ?? '',
    type:             row?.type        ?? 'quick_reply',
    product_slug:     row?.product_slug ?? null,
    trigger_keywords: (row?.trigger_keywords ?? []).join(', '),
    is_active:        row?.is_active   ?? true,
    // quick_reply
    qr_body:    (j['body'] as string | undefined)    ?? '',
    qr_buttons: ((j['buttons'] as QuickReplyButton[] | undefined) ?? [{ id: 'btn_1', title: '' }, { id: 'btn_2', title: '' }]),
    // list
    list_body:         (j['body'] as string | undefined)         ?? '',
    list_button_label: (j['button_label'] as string | undefined) ?? 'Choose an option',
    list_sections:     ((j['sections'] as ListSection[] | undefined) ?? [{ title: '', rows: [{ id: 'row_1', title: '', description: '' }] }]),
    // cta_url
    cta_body:        (j['body'] as string | undefined)        ?? '',
    cta_button_text: (j['button_text'] as string | undefined) ?? '',
    cta_url:         (j['url'] as string | undefined)         ?? '',
  };
}

function buildTemplateJson(f: FormState): Record<string, unknown> {
  if (f.type === 'quick_reply') {
    return {
      body:    f.qr_body,
      buttons: f.qr_buttons.filter(b => b.title.trim()),
    };
  }
  if (f.type === 'list') {
    return {
      body:         f.list_body,
      button_label: f.list_button_label,
      sections:     f.list_sections,
    };
  }
  return {
    body:        f.cta_body,
    button_text: f.cta_button_text,
    url:         f.cta_url,
  };
}

function TemplateForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?:  ButtonTemplateRow;
  onSave:    (row: ButtonTemplateRow) => void;
  onCancel:  () => void;
}) {
  const [form, setForm]   = useState<FormState>(() => defaultForm(initial));
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const set = (patch: Partial<FormState>) => setForm(f => ({ ...f, ...patch }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      name:             slug(form.name) || slug(form.description) || 'template',
      description:      form.description || null,
      type:             form.type,
      product_slug:     form.product_slug || null,
      trigger_keywords: form.trigger_keywords.split(',').map(s => s.trim()).filter(Boolean),
      is_active:        form.is_active,
      template_json:    buildTemplateJson(form),
    };

    let result;
    if (initial) {
      result = await updateButtonTemplateAction(initial.id, payload);
    } else {
      result = await createButtonTemplateAction(payload as Parameters<typeof createButtonTemplateAction>[0]);
    }

    setSaving(false);
    if (result.error) { setError(result.error); return; }
    if (result.template) onSave(result.template);
  }

  return (
    <form onSubmit={e => void handleSubmit(e)} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
      <h3 className="font-semibold text-slate-800">{initial ? 'Edit template' : 'New button template'}</h3>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          <AlertTriangle size={13}/>{error}
        </div>
      )}

      {/* Basic info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Name (used by AI) <span className="text-red-500">*</span></label>
          <input
            required value={form.name}
            onChange={e => set({ name: e.target.value })}
            placeholder="e.g. product_interest"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-400 outline-none"
          />
          {form.name && <p className="text-[10px] text-slate-400 mt-1">Saved as: <code className="font-mono">{slug(form.name)}</code></p>}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
          <input
            value={form.description}
            onChange={e => set({ description: e.target.value })}
            placeholder="What does this template do?"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-400 outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Button type</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(TYPE_META) as TemplateType[]).map(t => {
              const m = TYPE_META[t];
              const Icon = m.icon;
              return (
                <button key={t} type="button" onClick={() => set({ type: t })}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[11px] font-medium transition-colors ${
                    form.type === t
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}>
                  <Icon size={14}/>
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Bot scope</label>
          <select
            value={form.product_slug ?? ''}
            onChange={e => set({ product_slug: e.target.value || null })}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-400 outline-none bg-white"
          >
            {PRODUCTS.map(p => (
              <option key={p.slug ?? 'all'} value={p.slug ?? ''}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Type-specific fields */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
        {form.type === 'quick_reply' && (
          <>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Message body</label>
              <textarea
                value={form.qr_body} rows={2}
                onChange={e => set({ qr_body: e.target.value })}
                placeholder="The question or context shown above the buttons"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:ring-1 focus:ring-emerald-400 outline-none bg-white"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">Note: the AI&apos;s actual reply replaces this at send time.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Buttons (up to 3)</label>
              <QuickReplyEditor buttons={form.qr_buttons} onChange={b => set({ qr_buttons: b })} />
            </div>
          </>
        )}

        {form.type === 'list' && (
          <>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Message body</label>
              <textarea
                value={form.list_body} rows={2}
                onChange={e => set({ list_body: e.target.value })}
                placeholder="Intro text above the list picker"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:ring-1 focus:ring-sky-400 outline-none bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">List button label</label>
              <input
                value={form.list_button_label}
                onChange={e => set({ list_button_label: e.target.value })}
                placeholder="e.g. View options"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-sky-400 outline-none bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Sections &amp; rows (up to 10 rows total)</label>
              <ListSectionEditor sections={form.list_sections} onChange={s => set({ list_sections: s })} />
            </div>
          </>
        )}

        {form.type === 'cta_url' && (
          <>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Message body</label>
              <textarea
                value={form.cta_body} rows={2}
                onChange={e => set({ cta_body: e.target.value })}
                placeholder="Text shown above the CTA button"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:ring-1 focus:ring-violet-400 outline-none bg-white"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Button text</label>
                <input
                  value={form.cta_button_text}
                  onChange={e => set({ cta_button_text: e.target.value })}
                  placeholder="e.g. View Catalogue"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-violet-400 outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">URL</label>
                <input
                  type="url" value={form.cta_url}
                  onChange={e => set({ cta_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-violet-400 outline-none bg-white"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Trigger keywords */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">
          Rule-based trigger keywords
          <span className="text-slate-400 font-normal ml-1">(comma-separated — auto-suggest this template when user message contains any keyword)</span>
        </label>
        <input
          value={form.trigger_keywords}
          onChange={e => set({ trigger_keywords: e.target.value })}
          placeholder="e.g. price, product, interested, buy"
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-400 outline-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox" checked={form.is_active}
            onChange={e => set({ is_active: e.target.checked })}
            className="rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
          />
          <span className="text-sm text-slate-600">Active</span>
        </label>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors">
          {saving ? <Loader2 size={13} className="animate-spin"/> : <Check size={13}/>}
          {initial ? 'Save changes' : 'Create template'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Template card ────────────────────────────────────────────────────────────

function TemplateCard({
  row,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  row:            ButtonTemplateRow;
  onEdit:         () => void;
  onDelete:       () => void;
  onToggleActive: (active: boolean) => void;
}) {
  const [expanded,   setExpanded]   = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [toggling,   setToggling]   = useState(false);

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return; }
    setDeleting(true);
    await deleteButtonTemplateAction(row.id);
    onDelete();
  }

  async function handleToggle() {
    setToggling(true);
    const next = !row.is_active;
    await updateButtonTemplateAction(row.id, { is_active: next });
    onToggleActive(next);
    setToggling(false);
  }

  const j = row.template_json;
  const scopeLabel = PRODUCTS.find(p => p.slug === row.product_slug)?.label ?? 'All bots';

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
      row.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60'
    }`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <TypeChip type={row.type} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 font-mono">{row.name}</p>
          {row.description && <p className="text-xs text-slate-500 truncate">{row.description}</p>}
        </div>
        <span className="text-[11px] text-slate-400 shrink-0">{scopeLabel}</span>
        {/* Active toggle */}
        <button
          type="button"
          onClick={() => void handleToggle()}
          disabled={toggling}
          title={row.is_active ? 'Click to deactivate' : 'Click to activate'}
          className={`relative w-9 h-5 rounded-full transition-colors shrink-0 focus:outline-none ${
            row.is_active ? 'bg-emerald-500' : 'bg-slate-200'
          } ${toggling ? 'opacity-50' : ''}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${row.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
        <button type="button" onClick={() => setExpanded(e => !e)} className="text-slate-400 hover:text-slate-600">
          {expanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
        </button>
        <button type="button" onClick={onEdit} className="text-slate-400 hover:text-slate-700"><Pencil size={14}/></button>
        {confirmDel ? (
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" disabled={deleting} onClick={() => void handleDelete()}
              className="text-xs text-red-600 font-semibold hover:text-red-700">
              {deleting ? '…' : 'Delete?'}
            </button>
            <button type="button" onClick={() => setConfirmDel(false)} className="text-slate-400 text-xs">Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDel(true)} className="text-slate-400 hover:text-red-500"><Trash2 size={14}/></button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 space-y-2 text-xs text-slate-600">
          {row.type === 'quick_reply' && (
            <>
              <p className="font-medium">Body: <span className="font-normal">{(j['body'] as string | undefined) ?? '—'}</span></p>
              <div className="flex gap-2 flex-wrap">
                {((j['buttons'] as QuickReplyButton[] | undefined) ?? []).map(b => (
                  <span key={b.id} className="bg-white border border-slate-200 rounded-lg px-3 py-1">{b.title}</span>
                ))}
              </div>
            </>
          )}
          {row.type === 'list' && (
            <>
              <p className="font-medium">Body: <span className="font-normal">{(j['body'] as string | undefined) ?? '—'}</span></p>
              {((j['sections'] as ListSection[] | undefined) ?? []).map((s, i) => (
                <div key={i}>
                  <p className="font-semibold text-slate-700">{s.title || '(untitled section)'}</p>
                  <ul className="ml-3 space-y-0.5">
                    {s.rows.map(r => <li key={r.id}>• {r.title}{r.description ? ` — ${r.description}` : ''}</li>)}
                  </ul>
                </div>
              ))}
            </>
          )}
          {row.type === 'cta_url' && (
            <>
              <p className="font-medium">Body: <span className="font-normal">{(j['body'] as string | undefined) ?? '—'}</span></p>
              <p>Button: <span className="font-mono">{(j['button_text'] as string | undefined) ?? '—'}</span></p>
              <p>URL: <span className="font-mono text-violet-700 break-all">{(j['url'] as string | undefined) ?? '—'}</span></p>
            </>
          )}
          {row.trigger_keywords.length > 0 && (
            <div className="flex items-center gap-1.5 pt-1">
              <Zap size={11} className="text-amber-500 shrink-0"/>
              <span className="text-slate-500">Triggers on:</span>
              {row.trigger_keywords.map(k => (
                <span key={k} className="bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full text-[10px] font-medium">{k}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main manager ─────────────────────────────────────────────────────────────

export function ButtonTemplatesManager({ initialTemplates }: { initialTemplates: ButtonTemplateRow[] }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [mode, setMode] = useState<'list' | 'new' | { edit: ButtonTemplateRow }>('list');

  function handleSaved(row: ButtonTemplateRow) {
    setTemplates(ts => {
      const idx = ts.findIndex(t => t.id === row.id);
      return idx >= 0 ? ts.map((t, i) => i === idx ? row : t) : [...ts, row];
    });
    setMode('list');
  }

  function handleDeleted(id: string) {
    setTemplates(ts => ts.filter(t => t.id !== id));
  }

  function handleToggled(id: string, active: boolean) {
    setTemplates(ts => ts.map(t => t.id === id ? { ...t, is_active: active } : t));
  }

  if (mode === 'new') {
    return <TemplateForm onSave={handleSaved} onCancel={() => setMode('list')} />;
  }

  if (typeof mode === 'object' && 'edit' in mode) {
    return <TemplateForm initial={mode.edit} onSave={handleSaved} onCancel={() => setMode('list')} />;
  }

  return (
    <div className="space-y-4">
      {/* How it works */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-1.5">
        <p className="text-xs font-semibold text-emerald-800">How it works</p>
        <ul className="text-xs text-emerald-700 space-y-1 list-disc ml-4">
          <li>Create a template here and give it a short name (e.g. <code className="font-mono bg-emerald-100 px-1 rounded">product_interest</code>)</li>
          <li>The AI sees available templates and appends <code className="font-mono bg-emerald-100 px-1 rounded">[BUTTONS:product_interest]</code> when appropriate</li>
          <li>You can also set trigger keywords — if the customer&apos;s message matches, the AI is nudged to use that template</li>
          <li>When a customer taps a button, their selection flows back to the AI as regular text</li>
        </ul>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-12 text-center">
          <MessageSquareMore size={32} className="text-slate-300 mx-auto mb-3"/>
          <p className="text-sm text-slate-500 mb-4">No button templates yet</p>
          <button type="button" onClick={() => setMode('new')}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors mx-auto">
            <Plus size={14}/> Create first template
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {templates.map(row => (
              <TemplateCard
                key={row.id}
                row={row}
                onEdit={() => setMode({ edit: row })}
                onDelete={() => handleDeleted(row.id)}
                onToggleActive={(active) => handleToggled(row.id, active)}
              />
            ))}
          </div>
          <button type="button" onClick={() => setMode('new')}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors">
            <Plus size={14}/> New template
          </button>
        </>
      )}
    </div>
  );
}
