'use client';

import { useState, useTransition } from 'react';
import { useRouter }               from 'next/navigation';
import { Plus }                    from 'lucide-react';
import { createContactGroup }      from '@/app/actions/contact-groups';

const COLORS = [
  { value: '#10b981', label: 'Emerald'  },
  { value: '#0ea5e9', label: 'Sky'      },
  { value: '#8b5cf6', label: 'Violet'   },
  { value: '#f59e0b', label: 'Amber'    },
  { value: '#f43f5e', label: 'Rose'     },
  { value: '#f97316', label: 'Orange'   },
  { value: '#6366f1', label: 'Indigo'   },
  { value: '#14b8a6', label: 'Teal'     },
  { value: '#64748b', label: 'Slate'    },
  { value: '#ec4899', label: 'Pink'     },
];

const EMOJIS = ['👥', '⭐', '🔥', '💎', '🎯', '💰', '🛒', '🤝', '📦', '🏆', '💡', '❤️'];

export function GroupCreateForm() {
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [color,       setColor]       = useState(COLORS[0].value);
  const [emoji,       setEmoji]       = useState(EMOJIS[0]);
  const [error,       setError]       = useState<string | null>(null);
  const [pending,     startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit() {
    if (!name.trim()) { setError('Group name is required.'); return; }
    setError(null);
    startTransition(async () => {
      const result = await createContactGroup(name, description, color, emoji);
      if (result.error) {
        setError(result.error);
      } else {
        setName(''); setDescription(''); setColor(COLORS[0].value); setEmoji(EMOJIS[0]);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Name *</label>
          <input
            value={name}
            onChange={e => { setName(e.target.value); setError(null); }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="e.g. VIP Customers"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 placeholder:text-gray-300"
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Description</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional description"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 placeholder:text-gray-300"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Color picker */}
        <div>
          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Color</label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map(c => (
              <button
                key={c.value}
                type="button"
                title={c.label}
                onClick={() => setColor(c.value)}
                className={`w-7 h-7 rounded-full transition-all ${color === c.value ? 'ring-2 ring-offset-2 scale-110' : 'hover:scale-105'}`}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
        </div>

        {/* Emoji picker */}
        <div>
          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Emoji</label>
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map(e => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all ${
                  emoji === e ? 'bg-emerald-100 ring-2 ring-emerald-400' : 'hover:bg-gray-100'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
          style={{ backgroundColor: color + '20', border: `1px solid ${color}40` }}
        >
          {emoji}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800">{name || 'Group name'}</p>
          {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
        </div>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending}
        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-60"
      >
        <Plus size={14} />
        {pending ? 'Creating…' : 'Create group'}
      </button>
    </div>
  );
}
