'use client';

import { useState, useMemo } from 'react';
import { Download, Search, Filter } from 'lucide-react';
import type { AuditLogEntry } from '@/app/actions/audit';

const ACTION_META: Record<string, { label: string; color: string }> = {
  // Platform-level
  'tenant.suspended':          { label: 'Suspended',       color: 'bg-amber-100 text-amber-800 ring-amber-200'     },
  'tenant.activated':          { label: 'Activated',       color: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  'tenant.deleted':            { label: 'Deleted',         color: 'bg-red-100 text-red-800 ring-red-200'           },
  // Team
  'member.invited':            { label: 'Invited',         color: 'bg-violet-100 text-violet-800 ring-violet-200'  },
  'member.removed':            { label: 'Removed',         color: 'bg-red-100 text-red-700 ring-red-200'           },
  // Bot
  'bot.activated':             { label: 'Bot On',          color: 'bg-sky-100 text-sky-800 ring-sky-200'           },
  'bot.deactivated':           { label: 'Bot Off',         color: 'bg-slate-100 text-slate-600 ring-slate-200'     },
  'bot.config.updated':        { label: 'Bot Config',      color: 'bg-sky-100 text-sky-800 ring-sky-200'           },
  'bot.persona.updated':       { label: 'Bot Persona',     color: 'bg-sky-100 text-sky-700 ring-sky-200'           },
  // Guardrails
  'guardrails.updated':        { label: 'Guardrails',      color: 'bg-indigo-100 text-indigo-800 ring-indigo-200'  },
  // Campaigns & broadcasts
  'broadcast.created':         { label: 'Broadcast',       color: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  'campaign.created':          { label: 'Campaign',        color: 'bg-teal-100 text-teal-800 ring-teal-200'        },
  // Scheduled messages
  'scheduled_message.created': { label: 'Scheduled Msg',  color: 'bg-blue-100 text-blue-800 ring-blue-200'        },
  'scheduled_message.cancelled':{ label: 'Msg Cancelled', color: 'bg-slate-100 text-slate-600 ring-slate-200'     },
  // Triggers
  'call_triggers.updated':     { label: 'Triggers',        color: 'bg-orange-100 text-orange-800 ring-orange-200'  },
  // Billing / AI
  'billing.updated':           { label: 'Billing',         color: 'bg-orange-100 text-orange-800 ring-orange-200'  },
  'copilot.updated':           { label: 'Copilot',         color: 'bg-teal-100 text-teal-800 ring-teal-200'       },
  'llm.config.updated':        { label: 'AI Model',        color: 'bg-purple-100 text-purple-800 ring-purple-200'  },
};

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_META[action] ?? { label: action.replace(/\./g, ' '), color: 'bg-slate-100 text-slate-600 ring-slate-200' };
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 capitalize ${meta.color}`}>
      {meta.label}
    </span>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  }) + ' IST';
}

function exportCsv(logs: AuditLogEntry[], showTenant: boolean) {
  const headers = showTenant
    ? ['Date/Time (IST)', 'Action', 'Client', 'Description', 'Performed By']
    : ['Date/Time (IST)', 'Action', 'Description', 'Performed By'];

  const rows = logs.map(l => {
    const base = [
      formatDate(l.created_at),
      l.action,
      l.description,
      l.actor_email ?? l.actor_id ?? 'system',
    ];
    if (showTenant) base.splice(2, 0, l.tenant_name ?? l.tenant_id ?? '-');
    return base.map(v => `"${String(v).replace(/"/g, '""')}"`);
  });

  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  logs:       AuditLogEntry[];
  showTenant?: boolean;
}

export function AuditLogTable({ logs, showTenant = false }: Props) {
  const [search,     setSearch]     = useState('');
  const [filterAction, setFilterAction] = useState('all');

  const actionTypes = useMemo(() => {
    const s = new Set(logs.map(l => l.action));
    return ['all', ...Array.from(s).sort()];
  }, [logs]);

  const filtered = useMemo(() => logs.filter(l => {
    if (filterAction !== 'all' && l.action !== filterAction) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        l.description.toLowerCase().includes(q) ||
        (l.actor_email ?? '').toLowerCase().includes(q) ||
        (l.tenant_name ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  }), [logs, filterAction, search]);

  if (logs.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-slate-400">No audit events recorded yet.</p>
        <p className="text-xs text-slate-300 mt-1">Events are logged when platform managers take actions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search logs…"
            className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>

        <div className="relative flex items-center">
          <Filter size={13} className="absolute left-2.5 text-slate-400 pointer-events-none" />
          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            className="h-8 pl-7 pr-6 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 appearance-none"
          >
            {actionTypes.map(a => (
              <option key={a} value={a}>
                {a === 'all' ? 'All actions' : a}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => exportCsv(filtered, showTenant)}
          className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-indigo-600 border border-indigo-200 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
        >
          <Download size={13} />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-2.5 font-semibold text-slate-500 whitespace-nowrap">Date / Time</th>
              <th className="text-left px-4 py-2.5 font-semibold text-slate-500">Action</th>
              {showTenant && <th className="text-left px-4 py-2.5 font-semibold text-slate-500">Client</th>}
              <th className="text-left px-4 py-2.5 font-semibold text-slate-500">Description</th>
              <th className="text-left px-4 py-2.5 font-semibold text-slate-500 whitespace-nowrap">Performed By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={showTenant ? 5 : 4} className="text-center py-8 text-slate-400">
                  No matching entries
                </td>
              </tr>
            ) : filtered.map(log => (
              <tr key={log.id} className="bg-white hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap font-mono tabular-nums">
                  {formatDate(log.created_at)}
                </td>
                <td className="px-4 py-3">
                  <ActionBadge action={log.action} />
                </td>
                {showTenant && (
                  <td className="px-4 py-3 text-slate-600 font-medium whitespace-nowrap">
                    {log.tenant_name ?? log.tenant_id ?? <span className="text-slate-300">—</span>}
                  </td>
                )}
                <td className="px-4 py-3 text-slate-700 max-w-xs">
                  {log.description}
                </td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {log.actor_email ?? log.actor_id ?? 'system'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-400">
        Showing {filtered.length} of {logs.length} events · Sorted newest first
      </p>
    </div>
  );
}
