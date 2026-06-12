'use client';

import { useState, useTransition } from 'react';
import { CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Trash2, RefreshCw, Key, Save, AlertCircle } from 'lucide-react';
import { saveLlmConfigAction, validateLlmConfigAction, deleteLlmConfigAction } from '@/app/actions/llm-configs';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CreditInfo {
  usage: number | null;
  limit: number | null;
  is_free_tier: boolean;
}

interface ConfigState {
  id?: string;
  provider: string;
  api_key_masked: string;
  model: string;
  base_url: string | null;
  validation_status: 'pending' | 'valid' | 'invalid';
  validation_error: string | null;
  validated_at: string | null;
  credit_info: CreditInfo | null;
  created_at: string;
}

export interface LlmConfigCardProps {
  label:       string;
  description?: string;
  tenantId:    string | null;
  productSlug: string | null;
  initial:     ConfigState | null;
  accent?:     'indigo' | 'emerald';
}

// ── Provider / model constants ────────────────────────────────────────────────

const PROVIDERS = [
  { value: 'openrouter', label: 'OpenRouter',  hint: 'Recommended — access 300+ models with one key' },
  { value: 'openai',     label: 'OpenAI',      hint: 'Direct OpenAI API (GPT-4o, etc.)'              },
  { value: 'custom',     label: 'Custom',       hint: 'Any OpenAI-compatible endpoint (self-hosted)'  },
];

const MODEL_SUGGESTIONS: Record<string, string[]> = {
  openrouter: [
    'anthropic/claude-3.5-haiku',
    'anthropic/claude-sonnet-4-5',
    'anthropic/claude-opus-4',
    'openai/gpt-4o-mini',
    'openai/gpt-4o',
    'google/gemini-flash-1.5',
    'meta-llama/llama-3.1-8b-instruct:free',
  ],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  custom: [],
};

const PROVIDER_LINKS: Record<string, string> = {
  openrouter: 'https://openrouter.ai/keys',
  openai:     'https://platform.openai.com/api-keys',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function LlmConfigCard({
  label,
  description,
  tenantId,
  productSlug,
  initial,
  accent = 'indigo',
}: LlmConfigCardProps) {
  const [config,    setConfig]    = useState<ConfigState | null>(initial);
  const [editing,   setEditing]   = useState(false);
  const [toast,     setToast]     = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const [provider,  setProvider]  = useState(initial?.provider ?? 'openrouter');
  const [apiKey,    setApiKey]    = useState('');
  const [model,     setModel]     = useState(initial?.model ?? '');
  const [baseUrl,   setBaseUrl]   = useState(initial?.base_url ?? '');

  const [isSaving,    startSave]     = useTransition();
  const [isValidating, startValidate] = useTransition();
  const [isDeleting,  startDelete]   = useTransition();

  const ring  = accent === 'emerald' ? 'focus:ring-2 focus:ring-emerald-300' : 'focus:ring-2 focus:ring-indigo-300';
  const btnBg = accent === 'emerald' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700';
  const accentText = accent === 'emerald' ? 'text-emerald-600' : 'text-indigo-600';

  function flash(type: 'ok' | 'err', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  }

  function openEdit() {
    setProvider(config?.provider ?? 'openrouter');
    setModel(config?.model ?? '');
    setBaseUrl(config?.base_url ?? '');
    setApiKey('');
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  function handleSave() {
    startSave(async () => {
      const result = await saveLlmConfigAction(
        tenantId, productSlug, provider, apiKey, model,
        provider === 'custom' ? baseUrl : undefined,
      );
      if (!result.ok) { flash('err', result.error); return; }

      setConfig(prev => ({
        ...(prev ?? { id: undefined, api_key_masked: apiKey ? `••••${apiKey.slice(-4)}` : '••••', created_at: new Date().toISOString() }),
        provider,
        model,
        base_url: provider === 'custom' ? baseUrl || null : null,
        api_key_masked: apiKey ? `••••${apiKey.slice(-4)}` : (prev?.api_key_masked ?? '••••'),
        validation_status: 'pending',
        validation_error: null,
        validated_at: null,
        credit_info: null,
      }));
      setEditing(false);
      setApiKey('');

      // Auto-validate immediately after save
      startValidate(async () => {
        const vr = await validateLlmConfigAction(tenantId, productSlug);
        if (vr.ok) {
          setConfig(prev => prev ? { ...prev, validation_status: 'valid', validation_error: null, validated_at: new Date().toISOString(), credit_info: vr.creditInfo ?? null } : prev);
          flash('ok', 'API key validated successfully.');
        } else {
          setConfig(prev => prev ? { ...prev, validation_status: 'invalid', validation_error: vr.error, validated_at: new Date().toISOString() } : prev);
          flash('err', `Validation failed (HTTP ${vr.statusCode ?? '?'}): ${vr.error}`);
        }
      });
    });
  }

  function handleValidate() {
    startValidate(async () => {
      const vr = await validateLlmConfigAction(tenantId, productSlug);
      if (vr.ok) {
        setConfig(prev => prev ? { ...prev, validation_status: 'valid', validation_error: null, validated_at: new Date().toISOString(), credit_info: vr.creditInfo ?? null } : prev);
        flash('ok', 'API key is valid.');
      } else {
        setConfig(prev => prev ? { ...prev, validation_status: 'invalid', validation_error: vr.error, validated_at: new Date().toISOString() } : prev);
        flash('err', `HTTP ${vr.statusCode ?? '?'}: ${vr.error}`);
      }
    });
  }

  function handleDelete() {
    if (!confirm(`Remove the "${label}" LLM configuration? The system will fall back to the next level.`)) return;
    startDelete(async () => {
      const result = await deleteLlmConfigAction(tenantId, productSlug);
      if (!result.ok) { flash('err', result.error); return; }
      setConfig(null);
      setProvider('openrouter');
      setModel('');
      setApiKey('');
      flash('ok', 'Configuration removed.');
    });
  }

  const status = config?.validation_status;
  const suggestions = MODEL_SUGGESTIONS[provider] ?? [];

  return (
    <div className={`rounded-xl border ${accent === 'emerald' ? 'border-emerald-100' : 'border-slate-200'} bg-white overflow-hidden`}>
      {/* Header */}
      <div className={`flex items-start justify-between gap-3 px-4 py-3.5 ${accent === 'emerald' ? 'border-b border-emerald-50' : 'border-b border-slate-100'}`}>
        <div>
          <div className="flex items-center gap-2">
            <Key size={13} className={accentText} />
            <p className="text-sm font-semibold text-gray-800">{label}</p>
            {config ? (
              <StatusBadge status={config.validation_status} />
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-medium ring-1 ring-gray-200">
                Not configured
              </span>
            )}
          </div>
          {description && <p className="text-xs text-gray-400 mt-0.5 ml-5">{description}</p>}
        </div>

        {!editing && (
          <div className="flex items-center gap-2 shrink-0">
            {config && (
              <>
                <button
                  type="button"
                  onClick={handleValidate}
                  disabled={isValidating || isSaving}
                  title="Re-validate API key"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors"
                >
                  <RefreshCw size={13} className={isValidating ? 'animate-spin' : ''} />
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  title="Remove configuration"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={openEdit}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${accent === 'emerald' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
            >
              {editing ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {config ? 'Edit' : 'Configure'}
            </button>
          </div>
        )}
      </div>

      {/* Config summary (view mode) */}
      {!editing && config && (
        <div className="px-4 py-3 space-y-1.5">
          <Row label="Provider" value={PROVIDERS.find(p => p.value === config.provider)?.label ?? config.provider} />
          <Row label="Model"    value={config.model} mono />
          <Row label="API Key"  value={config.api_key_masked} mono />
          {config.base_url && <Row label="Base URL" value={config.base_url} mono />}
          {config.validated_at && (
            <Row
              label="Validated"
              value={new Date(config.validated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            />
          )}
          {config.credit_info && (
            <>
              <Row
                label="Type"
                value={config.credit_info.is_free_tier ? 'Free tier' : 'Paid'}
              />
              {config.credit_info.usage !== null && (
                <Row
                  label="Spent"
                  value={`$${config.credit_info.usage.toFixed(4)}`}
                />
              )}
              {config.credit_info.limit !== null && (
                <Row
                  label="Credit limit"
                  value={`$${config.credit_info.limit.toFixed(2)}`}
                />
              )}
            </>
          )}
          {config.validation_status === 'invalid' && config.validation_error && (
            <div className="flex items-start gap-1.5 mt-2 p-2.5 rounded-lg bg-red-50 border border-red-100">
              <AlertCircle size={12} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-600">{config.validation_error}</p>
            </div>
          )}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="px-4 py-4 space-y-4">
          <p className="text-[11px] text-gray-400 leading-relaxed">
            This configuration is <span className="font-semibold">optional</span> — if left unconfigured, the system falls back to the next level in the hierarchy. You can use this to override the model or API key for a specific scope.
          </p>

          {/* Provider */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Provider</label>
            <select
              value={provider}
              onChange={e => setProvider(e.target.value)}
              className={`w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none ${ring} bg-white`}
            >
              {PROVIDERS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400">{PROVIDERS.find(p => p.value === provider)?.hint}</p>
          </div>

          {/* API Key */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
              API Key{config ? <span className="font-normal text-gray-400 ml-1">(leave blank to keep current)</span> : ''}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={config ? 'Leave blank to keep existing key' : 'sk-or-…'}
              autoComplete="off"
              className={`w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none ${ring} font-mono`}
            />
            {PROVIDER_LINKS[provider] && (
              <p className="text-[11px] text-gray-400">
                Get your key at{' '}
                <a href={PROVIDER_LINKS[provider]} target="_blank" rel="noopener noreferrer" className={`${accentText} underline`}>
                  {PROVIDER_LINKS[provider]}
                </a>
              </p>
            )}
          </div>

          {/* Model */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Model</label>
            <input
              list={`model-list-${tenantId}-${productSlug}`}
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder={provider === 'openrouter' ? 'anthropic/claude-3.5-haiku' : 'gpt-4o-mini'}
              className={`w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none ${ring} font-mono`}
            />
            {suggestions.length > 0 && (
              <datalist id={`model-list-${tenantId}-${productSlug}`}>
                {suggestions.map(m => <option key={m} value={m} />)}
              </datalist>
            )}
            <p className="text-[11px] text-gray-400">
              {provider === 'openrouter'
                ? 'Format: provider/model-name. Browse at openrouter.ai/models'
                : 'Enter the exact model identifier from your provider.'}
            </p>
          </div>

          {/* Base URL (custom only) */}
          {provider === 'custom' && (
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Base URL</label>
              <input
                type="url"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
                className={`w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none ${ring} font-mono`}
              />
              <p className="text-[11px] text-gray-400">Must expose a /chat/completions endpoint compatible with the OpenAI API.</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isValidating}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm text-white font-semibold rounded-lg disabled:opacity-50 transition-colors ${btnBg}`}
            >
              <Save size={13} />
              {isSaving ? 'Saving…' : isValidating ? 'Validating…' : 'Save & Validate'}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={isSaving || isValidating}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`mx-4 mb-3 flex items-start gap-2 text-xs px-3 py-2.5 rounded-lg ${toast.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
          {toast.type === 'ok'
            ? <CheckCircle size={13} className="shrink-0 mt-0.5" />
            : <AlertCircle size={13} className="shrink-0 mt-0.5" />}
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'pending' | 'valid' | 'invalid' }) {
  if (status === 'valid') return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold ring-1 ring-emerald-200">
      <CheckCircle size={10} /> Valid
    </span>
  );
  if (status === 'invalid') return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-semibold ring-1 ring-red-200">
      <XCircle size={10} /> Invalid
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold ring-1 ring-amber-200">
      <Clock size={10} /> Pending
    </span>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-gray-400 shrink-0">{label}</span>
      <span className={`text-right truncate max-w-[65%] ${mono ? 'font-mono text-xs text-gray-600 bg-gray-50 px-1.5 py-0.5 rounded' : 'text-xs text-gray-700'}`}>
        {value}
      </span>
    </div>
  );
}
