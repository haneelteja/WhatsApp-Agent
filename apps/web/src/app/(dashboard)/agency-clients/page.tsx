'use client';

import { useEffect, useState } from 'react';
import { Users, Plus, Building2, MessageSquare, Bot, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { getAgencyClientsAction, createSubClientAction, type AgencyClient } from '@/app/actions/agency';
import { getAgencyBillingSummaryAction, type AgencyBillingSummary } from '@/app/actions/agency';

const PLAN_BADGE: Record<string, string> = {
  starter:      'bg-gray-100 text-gray-600',
  growth:       'bg-blue-50 text-blue-600',
  professional: 'bg-purple-50 text-purple-600',
  enterprise:   'bg-amber-50 text-amber-700',
};

const STATUS_BADGE: Record<string, string> = {
  active:    'bg-emerald-50 text-emerald-700',
  inactive:  'bg-gray-100 text-gray-500',
  suspended: 'bg-red-50 text-red-600',
};

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4 shadow-sm">
      <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
        <Icon size={18} className="text-emerald-600" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-1">{label}</p>
      </div>
    </div>
  );
}

function AddClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const result = await createSubClientAction(fd);
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-4">Add New Client</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
            <input name="name" required placeholder="Acme Corp" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
            <input name="contactEmail" type="email" required placeholder="owner@acme.com" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
            <select name="plan" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="professional">Professional</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Active Bots</label>
            <div className="space-y-2">
              {[
                { value: 'support_bot',   label: 'Support Bot' },
                { value: 'sales_bot',     label: 'Sales Bot' },
                { value: 'lifecycle_bot', label: 'Lifecycle Bot' },
              ].map(({ value, label }) => (
                <label key={value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" name="products" value={value} className="rounded text-emerald-600 focus:ring-emerald-500" />
                  {label}
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50">
              {loading ? 'Creating…' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AgencyClientsPage() {
  const [clients,  setClients]  = useState<AgencyClient[]>([]);
  const [summary,  setSummary]  = useState<AgencyBillingSummary | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  async function load() {
    setLoading(true);
    const [cr, sr] = await Promise.all([
      getAgencyClientsAction(),
      getAgencyBillingSummaryAction(),
    ]);
    if (cr.error) { setError(cr.error); }
    else          { setClients(cr.clients); }
    setSummary(sr);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <Users size={18} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">My Clients</h2>
            <p className="text-sm text-gray-500 mt-0.5">Manage all clients under your agency account.</p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0"
        >
          <Plus size={15} />
          Add Client
        </button>
      </div>

      {/* Stats */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Total Clients"        value={summary.total_clients}       icon={Building2}    />
          <StatCard label="Total Conversations"  value={summary.total_conversations} icon={MessageSquare} />
          <StatCard label="Active Plans"         value={summary.plan_breakdown.length > 0 ? summary.plan_breakdown.map(p => `${p.count} ${p.plan}`).join(', ') : '—'} icon={Bot} />
        </div>
      )}

      {/* Clients table */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-400">Loading clients…</div>
      ) : error ? (
        <div className="bg-red-50 rounded-2xl border border-red-100 p-8 text-center text-sm text-red-600">{error}</div>
      ) : clients.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Users size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">No clients yet</p>
          <p className="text-xs text-gray-400 mt-1">Click &ldquo;Add Client&rdquo; to onboard your first client.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Client</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Plan</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Bots</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Convs</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clients.map(c => (
                <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-gray-900">{c.name}</p>
                    {c.contact_email && <p className="text-xs text-gray-400 mt-0.5">{c.contact_email}</p>}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PLAN_BADGE[c.plan] ?? 'bg-gray-100 text-gray-600'}`}>
                      {c.plan}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[c.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-gray-700">{c.active_bots}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-gray-700">{c.conv_count.toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      href={`/platform/clients/${c.id}`}
                      className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                    >
                      Manage <ExternalLink size={11} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <AddClientModal onClose={() => setShowModal(false)} onCreated={load} />
      )}
    </div>
  );
}
