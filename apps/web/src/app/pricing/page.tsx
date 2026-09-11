'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Bot, Check, X, ArrowRight, MessageSquare, Zap, LifeBuoy, Loader2 } from 'lucide-react';
import { initiateSubscriptionAction } from '@/app/actions/subscriptions';

const PLANS = [
  {
    key:      'starter',
    name:     'Starter',
    price:    null,
    priceLabel: 'Free',
    desc:     'Perfect for small teams getting started with WhatsApp AI.',
    cta:      'Contact us',
    ctaHref:  'mailto:nalluruhaneel@gmail.com?subject=Alphabot Starter Plan',
    highlight: false,
    features: [
      'Support Bot (1 WhatsApp number)',
      'Up to 500 conversations/mo',
      'Knowledge base (50 entries)',
      'Basic analytics',
      'Email support',
    ],
    missing: ['Sales Bot', 'Lifecycle Bot', 'CRM integrations', 'Priority support'],
  },
  {
    key:       'growth',
    name:      'Growth',
    price:     2499,
    priceLabel: '₹2,499',
    desc:      'For growing businesses that need sales and support automation.',
    cta:       'Get started',
    ctaHref:   null,
    highlight:  true,
    features: [
      'Support Bot + Sales Bot',
      'Up to 5,000 conversations/mo',
      'Unlimited knowledge base',
      'Lead pipeline & CRM sync',
      'Broadcast campaigns',
      'Advanced analytics',
      'Priority email support',
    ],
    missing: ['Lifecycle Bot', 'Order & invoice automation'],
  },
  {
    key:       'professional',
    name:      'Professional',
    price:     4999,
    priceLabel: '₹4,999',
    desc:      'Full platform access for businesses with complex workflows.',
    cta:       'Get started',
    ctaHref:   null,
    highlight:  false,
    features: [
      'Support Bot + Sales Bot + Lifecycle Bot',
      'Unlimited conversations',
      'Order & invoice automation',
      'Payment collection via WhatsApp',
      'Return & replacement flows',
      'Voice AI (Exotel)',
      'All CRM integrations',
      'Dedicated onboarding',
    ],
    missing: [],
  },
];

function CheckoutModal({
  plan,
  onClose,
}: {
  plan: typeof PLANS[0];
  onClose: () => void;
}) {
  const [company, setCompany] = useState('');
  const [email,   setEmail]   = useState('');
  const [error,   setError]   = useState('');
  const [isPending, start]    = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!company.trim()) { setError('Company name is required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email'); return; }

    start(async () => {
      const result = await initiateSubscriptionAction(company.trim(), email.trim(), plan.key);
      if ('error' in result) { setError(result.error); return; }
      window.location.href = result.linkUrl;
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Start {plan.name} Plan</h3>
            <p className="text-sm text-gray-500 mt-0.5">{plan.priceLabel}/month &middot; cancel anytime</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Company Name
            </label>
            <input
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="Acme Corp"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Work Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm py-3 rounded-xl transition-colors"
          >
            {isPending ? (
              <><Loader2 size={15} className="animate-spin" /> Redirecting to payment&hellip;</>
            ) : (
              <>Continue to payment <ArrowRight size={15} /></>
            )}
          </button>

          <p className="text-xs text-gray-400 text-center">
            Secured by Easebuzz &middot; Your workspace is created instantly on payment.
          </p>
        </form>
      </div>
    </div>
  );
}

export default function PricingPage() {
  const [checkoutPlan, setCheckoutPlan] = useState<typeof PLANS[0] | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f0fdf4] to-white">
      {/* Nav */}
      <nav className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center">
            <Bot size={15} className="text-white" />
          </div>
          <span className="font-bold text-gray-900 text-base">Alphabot</span>
        </Link>
        <Link
          href="/login"
          className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <div className="max-w-3xl mx-auto px-6 text-center pt-10 pb-14">
        <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
          <Zap size={11} /> Simple, transparent pricing
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight">
          Pick a plan.<br />Your AI is live in minutes.
        </h1>
        <p className="text-gray-500 text-lg mt-4 max-w-xl mx-auto leading-relaxed">
          No setup fees. No contracts. Pay monthly and cancel anytime.
        </p>

        {/* Bot icons */}
        <div className="flex items-center justify-center gap-6 mt-8 text-sm text-gray-400">
          <span className="flex items-center gap-1.5"><LifeBuoy size={14} className="text-sky-400" /> Support Bot</span>
          <span className="flex items-center gap-1.5"><MessageSquare size={14} className="text-violet-400" /> Sales Bot</span>
          <span className="flex items-center gap-1.5"><Zap size={14} className="text-orange-400" /> Lifecycle Bot</span>
        </div>
      </div>

      {/* Plan cards */}
      <div className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map(plan => (
            <div
              key={plan.key}
              className={`relative flex flex-col rounded-2xl border p-7 ${
                plan.highlight
                  ? 'border-emerald-400 bg-[#071c0f] text-white shadow-xl shadow-emerald-900/20'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                  Most popular
                </div>
              )}

              <div className="mb-5">
                <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${plan.highlight ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  {plan.name}
                </p>
                <div className="flex items-baseline gap-1">
                  <span className={`text-4xl font-extrabold ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                    {plan.priceLabel}
                  </span>
                  {plan.price && (
                    <span className={`text-sm font-medium ${plan.highlight ? 'text-emerald-300' : 'text-gray-400'}`}>/mo</span>
                  )}
                </div>
                <p className={`text-sm mt-2 leading-snug ${plan.highlight ? 'text-gray-300' : 'text-gray-500'}`}>
                  {plan.desc}
                </p>
              </div>

              {/* CTA */}
              {plan.ctaHref ? (
                <a
                  href={plan.ctaHref}
                  className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold mb-6 transition-colors ${
                    plan.highlight
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  {plan.cta}
                </a>
              ) : (
                <button
                  onClick={() => setCheckoutPlan(plan)}
                  className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold mb-6 transition-colors ${
                    plan.highlight
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
                      : 'bg-gray-900 hover:bg-gray-800 text-white'
                  }`}
                >
                  {plan.cta} <ArrowRight size={13} />
                </button>
              )}

              {/* Features */}
              <ul className="space-y-2.5 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check size={14} className={`mt-0.5 shrink-0 ${plan.highlight ? 'text-emerald-400' : 'text-emerald-500'}`} />
                    <span className={plan.highlight ? 'text-gray-200' : 'text-gray-600'}>{f}</span>
                  </li>
                ))}
                {plan.missing.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <X size={14} className={`mt-0.5 shrink-0 ${plan.highlight ? 'text-gray-600' : 'text-gray-300'}`} />
                    <span className={`line-through ${plan.highlight ? 'text-gray-600' : 'text-gray-300'}`}>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <p className="text-center text-sm text-gray-400 mt-10">
          All plans include WhatsApp Cloud API integration, conversation analytics, and team access.
          Questions? <a href="mailto:nalluruhaneel@gmail.com" className="text-emerald-600 hover:underline">Contact us</a>.
        </p>
      </div>

      {/* Checkout modal */}
      {checkoutPlan && (
        <CheckoutModal plan={checkoutPlan} onClose={() => setCheckoutPlan(null)} />
      )}
    </div>
  );
}
