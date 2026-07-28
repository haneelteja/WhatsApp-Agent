'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, Circle, Star, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { saveVoiceProviderAction } from '@/app/actions/voice-providers';

const FIELD_LABELS: Record<string, string> = {
  api_key:               'API Key',
  api_token:             'API Token',
  account_sid:           'Account SID',
  auth_token:            'Auth Token',
  subscription_key:      'Subscription Key',
  from_number:           'From Number (E.164)',
  app_id:                'App ID',
  model:                 'Model',
  language_code:         'Language Code',
  language:              'Language',
  voice:                 'Voice Name',
  fallback_voice:        'Fallback Voice',
  voice_name:            'Voice Name',
  speaking_rate:         'Speaking Rate',
  speaker:               'Speaker',
  region:                'Region',
  status_callback_path:  'Status Callback Path',
  twiml_path:            'TwiML Path',
};

const COMPONENT_LABEL: Record<string, string> = {
  telephony: 'Telephony',
  stt:       'Speech-to-Text',
  tts:       'Text-to-Speech',
};

const COMPONENT_COLOR: Record<string, string> = {
  telephony: 'bg-sky-50 text-sky-700 border-sky-200',
  stt:       'bg-violet-50 text-violet-700 border-violet-200',
  tts:       'bg-amber-50 text-amber-700 border-amber-200',
};

export interface VoiceProviderRow {
  id:               string;
  component:        string;
  provider_name:    string;
  display_name:     string;
  credentials_json: Record<string, string>;
  config_json:      Record<string, string>;
  is_default:       boolean;
  enabled:          boolean;
  estimated_cost_per_min_inr: string | null;
}

export function VoiceProviderCard({ provider }: { provider: VoiceProviderRow }) {
  const [expanded,  setExpanded]  = useState(false);
  const [enabled,   setEnabled]   = useState(provider.enabled);
  const [isDefault, setIsDefault] = useState(provider.is_default);
  const [creds,     setCreds]     = useState<Record<string, string>>(
    Object.fromEntries(Object.keys(provider.credentials_json).map(k => [k, ''])),
  );
  const [config, setConfig] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(provider.config_json).map(([k, v]) => [k, String(v)])),
  );
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');
  const [pending, startTransition] = useTransition();

  const hasCredFields = Object.keys(provider.credentials_json).length > 0;
  const credsFilled   = Object.values(provider.credentials_json).some(v => v && String(v).length > 0);

  function handleSave() {
    setError('');
    setSaved(false);
    startTransition(async () => {
      const result = await saveVoiceProviderAction(provider.id, {
        credentials_json: creds,
        config_json:      config,
        enabled,
        is_default:       isDefault,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        // Clear password fields after save
        setCreds(Object.fromEntries(Object.keys(provider.credentials_json).map(k => [k, ''])));
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden transition-all ${
      enabled ? 'border-slate-200' : 'border-slate-100 opacity-70'
    }`}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-5 py-4">
        {/* Status dot */}
        {enabled && credsFilled ? (
          <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
        ) : (
          <Circle size={16} className="text-slate-300 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-800">{provider.display_name}</p>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${COMPONENT_COLOR[provider.component] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
              {COMPONENT_LABEL[provider.component] ?? provider.component}
            </span>
            {isDefault && (
              <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-200">
                <Star size={9} className="fill-indigo-400 text-indigo-400" /> Default
              </span>
            )}
            {!credsFilled && hasCredFields && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                Needs credentials
              </span>
            )}
          </div>
          {provider.estimated_cost_per_min_inr && (
            <p className="text-[10px] text-slate-400 mt-0.5">
              ₹{provider.estimated_cost_per_min_inr}/min estimated
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label={expanded ? 'Collapse' : 'Configure'}
        >
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {/* Expanded config panel */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-5">

          {/* Credential fields */}
          {hasCredFields && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Credentials {credsFilled && <span className="text-emerald-600 normal-case font-medium ml-1">✓ Saved</span>}
              </p>
              <div className="space-y-2.5">
                {Object.keys(provider.credentials_json).map(key => (
                  <div key={key}>
                    <label
                      htmlFor={`${provider.id}-cred-${key}`}
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      {FIELD_LABELS[key] ?? key}
                    </label>
                    <input
                      id={`${provider.id}-cred-${key}`}
                      type="password"
                      placeholder={credsFilled ? '••••••••  (leave blank to keep existing)' : `Enter ${FIELD_LABELS[key] ?? key}`}
                      value={creds[key] ?? ''}
                      onChange={e => setCreds(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-slate-50 font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Config fields */}
          {Object.keys(provider.config_json).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Configuration</p>
              <div className="space-y-2.5">
                {Object.entries(provider.config_json).map(([key]) => (
                  <div key={key}>
                    <label
                      htmlFor={`${provider.id}-cfg-${key}`}
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      {FIELD_LABELS[key] ?? key}
                    </label>
                    <input
                      id={`${provider.id}-cfg-${key}`}
                      type="text"
                      value={config[key] ?? ''}
                      onChange={e => setConfig(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Toggles */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                role="switch"
                aria-checked={enabled}
                tabIndex={0}
                onClick={() => setEnabled(e => !e)}
                onKeyDown={ev => ev.key === 'Enter' && setEnabled(e => !e)}
                className={`relative w-8 h-4.5 rounded-full transition-colors cursor-pointer ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                style={{ height: '18px', width: '32px' }}
              >
                <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-3.5' : ''}`} style={{ width: '14px', height: '14px' }} />
              </div>
              <span className="text-xs font-medium text-slate-600">Enabled</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                role="switch"
                aria-checked={isDefault}
                tabIndex={0}
                onClick={() => setIsDefault(d => !d)}
                onKeyDown={ev => ev.key === 'Enter' && setIsDefault(d => !d)}
                className={`relative rounded-full transition-colors cursor-pointer ${isDefault ? 'bg-indigo-500' : 'bg-slate-300'}`}
                style={{ height: '18px', width: '32px' }}
              >
                <span className={`absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform ${isDefault ? 'translate-x-3.5' : ''}`} style={{ width: '14px', height: '14px' }} />
              </div>
              <span className="text-xs font-medium text-slate-600">Set as default</span>
            </label>
          </div>

          {/* Save */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {pending && <Loader2 size={13} className="animate-spin" />}
              {pending ? 'Saving…' : 'Save'}
            </button>
            {saved  && <p className="text-xs text-emerald-600 font-medium">Saved ✓</p>}
            {error  && <p className="text-xs text-red-600">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
