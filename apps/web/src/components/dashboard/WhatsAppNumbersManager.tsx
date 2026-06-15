'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { AddWhatsAppNumberModal } from './AddWhatsAppNumberModal';

type ProductType = 'support_bot' | 'sales_bot' | 'lifecycle_bot';

interface WhatsAppNumber {
  id: string;
  phone_number: string;
  provider: string;
  label: string | null;
  product_slug: string | null;
  phone_number_id: string | null;
}

interface Props {
  numbers: WhatsAppNumber[];
  activeBots: ProductType[];
  webhookBase: string;
}

export function WhatsAppNumbersManager({ numbers, activeBots, webhookBase }: Props) {
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();

  const botLabel = (slug: string | null) => {
    if (!slug) return 'Unassigned';
    return slug.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
  };

  function handleClose() {
    setShowModal(false);
    router.refresh();
  }

  return (
    <>
      {numbers.length === 0 ? (
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-gray-400">No numbers configured yet.</p>
          {activeBots.length > 0 && (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold shadow-sm"
            >
              <Plus size={14} />
              Add WhatsApp Number
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="divide-y divide-green-50">
            {numbers.map((num) => (
              <div key={num.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div>
                  <p className="text-sm font-mono text-gray-700">{num.phone_number}</p>
                  {num.label && <p className="text-xs text-gray-400 mt-0.5">{num.label}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-400 capitalize">{num.provider.replace(/_/g, ' ')}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    num.product_slug
                      ? num.product_slug === 'support_bot'   ? 'bg-sky-50 text-sky-600'
                      : num.product_slug === 'sales_bot'     ? 'bg-violet-50 text-violet-600'
                      : num.product_slug === 'lifecycle_bot' ? 'bg-orange-50 text-orange-600'
                      : 'bg-slate-100 text-slate-500'
                      : 'bg-amber-50 text-amber-600'
                  }`}>
                    {botLabel(num.product_slug)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-green-50">
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium hover:text-emerald-700 transition-colors"
            >
              <Plus size={13} />
              Add another number
            </button>
          </div>
        </>
      )}

      {showModal && (
        <AddWhatsAppNumberModal
          activeBots={activeBots}
          onClose={handleClose}
          webhookBase={webhookBase}
        />
      )}
    </>
  );
}
