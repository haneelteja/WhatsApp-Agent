'use client';

import { useState } from 'react';
import Script from 'next/script';
import { Check, Zap, Star } from 'lucide-react';
import { createPlanUpgradeOrderAction, verifyPlanUpgradePaymentAction } from '@/app/actions/billing-checkout';
import { useRouter } from 'next/navigation';

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => { open(): void };
  }
}

interface RazorpayOptions {
  key:          string;
  amount:       number;
  currency:     string;
  name:         string;
  description:  string;
  order_id:     string;
  handler:      (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  prefill?:     { name?: string; email?: string };
  theme?:       { color: string };
  modal?:       { ondismiss?: () => void };
}

const PLANS = [
  {
    key: 'growth',
    name: 'Growth',
    price: '₹2,499',
    period: '/month',
    color: 'text-violet-700',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    badgeBg: 'bg-violet-100',
    badgeText: 'text-violet-700',
    buttonBg: 'bg-violet-600 hover:bg-violet-700',
    icon: <Star size={16} className="text-violet-500" />,
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
    key: 'scale',
    name: 'Scale',
    price: '₹4,999',
    period: '/month',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-700',
    buttonBg: 'bg-emerald-600 hover:bg-emerald-700',
    icon: <Zap size={16} className="text-emerald-500" />,
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

interface Props {
  currentPlan: string;
  userEmail:   string;
  userName:    string;
}

export default function UpgradePlanSection({ currentPlan, userEmail, userName }: Props) {
  const router  = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const PLAN_ORDER = ['starter', 'growth', 'scale'];
  const currentIdx = PLAN_ORDER.indexOf(currentPlan);

  async function handleUpgrade(planKey: string) {
    setError(null);
    setLoading(planKey);

    try {
      const order = await createPlanUpgradeOrderAction(planKey);
      if (order.error || !order.orderId) {
        setError(order.error ?? 'Failed to create order');
        setLoading(null);
        return;
      }

      const options: RazorpayOptions = {
        key:         order.keyId!,
        amount:      order.amount!,
        currency:    order.currency!,
        name:        'Alphabot',
        description: `Upgrade to ${planKey.charAt(0).toUpperCase() + planKey.slice(1)} plan`,
        order_id:    order.orderId,
        prefill: {
          name:  userName,
          email: userEmail,
        },
        theme: { color: '#059669' },
        modal: {
          ondismiss: () => setLoading(null),
        },
        handler: async (response) => {
          const result = await verifyPlanUpgradePaymentAction(
            response.razorpay_order_id,
            response.razorpay_payment_id,
            response.razorpay_signature,
            planKey,
          );
          setLoading(null);
          if (result.error) {
            setError(result.error);
          } else {
            router.refresh();
          }
        },
      };

      if (!window.Razorpay) {
        setError('Payment not ready — please refresh the page and try again.');
        setLoading(null);
        return;
      }
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setLoading(null);
    }
  }

  const upgradePlans = PLANS.filter(p => PLAN_ORDER.indexOf(p.key) > currentIdx);
  if (upgradePlans.length === 0) return null;

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />

      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-gray-700">Upgrade Your Plan</p>
          <p className="text-xs text-gray-400 mt-0.5">Payments are processed securely via Razorpay.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

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

              <ul className="space-y-1.5 my-4 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-xs text-slate-600">
                    <Check size={12} className={plan.color} />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleUpgrade(plan.key)}
                disabled={!!loading}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${plan.buttonBg} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading === plan.key ? 'Processing…' : `Upgrade to ${plan.name}`}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
