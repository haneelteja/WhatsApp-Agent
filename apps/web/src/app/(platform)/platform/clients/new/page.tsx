import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createTenantAction } from '@/app/actions/platform';

const PRODUCTS = [
  {
    slug: 'support_bot',
    name: 'Support Bot',
    desc: 'Customer Q&A, issue resolution, and escalation routing',
    border: 'border-sky-200',
    bg: 'bg-sky-50/60 hover:bg-sky-50',
    accent: 'text-sky-700',
  },
  {
    slug: 'sales_bot',
    name: 'Sales Bot',
    desc: 'Lead qualification, product info, and warm agent handoff',
    border: 'border-violet-200',
    bg: 'bg-violet-50/60 hover:bg-violet-50',
    accent: 'text-violet-700',
  },
  {
    slug: 'lifecycle_bot',
    name: 'Lifecycle Bot',
    desc: 'Order tracking, invoicing, and payment collection',
    border: 'border-orange-200',
    bg: 'bg-orange-50/60 hover:bg-orange-50',
    accent: 'text-orange-700',
  },
];

export default function NewClientPage() {
  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/platform/clients" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Add New Client</h2>
          <p className="text-sm text-slate-500 mt-0.5">Onboard a new client onto the Alphabot platform</p>
        </div>
      </div>

      <form action={createTenantAction} className="space-y-5">
        {/* Company details */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <h3 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-3">
            Company Details
          </h3>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Company Name <span className="text-red-400">*</span>
            </label>
            <input
              name="name"
              required
              placeholder="e.g. Acme Corp"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-300"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Plan</label>
            <select
              name="plan"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white transition-all"
            >
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="scale">Scale</option>
            </select>
          </div>
        </div>

        {/* Product assignment */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-semibold text-slate-700">Assign Products</h3>
            <p className="text-xs text-slate-400 mt-0.5">Select one or more bots to activate for this client</p>
          </div>

          <div className="space-y-3">
            {PRODUCTS.map(p => (
              <label
                key={p.slug}
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${p.border} ${p.bg}`}
              >
                <input
                  type="checkbox"
                  name="products"
                  value={p.slug}
                  className="mt-0.5 accent-indigo-600 w-4 h-4"
                />
                <div>
                  <p className={`text-sm font-semibold ${p.accent}`}>{p.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{p.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Free trial */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-3">
            Free Trial
          </h3>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Duration</label>
            <select
              name="trialDays"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white transition-all"
            >
              <option value="0">No trial — activate immediately</option>
              <option value="7">7 days</option>
              <option value="14">14 days (recommended)</option>
              <option value="30">30 days</option>
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Link
            href="/platform/clients"
            className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-indigo-200"
          >
            Create client
          </button>
        </div>
      </form>
    </div>
  );
}
