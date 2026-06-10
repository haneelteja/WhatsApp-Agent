'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Send, UserCheck, RefreshCw } from 'lucide-react';

interface Props {
  conversationId: string;
  status: string;
}

export function ConversationActions({ conversationId, status }: Props) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [actioning, setActioning] = useState(false);
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? '';
  }

  async function apiPost(path: string, body?: object) {
    const token = await getToken();
    return fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async function handleClaim() {
    setActioning(true);
    await apiPost(`/api/conversations/${conversationId}/claim`);
    setActioning(false);
    router.refresh();
  }

  async function handleRelease() {
    setActioning(true);
    await apiPost(`/api/conversations/${conversationId}/release`);
    setActioning(false);
    router.refresh();
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    await apiPost(`/api/conversations/${conversationId}/send`, { content: message });
    setMessage('');
    setSending(false);
  }

  return (
    <div className="bg-white border-t border-slate-200 shrink-0">
      {/* Status bar */}
      <div className="flex items-center gap-2.5 px-5 py-2.5 border-b border-slate-100">
        {status === 'escalated' && (
          <button
            type="button"
            onClick={handleClaim}
            disabled={actioning}
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors font-medium shadow-sm"
          >
            <UserCheck size={13} />
            {actioning ? 'Claiming…' : 'Claim conversation'}
          </button>
        )}
        {status === 'bot_paused' && (
          <button
            type="button"
            onClick={handleRelease}
            disabled={actioning}
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors font-medium"
          >
            <RefreshCw size={13} />
            {actioning ? 'Releasing…' : 'Release to bot'}
          </button>
        )}
        {status === 'open' && (
          <p className="text-xs text-slate-400">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 mb-px" />
            Bot is handling this conversation
          </p>
        )}
        {status === 'resolved' && (
          <p className="text-xs text-slate-400">Conversation resolved</p>
        )}
      </div>

      {/* Message input — only when agent has claimed */}
      {status === 'bot_paused' && (
        <form onSubmit={handleSend} className="flex items-center gap-3 px-5 py-3">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message as agent…"
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
          />
          <button
            type="submit"
            disabled={sending || !message.trim()}
            aria-label="Send message"
            className="w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center disabled:opacity-40 transition-colors shadow-sm shrink-0"
          >
            <Send size={16} />
          </button>
        </form>
      )}
    </div>
  );
}
