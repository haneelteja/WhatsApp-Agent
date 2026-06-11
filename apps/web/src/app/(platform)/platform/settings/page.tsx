import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { Shield, Globe } from 'lucide-react';
import { PlatformGuardrailsForm } from '@/components/platform/PlatformGuardrailsForm';
import type { PlatformGuardrails } from '@alphabot/shared';

const DEFAULT_GUARDRAILS: PlatformGuardrails = {
  global_blocked_topics:    [],
  global_blocked_keywords:  [],
  max_response_length:      2000,
  enforce_kb_only_globally: false,
  content_filters: {
    no_personal_data:  false,
    no_external_links: false,
  },
};

export default async function PlatformSettingsPage() {
  const supabase = getSupabaseAdminClient();

  const { data: row } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'guardrails')
    .single();

  const guardrails: PlatformGuardrails = (row?.value as PlatformGuardrails) ?? DEFAULT_GUARDRAILS;

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Platform Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Global policies that apply to all bots across every tenant.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-50">
          <Shield size={16} className="text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-700">Global Guardrails</h3>
          <span className="ml-auto text-[11px] px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-medium border border-indigo-100">
            Platform-wide
          </span>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-gray-400 mb-5">
            These rules are merged with each tenant&apos;s own guardrails. Blocked topics and keywords here
            apply to every bot on the platform regardless of client settings.
          </p>
          <PlatformGuardrailsForm initial={guardrails} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-50">
          <Globe size={16} className="text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-700">Platform Info</h3>
        </div>
        <div className="px-5 py-4 space-y-2">
          <InfoRow label="API URL"  value={process.env['NEXT_PUBLIC_API_URL'] ?? '—'} mono />
          <InfoRow label="Reply Model" value={process.env['OPENROUTER_REPLY_MODEL'] ?? 'anthropic/claude-3.5-haiku (default)'} mono />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-gray-400 shrink-0">{label}</span>
      <span className={mono ? 'font-mono text-xs text-gray-600 bg-slate-50 px-2 py-0.5 rounded-md truncate max-w-[60%]' : 'text-sm text-gray-700'}>
        {value}
      </span>
    </div>
  );
}
