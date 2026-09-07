'use client';

import { useState, useTransition } from 'react';
import Script from 'next/script';
import { Check, Zap, Star, CheckCircle, Loader2, XCircle, AlertTriangle } from 'lucide-react';
import {
  createRazorpaySubscriptionAction,
  verifySubscriptionPaymentAction,
  cancelSubscriptionAction,
} from '@/app/actions/billing-checkout';
import { useRouter } from 'next/navigation';

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => { open(): void };
  }
}

interface RazorpayOptions {
  key:             string;
  subscription_id: string;
  name:            string;
  description:     string;
  handler:         (response: {
    razorpay_payment_id:      string;
    razorpay_subscription_id: string;
    razorpay_signature:       string;
  }) => void;
  prefill?: { name?: string; email?: string };
  theme?:   { color: string };
  modal?:   { ondismiss?: () => void };
}

const PLANS = [
  {
    key:       'growth',
    name:      'Growth',
    price:     '₹2,499',
    period:    '/month',
    color:     'text-violet-700',
    bg:        'bg-violet-50',
    border:    'border-violet-200',
    buttonBg:  'bg-violet-600 hover:bg-violet-700',
    icon:      <Star size={16} className="text-violet-500" />,
    features:  [
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
    key:       'scale',
    name:      'Scale',
    price:     '₹4,999',
    period:    '/month',
    color:     'text-emerald-700',
    bg:        'bg-emerald-50',
    border:    'border-emerald-200',
    buttonBg:  'bg-emerald-600 hover:bg-emerald-700',
    icon:      <Zap size={16} className="text-emerald-500" />,
    features:  [
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
  currentPlan:             string;
  userEmail:               string;
  userName:                string;
  razorpaySubscriptionId?: string | null;
  subscriptionStatus?:     string | null;
}

export default function UpgradePlanSection({
  currentPlan,
  userEmail,
  userName,
  razorpaySubscriptionId,
  subscriptionStatus,
}: Props) {
  const router = useRouter();
  const [loading,  setLoading]  = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelPending, startCancelTransition] = useTransition();

  const currentIdx   = PLAN_ORDER.indexOf(currentPlan);
  const upgradePlans = PLANS.filter(p => PLAN_ORDER.indexOf(p.key) > currentIdx);

  const hasActiveSub = !!razorpaySubscriptionId && subscriptionStatus === 'active';

  async function handleUpgrade(planKey: string) {
    setError(null);
    setSuccess(null);
    setLoading(planKey);

    try {
      const sub = await createRazorpaySubscriptionAction(planKey);
      if (sub.error || !sub.subscriptionId) {
        setError(sub.error ?? 'Failed to initiate upgrade. Please try again.');
        setLoading(null);
        return;
      }

      if (!window.Razorpay) {
        setError('Payment not ready — please refresh the page and try again.');
        setLoading(null);
        return;
      }

      const rzp = new window.Razorpay({
        key:             sub.keyId!,
        subscription_id: sub.subscriptionId,
        name:            'Alphabot',
        description:     `${planKey.charAt(0).toUpperCase() + planKey.slice(1)} Plan — recurring monthly`,
        prefill:         { name: userName, email: userEmail },
        theme:           { color: '#059669' },
        modal: {
          ondismiss: () => setLoading(null),
        },
        handler: async (response) => {
          const result = await verifySubscriptionPaymentAction(
            response.razorpay_subscription_id,
            response.razorpay_payment_id,
            response.razorpay_signature,
          );
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

      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      setLoading(null);
    }
  }

  function handleCancel() {
    setError(null);
    startCancelTransition(async () => {
      const result = await cancelSubscriptionAction();
      if (result.error) {
        setError(result.error);
        setShowCancelConfirm(false);
      } else {
        setShowCancelConfirm(false);
        setSuccess('Subscription cancelled — you'll keep access until the end of your billing period.');
        setTimeout(() => router.refresh(), 2000);
      }
    });
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />

      <div className="space-y-4">
        {/* Section header */}
        <div>
          <p className="text-sm font-semibold text-gray-700">
            {upgradePlans.length > 0 ? 'Upgrade Your Plan' : 'Manage Subscription'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Monthly recurring billing via Razorpay. Cancel anytime — access continues until your billing period ends.
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

        {/* Plan cards */}
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

        {/* Cancel subscription — only shown when there's an active Razorpay subscription */}
        {hasActiveSub && (
          <div className="border border-slate-200 rounded-xl p-4 bg-white">
            {!showCancelConfirm ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">Cancel subscription</p>
                  <p className="text-xs text-slate-400 mt-0.5">You'll keep access until your current billing period ends.</p>
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
    </>
  );
}
