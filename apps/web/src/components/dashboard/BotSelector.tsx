'use client';

import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { ChevronDown, Bot, Star } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export interface ActiveBot {
  slug: string;
  name: string;
}

const BOT_SCOPED_PATHS = new Set([
  '/conversations',
  '/guardrails',
  '/knowledge-base',
  '/settings',
]);

const BOT_COLOR: Record<string, { bg: string; icon: string }> = {
  support_bot:   { bg: 'bg-sky-100',    icon: 'text-sky-500'    },
  sales_bot:     { bg: 'bg-violet-100', icon: 'text-violet-500' },
  lifecycle_bot: { bg: 'bg-orange-100', icon: 'text-orange-500' },
};

const LOCAL_PRIMARY_KEY = 'alphabot_primary_bot';

export function BotSelector({ bots }: { bots: ActiveBot[] }) {
  const searchParams    = useSearchParams();
  const pathname        = usePathname();
  const router          = useRouter();
  const [open, setOpen]           = useState(false);
  const [primarySlug, setPrimary] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // All hooks must be declared before any early return
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_PRIMARY_KEY);
      if (saved && bots.some(b => b.slug === saved)) setPrimary(saved);
    } catch {}
  }, [bots]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const urlSlug     = searchParams.get('bot');
  const currentSlug = urlSlug ?? primarySlug;
  const activeBot   = bots.find(b => b.slug === currentSlug);
  const isScoped    = BOT_SCOPED_PATHS.has(pathname) || pathname.startsWith('/conversations/');

  if (!isScoped || bots.length === 0) return null;

  function selectBot(slug: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (slug) params.set('bot', slug);
    else params.delete('bot');
    const qs = params.toString();
    router.push(pathname + (qs ? '?' + qs : ''));
    setOpen(false);
  }

  const isDefaultingToPrimary = !urlSlug && !!primarySlug;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 h-8 px-3 text-xs font-semibold rounded-lg border transition-all ${
          activeBot
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
        }`}
      >
        <Bot size={13} className={activeBot ? 'text-emerald-600' : 'text-gray-400'} />
        <span>{activeBot?.name ?? 'All Bots'}</span>
        {isDefaultingToPrimary && <Star size={9} className="text-amber-400" />}
        <ChevronDown size={11} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-44 bg-white border border-gray-100 rounded-xl shadow-lg shadow-gray-200/60 z-50 overflow-hidden">
          <div className="p-1">
            <button
              type="button"
              onClick={() => selectBot(null)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors text-left ${
                !activeBot ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div className="w-5 h-5 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                <Bot size={10} className="text-gray-400" />
              </div>
              All Bots
            </button>

            {bots.map(bot => {
              const colors = BOT_COLOR[bot.slug] ?? BOT_COLOR['support_bot']!;
              const isActive = currentSlug === bot.slug;
              const isPrimary = bot.slug === primarySlug;
              return (
                <button
                  key={bot.slug}
                  type="button"
                  onClick={() => selectBot(bot.slug)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors text-left ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700 font-semibold'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${colors.bg}`}>
                    <Bot size={10} className={colors.icon} />
                  </div>
                  <span className="flex-1">{bot.name}</span>
                  {isPrimary && <Star size={9} className="text-amber-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
