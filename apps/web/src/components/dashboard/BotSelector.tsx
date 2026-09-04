'use client';

import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { ChevronDown, Bot } from 'lucide-react';
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

export function BotSelector({ bots }: { bots: ActiveBot[] }) {
  const searchParams = useSearchParams();
  const pathname     = usePathname();
  const router       = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentSlug = searchParams.get('bot');
  const activeBot   = bots.find(b => b.slug === currentSlug);

  const isScoped = BOT_SCOPED_PATHS.has(pathname) || pathname.startsWith('/conversations/');
  if (!isScoped || bots.length === 0) return null;

  function selectBot(slug: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (slug) params.set('bot', slug);
    else params.delete('bot');
    const qs = params.toString();
    router.push(pathname + (qs ? '?' + qs : ''));
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const botColors = activeBot ? (BOT_COLOR[activeBot.slug] ?? BOT_COLOR['support_bot']!) : null;

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
              return (
                <button
                  key={bot.slug}
                  type="button"
                  onClick={() => selectBot(bot.slug)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors text-left ${
                    currentSlug === bot.slug
                      ? 'bg-emerald-50 text-emerald-700 font-semibold'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${colors.bg}`}>
                    <Bot size={10} className={colors.icon} />
                  </div>
                  {bot.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
