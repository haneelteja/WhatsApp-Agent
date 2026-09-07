'use client';

import { useState, useTransition, useEffect } from 'react';
import { Check, Zap, Star, CheckCircle, Loader2, XCircle, AlertTriangle } from 'lucide-react';
import {
  createEasebuzzBillingPaymentAction,
  verifyEasebuzzBillingPaymentAction,
  cancelPlanAction,
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
}

export default function UpgradePlanSection({
  currentPlan,
  subscriptionStatus,
}: Props) {
  const router = useRouter();
  const [loading,      setLoading]      = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [success,      setSuccess]      = useState<string | null>(null);
  const [scriptReady,  setScriptReady]  = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelPending, startCancelTransition]    = useTransition();

  // Load the Easebuzz checkout script manually so it works regardless of
  // Next.js hydration state (next/script afterInteractive can miss when
  // hydration errors force a client-side re-render).
  useEffect(() => {
    if (window.EasebuzzCheckout) { setScriptReady(true); return; }
    const script = document.createElement('script');
    script.src = 'https://ebz-static.s3.ap-south-1.amazonaws.com/easecheckout/v2.0.0/easebuzz-checkout-v2.0.0.min.js';
    script.async = true;
    script.onload  = () => setScriptReady(true);
    script.onerror = () => setError('Payment SDK failed to load — please refresh and try again.');
    document.head.appendChild(script);
  }, []);

  const currentIdx   = PLAN_ORDER.indexOf(currentPlan);
  const upgradePlans = PLANS.filter(p => PLAN_ORDER.indexOf(p.key) > currentIdx);
  const hasActiveSub = subscriptionStatus === 'active';

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

      if (!window.EasebuzzCheckout) {
        setError('Payment not ready — please refresh the page and try again.');
        setLoading(null);
        return;
      }

      const checkout = new window.EasebuzzCheckout(res.merchantKey!, res.env!);
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
                  disabled={!!loading || !!success || !scriptReady}
                  className={`mt-4 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${plan.buttonBg} disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                >
                  {(loading === plan.key || !scriptReady) && <Loader2 size={14} className="animate-spin" />}
                  {loading === plan.key ? 'Opening checkout…' : !scriptReady ? 'Loading…' : `Upgrade to ${plan.name}`}
                </button>
              </div>
            ))}
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
