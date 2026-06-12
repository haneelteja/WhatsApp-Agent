import { Globe } from 'lucide-react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export default async function PlatformSettingsPage() {
  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Platform Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Platform configuration and technical info.
        </p>
      </div>

      {/* Guardrails moved notice */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-start gap-3">
        <ShieldCheck size={16} className="text-indigo-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-indigo-800">Guardrails have moved</p>
          <p className="text-xs text-indigo-600 mt-0.5">
            Global guardrails (Layer 1) and bot-type defaults (Layer 2) are now managed in the dedicated{' '}
            <Link href="/platform/guardrails" className="underline font-semibold">Guardrails</Link> section.
          </p>
        </div>
      </div>

      {/* Platform Info */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-50">
          <Globe size={16} className="text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-700">Platform Info</h3>
        </div>
        <div className="px-5 py-4 space-y-2">
          <InfoRow label="API URL"     value={process.env['NEXT_PUBLIC_API_URL'] ?? '—'} mono />
          <InfoRow label="Reply Model" value={process.env['OPENROUTER_REPLY_MODEL'] ?? 'claude-sonnet-4-6 (default)'} mono />
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
