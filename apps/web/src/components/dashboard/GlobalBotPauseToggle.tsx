'use client';

import { useState, useTransition } from 'react';
import { PauseCircle, PlayCircle } from 'lucide-react';
import { toggleGlobalBotPauseAction } from '@/app/actions/bot-config';

interface Props {
  productSlug: string;
  initialPaused: boolean;
}

export function GlobalBotPauseToggle({ productSlug, initialPaused }: Props) {
  const [paused, setPaused]       = useState(initialPaused);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !paused;
    setPaused(next);
    startTransition(async () => {
      const result = await toggleGlobalBotPauseAction(productSlug, next);
      if (result.error) {
        setPaused(!next); // revert on error
        alert(result.error);
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5">
      <div className="flex items-center gap-2 min-w-0">
        {paused
          ? <PauseCircle size={15} className="text-amber-500 shrink-0" />
          : <PlayCircle  size={15} className="text-emerald-500 shrink-0" />
        }
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 leading-tight">
            {paused ? 'Bot paused — all replies off' : 'Bot active — auto-reply on'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 leading-tight">
            {paused
              ? 'Incoming messages are stored. Bot will not reply until resumed.'
              : 'Bot is responding to all incoming messages automatically.'}
          </p>
        </div>
      </div>
      <button
        onClick={toggle}
        disabled={pending}
        className={[
          'shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
          paused ? 'bg-amber-400' : 'bg-emerald-500',
          pending ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
        aria-label={paused ? 'Resume bot' : 'Pause bot'}
      >
        <span
          className={[
            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
            paused ? 'translate-x-1' : 'translate-x-6',
          ].join(' ')}
        />
      </button>
    </div>
  );
}
