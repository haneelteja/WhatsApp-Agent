'use client';

import { useState, useTransition, useEffect } from 'react';
import { Check, Zap, Star, CheckCircle, Loader2, XCircle, AlertTriangle } from 'lucide-react';
import {
  createEasebuzzBillingPaymentAction,
  verifyEasebuzzBillingPaymentAction,
  cancelPlanAction,
  downgradePlanAction,
} from '@/app/actions/billing-checkout';
import { useRouter } from 'next/navigation';

declare global {
  interface Window {
    EasebuzzCheckout: new (merchantKey: string, env: string) => {
      initiatePayment: (options: {
        access_key: string;
        onResponse: (response: Record<string, string>) => void;
      }) => void;
    };
  }
}

const PLANS = [
  {
    key:      'growth',
    name:     'Growth',
    price:    '₹2,499',
    period:   '/month',
    color:    'text-violet-700',
    bg:       'bg-violet-50',
    border:   'border-violet-200',
    buttonBg: 'bg-violet-600 hover:bg-violet-700',
    icon:     <Star size={16} className="text-violet-500" />,
    features: [
      '2 active bots',
      '2,000 conversations / month',
      'Advanced guardrails',
      'Knowledge base',
      'Customer sentiment',
      'Auto follow-ups',
      'Analytics',
      'Priority support',
    ],
  },
  {
    key:      'scale',
    name:     'Scale',
    price:    '₹4,999',
    period:   '/month',
    color:    'text-emerald-700',
    bg:       'bg-emerald-50',
    border:   'border-emerald-200',
    buttonBg: 'bg-emerald-600 hover:bg-emerald-700',
    icon:     <Zap size={16} className="text-emerald-500" />,
    features: [
      'All 3 bots',
      'Unlimited conversations',
      'Full guardrails suite',
      'Knowledge base',
      'Customer sentiment',
      'Auto follow-ups',
      'Advanced analytics',
      'Dedicated support',
    ],
  },
];

const PLAN_ORDER = ['starter', 'growth', 'scale'];

interface Props {
  currentPlan:         string;
  userEmail?:          string;
  userName?:           string;
  subscriptionStatus?: string | null;
  paymentStatus?:      string | null; // 'paid' | 'failed' from ?eb= param after redirect
}

export default function UpgradePlanSection({
  currentPlan,
  subscriptionStatus,
  paymentStatus,
}: Props) {
  const router = useRouter();
  const [loading,      setLoading]      = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [success,      setSuccess]      = useState<string | null>(null);
  const [showCancelConfirm,   setShowCancelConfirm]   = useState(false);
  const [cancelPending,       startCancelTransition]  = useTransition();
  const [downgradeTarget,     setDowngradeTarget]     = useState<string | null>(null);
  const [downgradePending,    startDowngradeTransit]  = useTransition();

  // Show result from redirect-based payment (after returning from Easebuzz hosted page)
  useEffect(() => {
    if (paymentStatus === 'paid') {
      setSuccess('Payment successful! Your plan has been upgraded.');
    } else if (paymentStatus === 'failed') {
      setError('Payment failed or was cancelled. Please try again.');
    }
  }, [paymentStatus]);

  // Try to load the Easebuzz SDK for the popup experience.
  // If it fails (e.g. blocked by an ad blocker), the redirect flow is used instead.
  useEffect(() => {
    if (window.EasebuzzCheckout) return;
    const script = document.createElement('script');
    script.src = 'https://ebz-static.s3.ap-south-1.amazonaws.com/easecheckout/v2.0.0/easebuzz-checkout-v2.0.0.min.js';
    script.async = true;
    document.head.appendChild(script);
  }, []);

  const currentIdx      = PLAN_ORDER.indexOf(currentPlan);
  const upgradePlans    = PLANS.filter(p => PLAN_ORDER.indexOf(p.key) > currentIdx);
  const downgradePlanKeys = PLAN_ORDER.slice(0, currentIdx); // e.g. ['starter'] or ['starter','growth']
  const hasActiveSub    = subscriptionStatus === 'active';

  const DOWNGRADE_PLAN_LABELS: Record<string, string> = { starter: 'Starter (Free)', growth: 'Growth', scale: 'Scale' };
  const DOWNGRADE_WARNINGS: Record<string, string[]> = {
    growth:  ['Unlimited conversations → 2,000 / month', 'Lifecycle Bot will be deactivated if active'],
    starter: ['Conversations limited to 500 / month', 'Only 1 active bot allowed — extras will be deactivated'],
  };

  function handleDowngradeConfirm() {
    if (!downgradeTarget) return;
    const target = downgradeTarget;
    startDowngradeTransit(async () => {
      const result = await downgradePlanAction(target);
      setDowngradeTarget(null);
      if (result.error) { setError(result.error); return; }
      const planName = target.charAt(0).toUpperCase() + target.slice(1);
      const botMsg   = result.deactivatedBots?.length ? ` (${result.deactivatedBots.join(', ')} deactivated)` : '';
      setSuccess(`Downgraded to ${planName} plan${botMsg}. Refreshing…`);
      setTimeout(() => router.refresh(), 1800);
    });
  }

  async function handleUpgrade(planKey: string) {
    setError(null);
    setSuccess(null);
    setLoading(planKey);

    try {
      const res = await createEasebuzzBillingPaymentAction(planKey);
      if (res.error || !res.accessKey) {
        setError(res.error ?? 'Failed to initiate upgrade. Please try again.');
        setLoading(null);
        return;
      }

      if (window.EasebuzzCheckout && res.merchantKey && res.env) {
        // SDK popup — best UX, no page navigation
        const checkout = new window.EasebuzzCheckout(res.merchantKey, res.env);
        checkout.initiatePayment({
          access_key: res.accessKey,
          onResponse: async (response) => {
            if (response['status'] === 'userCancelled') {
              setLoading(null);
              return;
            }
            const result = await verifyEasebuzzBillingPaymentAction(response);
            if (result.error) {
              setError(result.error);
              setLoading(null);
            } else {
              const planName = planKey.charAt(0).toUpperCase() + planKey.slice(1);
              setSuccess(`You're now on the ${planName} plan! Refreshing…`);
              setLoading(null);
              setTimeout(() => router.refresh(), 1500);
            }
          },
        });
      } else if (res.payUrl) {
        // Redirect fallback — used when SDK is blocked by ad blocker
        window.location.href = res.payUrl;
      } else {
        setError('Payment not available. Please refresh and try again.');
        setLoading(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      setLoading(null);
    }
  }

  function handleCancel() {
    setError(null);
    startCancelTransition(async () => {
      const result = await cancelPlanAction();
      if (result.error) {
        setError(result.error);
        setShowCancelConfirm(false);
      } else {
        setShowCancelConfirm(false);
        setSuccess(`Subscription cancelled — you'll keep access until your billing period ends.`);
        setTimeout(() => router.refresh(), 2000);
      }
    });
  }

  return (
    <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-gray-700">
            {upgradePlans.length > 0 ? 'Upgrade Your Plan' : 'Manage Subscription'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Pay monthly via Easebuzz. Cancel anytime — access continues until your billing period ends.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
            <XCircle size={15} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {success && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle size={15} className="shrink-0" />
            {success}
          </div>
        )}

        {upgradePlans.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {upgradePlans.map(plan => (
              <div key={plan.key} className={`rounded-2xl border p-5 ${plan.bg} ${plan.border} flex flex-col`}>
                <div className="flex items-center gap-2 mb-1">
                  {plan.icon}
                  <p className={`text-base font-bold ${plan.color}`}>{plan.name}</p>
                </div>
                <p className={`text-2xl font-extrabold ${plan.color} mb-0.5`}>
                  {plan.price}<span className="text-sm font-normal text-gray-400">{plan.period}</span>
                </p>
                <p className="text-[11px] text-gray-400 mb-3">Billed monthly · cancel anytime</p>

                <ul className="space-y-1.5 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-slate-600">
                      <Check size={12} className={plan.color} />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => void handleUpgrade(plan.key)}
                  disabled={!!loading || !!success}
                  className={`mt-4 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${plan.buttonBg} disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                >
                  {loading === plan.key && <Loader2 size={14} className="animate-spin" />}
                  {loading === plan.key ? 'Opening checkout…' : `Upgrade to ${plan.name}`}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Downgrade options — show when on growth or scale */}
        {downgradePlanKeys.length > 0 && (
          <div className="border border-slate-200 rounded-xl p-4 bg-white">
            <p className="text-sm font-medium text-slate-700 mb-1">Downgrade Plan</p>
            <p className="text-xs text-slate-400 mb-3">Switch to a lower plan immediately. Bot access updates right away.</p>
            <div className="flex gap-2 flex-wrap">
              {downgradePlanKeys.map(key => (
                <button
                  key={key}
                  onClick={() => setDowngradeTarget(key)}
                  disabled={!!loading || !!success}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Downgrade to {DOWNGRADE_PLAN_LABELS[key] ?? key}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Downgrade confirmation modal */}
        {downgradeTarget && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 border border-slate-100">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-gray-900">
                    Downgrade to {DOWNGRADE_PLAN_LABELS[downgradeTarget] ?? downgradeTarget}?
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">This takes effect immediately.</p>
                </div>
              </div>
              <ul className="space-y-1.5 pl-2">
                {(DOWNGRADE_WARNINGS[downgradeTarget] ?? []).map(w => (
                  <li key={w} className="flex items-start gap-2 text-xs text-amber-700">
                    <span className="w-1 h-1 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleDowngradeConfirm}
                  disabled={downgradePending}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  {downgradePending && <Loader2 size={12} className="animate-spin" />}
                  Confirm downgrade
                </button>
                <button
                  onClick={() => setDowngradeTarget(null)}
                  disabled={downgradePending}
                  className="text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Keep current plan
                </button>
              </div>
            </div>
          </div>
        )}

        {hasActiveSub && (
          <div className="border border-slate-200 rounded-xl p-4 bg-white">
            {!showCancelConfirm ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">Cancel subscription</p>
                  <p className="text-xs text-slate-400 mt-0.5">You&apos;ll keep access until your current billing period ends.</p>
                </div>
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 shrink-0 underline underline-offset-2"
                >
                  Cancel plan
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-2 text-sm text-amber-700">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  <p>Are you sure? Your bots will stop working when the billing period ends.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCancel}
                    disabled={cancelPending}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {cancelPending && <Loader2 size={12} className="animate-spin" />}
                    Yes, cancel subscription
                  </button>
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Keep my plan
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
    </div>
  );
}
