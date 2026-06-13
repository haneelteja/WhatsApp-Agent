'use client';

import { useRouter, useSearchParams } from 'next/navigation';

const BOTS = [
  { slug: 'support_bot',   label: 'Support',   active: 'bg-sky-100 text-sky-700 border-sky-300',        inactive: 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50' },
  { slug: 'sales_bot',     label: 'Sales',     active: 'bg-violet-100 text-violet-700 border-violet-300', inactive: 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50' },
  { slug: 'lifecycle_bot', label: 'Lifecycle', active: 'bg-orange-100 text-orange-700 border-orange-300', inactive: 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50' },
];

export function BotFilterBar({
  activeSlugs,
  current,
}: {
  activeSlugs: string[];
  current:     string | null;
}) {
  const router     = useRouter();
  const params     = useSearchParams();

  if (activeSlugs.length <= 1) return null;

  function select(slug: string | null) {
    const next = new URLSearchParams(params.toString());
    if (slug) next.set('bot', slug); else next.delete('bot');
    router.push(`?${next.toString()}`);
  }

  const visibleBots = BOTS.filter(b => activeSlugs.includes(b.slug));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => select(null)}
        className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${!current ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
      >
        All
      </button>
      {visibleBots.map(b => (
        <button
          key={b.slug}
          type="button"
          onClick={() => select(b.slug)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${current === b.slug ? b.active : b.inactive}`}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
