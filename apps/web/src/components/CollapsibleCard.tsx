'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapsibleCardProps {
  /** Always-visible header content (rendered inside the toggle button) */
  header: React.ReactNode;
  /** Expandable body content */
  children: React.ReactNode;
  defaultOpen?: boolean;
  borderClass?: string;
  headerBgClass?: string;
}

export function CollapsibleCard({
  header,
  children,
  defaultOpen = false,
  borderClass = 'border-slate-200',
  headerBgClass = '',
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`bg-white rounded-2xl border ${borderClass} shadow-sm overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full text-left transition-colors hover:bg-slate-50/60 ${headerBgClass}`}
      >
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="flex-1 min-w-0">{header}</div>
          <div className="shrink-0 text-slate-400">
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-5">
          {children}
        </div>
      )}
    </div>
  );
}
