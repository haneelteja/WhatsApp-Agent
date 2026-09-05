'use client';

import { useState, useTransition } from 'react';
import { FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { generateInvoiceAction } from '@/app/actions/invoice';

type State = 'idle' | 'loading' | 'done' | 'error';

export function SendInvoiceButton({ orderId }: { orderId: string }) {
  const [state,   setState]   = useState<State>('idle');
  const [label,   setLabel]   = useState<string | null>(null);
  const [, startTransition]   = useTransition();

  async function handleClick() {
    if (state === 'loading') return;
    setState('loading');
    const result = await generateInvoiceAction(orderId);
    if (result.error) {
      setLabel(result.error);
      setState('error');
      setTimeout(() => setState('idle'), 4000);
    } else {
      setLabel(result.invoiceNumber ?? null);
      setState('done');
      startTransition(() => { /* triggers revalidation */ });
    }
  }

  if (state === 'done') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
        <CheckCircle size={11} /> {label ?? 'Sent'}
      </span>
    );
  }

  if (state === 'error') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 px-2 py-1 rounded-full max-w-[140px] truncate" title={label ?? ''}>
        <AlertCircle size={11} /> Error
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={state === 'loading'}
      title="Generate and send invoice via WhatsApp"
      className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-orange-600 transition-colors shrink-0 disabled:opacity-50"
    >
      {state === 'loading'
        ? <Loader2 size={13} className="animate-spin" />
        : <FileText size={13} />
      }
    </button>
  );
}
