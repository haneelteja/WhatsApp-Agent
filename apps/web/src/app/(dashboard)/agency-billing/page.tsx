'use client';

import { useEffect, useState, useTransition } from 'react';
import { ReceiptText, Pencil, Check, X, Download, TrendingUp, DollarSign, Users } from 'lucide-react';
import {
  getAgencyBillingAction,
  updateAgencyMarkupAction,
  type AgencyBillingResult,
  type AgencyBillingClient,
} from '@/app/actions/agency';

const PLAN_LABEL: Record<string, string> = {
  starter:      'Starter',
  growth:       'Growth',
  professional: 'Professional',
  enterprise:   'Enterprise',
};

const PLAN_BADGE: Record<string, string> = {
  starter:      'bg-gray-100 text-gray-600',
  growth:       'bg-blue-50 text-blue-600',
  professional: 'bg-purple-50 text-purple-600',
  enterprise:   'bg-amber-50 text-amber-700',
};

const EDITABLE_PLANS = ['starter', 'growth', 'professional', 'enterprise'];

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN');
}

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: React.ElementType }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4 shadow-sm">
      <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
        <Icon size={18} className="text-emerald-600" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        {sub && <p className="text-xs text-emerald-600 font-medium mt-0.5">{sub}</p>}
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function MarkupRow({
  plan,
  current,
  onSave,
}: {
  plan: string;
  current: number;
  onSave: (plan: string, val: number) => Promise<string | null>;
}) {
  const [editing, setEditing]   = useState(false);
  const [draft,   setDraft]     = useState(String(current));
  const [error,   setError]     = useState('');
  const [isPending, startSave]  = useTransition();

  // Sync when parent refreshes
  useEffect(() => { setDraft(String(current)); }, [current]);

  function startEdit() { setDraft(String(current)); setError(''); setEditing(true); }
  function cancel()    { setDraft(String(current)); setError(''); setEditing(false); }

  function save() {
    const v = parseFloat(draft);
    if (isNaN(v) || v < 0 || v > 500) { setError('0–500'); return; }
    startSave(async () => {
      const err = await onSave(plan, v);
      if (err) { setError(err); return; }
      setEditing(false);
    });
  }

  const base = { starter: 0, growth: 2499, professional: 4999, enterprise: 9999 }[plan] ?? 0;
  const charge = Math.round(base * (1 + current / 100));

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PLAN_BADGE[plan] ?? 'bg-gray-100 text-gray-600'}`}>
          {PLAN_LABEL[plan] ?? plan}
        </span>
        <span className="text-sm text-gray-400 tabular-nums">
          Base {base === 0 ? 'Free' : fmt(base)} &rarr; Client {charge === 0 ? 'Free' : fmt(charge) + '/mo'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              <input
                type="number"
                min={0}
                max={500}
                step={0.5}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                className="w-16 text-sm text-right px-2 py-1 focus:outline-none"
                autoFocus
              />
              <span className="px-2 text-sm text-gray-500 bg-gray-50 border-l border-gray-200">%</span>
            </div>
            {error && <span className="text-xs text-red-500">{error}</span>}
            <button onClick={save} disabled={isPending} className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50">
              <Check size={13} />
            </button>
            <button onClick={cancel} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors">
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            <span className="text-sm font-semibold text-gray-700 tabular-nums w-14 text-right">{current}%</span>
            <button onClick={startEdit} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-400 transition-colors">
              <Pencil size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function downloadCSV(billing: AgencyBillingResult) {
  const header = ['Client', 'Plan', 'Convs (month)', 'Base Cost (₹)', 'Markup %', 'Client Charge (₹)', 'Your Margin (₹)'];
  const rows = billing.clients.map(c => [
    c.name,
    PLAN_LABEL[c.plan] ?? c.plan,
    c.conv_count_month,
    c.base_cost_inr,
    c.markup_percent,
    c.client_charge_inr,
    c.markup_amount_inr,
  ]);
  rows.push(['TOTAL', '', '', billing.total_base_inr, '', billing.total_charges_inr, billing.total_markup_inr]);

  const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `agency-billing-${new Date().toISOString().slice(0, 7)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AgencyBillingPage() {
  const [billing, setBilling] = useState<AgencyBillingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const result = await getAgencyBillingAction();
    if (!result) { setError('Could not load billing data.'); setLoading(false); return; }
    setBilling(result);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleMarkupSave(plan: string, val: number): Promise<string | null> {
    const res = await updateAgencyMarkupAction(plan, val);
    if (res.error) return res.error;
    // Optimistic update
    setBilling(prev => {
      if (!prev) return prev;
      const newConfig = { ...prev.markup_config, [plan]: val };
      // Recompute totals
      let totalBase = 0, totalMarkup = 0, totalCharges = 0;
      const clients: AgencyBillingClient[] = prev.clients.map(c => {
        const base    = c.base_cost_inr;
        const markup  = c.plan === plan ? val : (newConfig[c.plan] ?? 0);
        const charge  = Math.round(base * (1 + markup / 100));
        const mAmt    = charge - base;
        totalBase    += base;
        totalMarkup  += mAmt;
        totalCharges += charge;
        return { ...c, markup_percent: markup, client_charge_inr: charge, markup_amount_inr: mAmt };
      });
      return { ...prev, clients, markup_config: newConfig, total_base_inr: totalBase, total_markup_inr: totalMarkup, total_charges_inr: totalCharges };
    });
    return null;
  }

  // Derive which plans are in use + any plans with saved markup config
  const activePlans = billing
    ? [...new Set([...billing.clients.map(c => c.plan), ...Object.keys(billing.markup_config)])]
        .filter(p => EDITABLE_PLANS.includes(p))
    : EDITABLE_PLANS.filter(p => p !== 'starter');

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <ReceiptText size={18} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Agency Billing</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {billing ? `${billing.month} · ` : ''}Set markup per plan and view consolidated charges.
            </p>
          </div>
        </div>
        {billing && billing.clients.length > 0 && (
          <button
            onClick={() => downloadCSV(billing)}
            className="flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors shrink-0"
          >
            <Download size={14} /> Export CSV
          </button>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">
          Loading billing data…
        </div>
      ) : error ? (
        <div className="bg-red-50 rounded-2xl border border-red-100 p-8 text-center text-sm text-red-600">{error}</div>
      ) : !billing ? null : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Your cost to Alphabot"
              value={fmt(billing.total_base_inr)}
              icon={DollarSign}
            />
            <StatCard
              label="Total client charges"
              value={fmt(billing.total_charges_inr)}
              icon={Users}
            />
            <StatCard
              label="Your gross margin"
              value={fmt(billing.total_markup_inr)}
              sub={billing.total_base_inr > 0
                ? `${Math.round((billing.total_markup_inr / billing.total_base_inr) * 100)}% margin`
                : undefined}
              icon={TrendingUp}
            />
          </div>

          {/* Markup config */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Markup Settings</h3>
            <p className="text-xs text-gray-400 mb-4">
              Set a percentage added on top of the base Alphabot price when invoicing your clients.
            </p>
            {activePlans.map(plan => (
              <MarkupRow
                key={plan}
                plan={plan}
                current={billing.markup_config[plan] ?? 0}
                onSave={handleMarkupSave}
              />
            ))}
          </div>

          {/* Billing table */}
          {billing.clients.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
              <Users size={30} className="text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No sub-clients yet. Add clients from the My Clients page.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Client</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Plan</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Convs</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Base Cost</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Markup</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Client Charge</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Your Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {billing.clients.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-gray-900">{c.name}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PLAN_BADGE[c.plan] ?? 'bg-gray-100 text-gray-600'}`}>
                            {PLAN_LABEL[c.plan] ?? c.plan}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right tabular-nums text-gray-700">{c.conv_count_month.toLocaleString()}</td>
                        <td className="px-5 py-3.5 text-right tabular-nums text-gray-700">
                          {c.base_cost_inr === 0 ? <span className="text-gray-400">Free</span> : fmt(c.base_cost_inr)}
                        </td>
                        <td className="px-5 py-3.5 text-right tabular-nums text-gray-500">{c.markup_percent}%</td>
                        <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-gray-900">
                          {c.client_charge_inr === 0 ? <span className="text-gray-400">Free</span> : fmt(c.client_charge_inr)}
                        </td>
                        <td className="px-5 py-3.5 text-right tabular-nums">
                          {c.markup_amount_inr === 0
                            ? <span className="text-gray-300">—</span>
                            : <span className="text-emerald-600 font-medium">{fmt(c.markup_amount_inr)}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-100 bg-gray-50/60">
                      <td className="px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider" colSpan={3}>Total</td>
                      <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-gray-900">
                        {fmt(billing.total_base_inr)}
                      </td>
                      <td />
                      <td className="px-5 py-3.5 text-right tabular-nums font-bold text-gray-900">
                        {fmt(billing.total_charges_inr)}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums font-bold text-emerald-600">
                        {fmt(billing.total_markup_inr)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
