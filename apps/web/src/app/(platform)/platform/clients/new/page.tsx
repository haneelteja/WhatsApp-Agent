'use client';

import { useTransition, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Building2, Box, CalendarDays } from 'lucide-react';
import { createTenantAction } from '@/app/actions/platform';

const STEPS = [
  { label: 'Company',  icon: Building2    },
  { label: 'Products', icon: Box          },
  { label: 'Review',   icon: CalendarDays },
] as const;

const PRODUCTS = [
  {
    slug: 'support_bot',
    name: 'Support Bot',
    desc: 'Customer Q&A, issue resolution, and escalation routing',
    border: 'border-sky-200',
    bg: 'bg-sky-50/60 hover:bg-sky-50',
    accent: 'text-sky-700',
    check: 'peer-checked:border-sky-400 peer-checked:bg-sky-50',
  },
  {
    slug: 'sales_bot',
    name: 'Sales Bot',
    desc: 'Lead qualification, product info, and warm agent handoff',
    border: 'border-violet-200',
    bg: 'bg-violet-50/60 hover:bg-violet-50',
    accent: 'text-violet-700',
    check: 'peer-checked:border-violet-400 peer-checked:bg-violet-50',
  },
  {
    slug: 'lifecycle_bot',
    name: 'Lifecycle Bot',
    desc: 'Order tracking, invoicing, and payment collection',
    border: 'border-orange-200',
    bg: 'bg-orange-50/60 hover:bg-orange-50',
    accent: 'text-orange-700',
    check: 'peer-checked:border-orange-400 peer-checked:bg-orange-50',
  },
];

const PLANS = [
  { value: 'starter', label: 'Starter',  price: '₹0',     desc: 'Up to 500 conversations/mo' },
  { value: 'growth',  label: 'Growth',   price: '₹2,499', desc: 'Up to 5,000 conversations/mo' },
  { value: 'scale',   label: 'Scale',    price: '₹4,999', desc: 'Unlimited conversations' },
] as const;

const TRIAL_OPTIONS = [
  { value: '0',  label: 'No trial — activate immediately' },
  { value: '7',  label: '7 days' },
  { value: '14', label: '14 days (recommended)' },
  { value: '30', label: '30 days' },
] as const;

type Plan = (typeof PLANS)[number]['value'];

interface WizardState {
  name: string;
  contactEmail: string;
  plan: Plan;
  products: string[];
  trialDays: string;
  isAgency: boolean;
}

const INITIAL: WizardState = {
  name: '',
  contactEmail: '',
  plan: 'starter',
  products: [],
  trialDays: '14',
  isAgency: false,
};

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((step, i) => {
        const done    = i < current;
        const active  = i === current;
        const Icon    = step.icon;
        return (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  done   ? 'bg-indigo-600 text-white' :
                  active ? 'bg-indigo-600 text-white ring-4 ring-indigo-100' :
                           'bg-slate-100 text-slate-400'
                }`}
              >
                {done ? <Check size={15} /> : <Icon size={15} />}
              </div>
              <span className={`text-[11px] font-semibold ${active ? 'text-indigo-600' : done ? 'text-slate-500' : 'text-slate-300'}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-16 mx-2 mb-4 transition-colors ${i < current ? 'bg-indigo-400' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function NewClientPage() {
  const [step,  setStep]  = useState(0);
  const [state, setState] = useState<WizardState>(INITIAL);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState(prev => ({ ...prev, [key]: value }));
    setError('');
  }

  function toggleProduct(slug: string) {
    setState(prev => ({
      ...prev,
      products: prev.products.includes(slug)
        ? prev.products.filter(p => p !== slug)
        : [...prev.products, slug],
    }));
    setError('');
  }

  function validateStep(): string {
    if (step === 0) {
      if (!state.name.trim())         return 'Company name is required.';
      if (!state.contactEmail.trim()) return 'Contact email is required.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.contactEmail)) return 'Enter a valid email address.';
    }
    if (step === 1) {
      if (state.products.length === 0) return 'Select at least one product.';
    }
    return '';
  }

  function handleNext() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setStep(s => s + 1);
  }

  function handleSubmit() {
    const fd = new FormData();
    fd.set('name', state.name.trim());
    fd.set('contactEmail', state.contactEmail.trim());
    fd.set('plan', state.plan);
    fd.set('trialDays', state.trialDays);
    fd.set('isAgency', state.isAgency ? 'true' : 'false');
    state.products.forEach(p => fd.append('products', p));

    startTransition(async () => {
      await createTenantAction(fd);
    });
  }

  const selectedPlan   = PLANS.find(p => p.value === state.plan)!;
  const selectedProds  = PRODUCTS.filter(p => state.products.includes(p.slug));

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        {step === 0 ? (
          <Link href="/platform/clients" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft size={18} />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setStep(s => s - 1)}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div>
          <h2 className="text-xl font-bold text-slate-900">Add New Client</h2>
          <p className="text-sm text-slate-500 mt-0.5">Onboard a new client onto the Alphabot platform</p>
        </div>
      </div>

      <StepIndicator current={step} />

      {/* Step 0 — Company details */}
      {step === 0 && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
            <h3 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-3">Company Details</h3>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Company Name <span className="text-red-400">*</span>
              </label>
              <input
                value={state.name}
                onChange={e => update('name', e.target.value)}
                placeholder="e.g. Acme Corp"
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-300"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Contact Email <span className="text-red-400">*</span>
              </label>
              <input
                value={state.contactEmail}
                onChange={e => update('contactEmail', e.target.value)}
                type="email"
                placeholder="e.g. admin@acmecorp.com"
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-300"
              />
            </div>

            <button
              type="button"
              onClick={() => update('isAgency', !state.isAgency)}
              className={`flex items-center justify-between w-full px-4 py-3 rounded-xl border-2 transition-all text-left ${
                state.isAgency
                  ? 'border-indigo-400 bg-indigo-50/60'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                <p className={`text-sm font-semibold ${state.isAgency ? 'text-indigo-700' : 'text-slate-700'}`}>
                  Agency Account
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  This tenant manages sub-clients and gets a &ldquo;My Clients&rdquo; tab in their dashboard
                </p>
              </div>
              <div className={`w-10 h-5 rounded-full transition-colors shrink-0 ml-4 ${state.isAgency ? 'bg-indigo-500' : 'bg-slate-200'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow mt-0.5 transition-transform ${state.isAgency ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </button>
          </div>

          {/* Plan picker */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-3">Choose Plan</h3>
            <div className="grid grid-cols-3 gap-3">
              {PLANS.map(plan => (
                <button
                  key={plan.value}
                  type="button"
                  onClick={() => update('plan', plan.value)}
                  className={`flex flex-col items-start p-4 rounded-xl border-2 text-left transition-all ${
                    state.plan === plan.value
                      ? 'border-indigo-500 bg-indigo-50/60'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span className={`text-base font-bold tabular-nums ${state.plan === plan.value ? 'text-indigo-700' : 'text-slate-700'}`}>
                    {plan.price}
                  </span>
                  <span className={`text-xs font-semibold mt-0.5 ${state.plan === plan.value ? 'text-indigo-600' : 'text-slate-500'}`}>
                    {plan.label}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1 leading-tight">{plan.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 1 — Products */}
      {step === 1 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-semibold text-slate-700">Assign Products</h3>
            <p className="text-xs text-slate-400 mt-0.5">Select one or more bots to activate for this client</p>
          </div>
          <div className="space-y-3">
            {PRODUCTS.map(p => {
              const selected = state.products.includes(p.slug);
              return (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => toggleProduct(p.slug)}
                  className={`flex items-start gap-3 w-full p-4 rounded-xl border-2 text-left transition-all ${
                    selected
                      ? `border-2 ${p.border.replace('border-', 'border-')} ${p.bg.replace('/60 hover:', ' ')}`
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className={`w-4 h-4 mt-0.5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                    selected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
                  }`}>
                    {selected && <Check size={10} className="text-white" />}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${selected ? p.accent : 'text-slate-600'}`}>{p.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{p.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 2 — Review & trial */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Summary card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-3">Review</h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-400 font-medium">Company</dt>
                <dd className="font-semibold text-slate-800">{state.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400 font-medium">Contact email</dt>
                <dd className="font-semibold text-slate-800">{state.contactEmail}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400 font-medium">Plan</dt>
                <dd className="font-semibold text-slate-800 capitalize">{selectedPlan.label} ({selectedPlan.price}/mo)</dd>
              </div>
              {state.isAgency && (
                <div className="flex justify-between">
                  <dt className="text-slate-400 font-medium">Account type</dt>
                  <dd className="font-semibold text-indigo-700">Agency</dd>
                </div>
              )}
              <div className="flex justify-between items-start">
                <dt className="text-slate-400 font-medium">Products</dt>
                <dd className="flex flex-col items-end gap-1">
                  {selectedProds.map(p => (
                    <span key={p.slug} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.bg.split(' ')[0]} ${p.accent}`}>
                      {p.name}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
          </div>

          {/* Trial duration */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-3">Free Trial</h3>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Duration</label>
              <select
                value={state.trialDays}
                onChange={e => update('trialDays', e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white transition-all"
              >
                {TRIAL_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-400">
              An invitation email with workspace access link will be sent to {state.contactEmail} automatically.
            </p>
          </div>
        </div>
      )}

      {/* Validation error */}
      {error && (
        <p className="mt-3 text-sm text-red-500 font-medium">{error}</p>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between mt-6">
        <Link
          href="/platform/clients"
          className="px-4 py-2 text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors"
        >
          Cancel
        </Link>
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              className="px-4 py-2.5 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-indigo-200"
            >
              Continue
              <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-indigo-200"
            >
              {isPending ? 'Creating…' : 'Create client'}
              {!isPending && <Check size={14} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
