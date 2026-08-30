export const dynamic = 'force-dynamic';

import { redirect }              from 'next/navigation';
import { Plug, AlertCircle }     from 'lucide-react';
import { getOrCreateIntegration, getWebhookLogs } from '@/app/actions/integrations';
import { IntegrationsClient }    from '@/components/dashboard/IntegrationsClient';

export default async function IntegrationsPage() {
  const [{ settings, error }, { logs }] = await Promise.all([
    getOrCreateIntegration(),
    getWebhookLogs(),
  ]);

  if (error === 'Unauthorized') redirect('/login');

  const apiBase = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://whatsapp-agent-fmtg.onrender.com';

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Plug size={20} className="text-emerald-600" />
          Integrations
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Connect your CRM, Zapier, or Make to automatically send a WhatsApp welcome message when a new lead or contact is created externally.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={15} className="shrink-0" /> {error}
        </div>
      )}

      {settings && (
        <IntegrationsClient
          settings={settings}
          apiBase={apiBase}
          initialLogs={logs}
        />
      )}
    </div>
  );
}
