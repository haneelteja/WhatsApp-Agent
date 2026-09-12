'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  getInboxConversationsAction,
  getInboxMessagesAction,
  type InboxConversation,
  type InboxMessage,
} from '@/app/actions/inbox';
import {
  Inbox, UserCheck, RefreshCw, CheckCircle2, Send, Bot, AlertCircle,
  MessageSquare, Loader2, ChevronRight,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const PRODUCT_COLORS: Record<string, string> = {
  support_bot:   'bg-sky-50 text-sky-600',
  sales_bot:     'bg-violet-50 text-violet-600',
  lifecycle_bot: 'bg-orange-50 text-orange-600',
};
const PRODUCT_LABEL: Record<string, string> = {
  support_bot: 'Support', sales_bot: 'Sales', lifecycle_bot: 'Lifecycle',
};
const BOT_AVATAR: Record<string, { label: string; bg: string }> = {
  support_bot:   { label: 'SUP', bg: 'bg-sky-500'    },
  sales_bot:     { label: 'SLS', bg: 'bg-violet-500' },
  lifecycle_bot: { label: 'LFE', bg: 'bg-orange-500' },
};
const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
];

function timeAgo(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  if (mins < 1)   return 'now';
  if (mins < 60)  return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function initials(name: string | null, phone: string | null): string {
  const s = name ?? phone ?? '?';
  return s[0]!.toUpperCase();
}

function displayName(conv: InboxConversation): string {
  return conv.contact_name ?? conv.contact_phone ?? 'Unknown';
}

// ── Left panel conversation row ───────────────────────────────────────────────

function ConvRow({
  conv,
  selected,
  unread,
  onClick,
}: {
  conv: InboxConversation;
  selected: boolean;
  unread: boolean;
  onClick: () => void;
}) {
  const name  = displayName(conv);
  const colorIdx = name.charCodeAt(0) % AVATAR_COLORS.length;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 flex items-center gap-3 transition-colors border-b border-gray-50 last:border-0 ${
        selected ? 'bg-emerald-50' : 'hover:bg-gray-50/70'
      }`}
    >
      <div className={`relative w-9 h-9 rounded-full ${AVATAR_COLORS[colorIdx]} flex items-center justify-center font-bold text-sm shrink-0`}>
        {initials(conv.contact_name, conv.contact_phone)}
        {unread && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${selected ? 'text-emerald-800' : 'text-gray-800'}`}>{name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`text-[10px] font-medium px-1.5 py-px rounded capitalize ${PRODUCT_COLORS[conv.product_type] ?? 'bg-gray-100 text-gray-500'}`}>
            {PRODUCT_LABEL[conv.product_type] ?? conv.product_type}
          </span>
          {conv.status === 'escalated' ? (
            <span className="text-[10px] font-bold text-red-600 flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
              Escalated
            </span>
          ) : (
            <span className="text-[10px] font-medium text-amber-600">Agent</span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[10px] text-gray-400 tabular-nums">{timeAgo(conv.updated_at)}</span>
        <ChevronRight size={12} className={selected ? 'text-emerald-400' : 'text-gray-200'} />
      </div>
    </button>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MsgBubble({ msg, productType }: { msg: InboxMessage; productType: string }) {
  const isUser = msg.role === 'user';
  const botAv  = BOT_AVATAR[productType] ?? { label: 'AI', bg: 'bg-emerald-500' };
  const ts     = new Date(msg.timestamp).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });

  if (msg.role === 'system') {
    return (
      <div className="flex justify-center my-2">
        <span className="text-[10px] text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{msg.content}</span>
      </div>
    );
  }

  return (
    <div className={`flex items-end gap-2 ${isUser ? 'flex-row' : 'flex-row-reverse'} mb-3`}>
      {isUser ? (
        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mb-0.5">
          <MessageSquare size={11} className="text-gray-500" />
        </div>
      ) : (
        <div className={`w-6 h-6 rounded-full ${botAv.bg} flex items-center justify-center shrink-0 mb-0.5`}>
          <Bot size={11} className="text-white" />
        </div>
      )}
      <div className={`max-w-[72%] ${isUser ? 'items-start' : 'items-end'} flex flex-col gap-0.5`}>
        <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm shadow-sm'
            : 'bg-emerald-600 text-white rounded-tr-sm'
        }`}>
          {msg.content}
        </div>
        <span className="text-[10px] text-gray-400 px-1">{ts}</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const [convs,       setConvs]       = useState<InboxConversation[]>([]);
  const [tenantId,    setTenantId]    = useState('');
  const [selected,    setSelected]    = useState<InboxConversation | null>(null);
  const [messages,    setMessages]    = useState<InboxMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending,     setSending]     = useState(false);
  const [actioning,   setActioning]   = useState(false);
  const [sendError,   setSendError]   = useState<string | null>(null);
  const [draft,       setDraft]       = useState('');
  const [unreadIds,   setUnreadIds]   = useState<Set<string>>(new Set());
  const [loading,     setLoading]     = useState(true);

  const bottomRef    = useRef<HTMLDivElement>(null);
  const selectedRef  = useRef<InboxConversation | null>(null);
  const supabaseRef  = useRef(getSupabaseBrowserClient());
  selectedRef.current = selected;

  // ── Auth token helper ─────────────────────────────────────────────────────
  async function token() {
    const { data } = await supabaseRef.current.auth.getSession();
    return data.session?.access_token ?? '';
  }

  async function apiPost(path: string, body?: object) {
    const t = await token();
    return fetch(`${API_BASE}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body:    JSON.stringify(body ?? {}),
    });
  }

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    getInboxConversationsAction().then(result => {
      if (!result) return;
      setConvs(result.conversations);
      setTenantId(result.tenantId);
      setLoading(false);
    });
  }, []);

  // ── Realtime: conversation list updates ───────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    const sb = supabaseRef.current;

    const ch = sb.channel(`inbox:convs:${tenantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'conversations',
        filter: `tenant_id=eq.${tenantId}`,
      }, payload => {
        const row = payload.new as { id: string; status: string; product_type: string; updated_at: string; assigned_agent_id: string | null };

        if (payload.eventType === 'DELETE') {
          setConvs(prev => prev.filter(c => c.id !== (payload.old as { id: string }).id));
          return;
        }

        const isActive = ['escalated', 'bot_paused'].includes(row.status);

        setConvs(prev => {
          const exists = prev.find(c => c.id === row.id);
          if (!isActive) return prev.filter(c => c.id !== row.id);
          if (exists) {
            return prev
              .map(c => c.id === row.id ? { ...c, status: row.status, updated_at: row.updated_at, assigned_agent_id: row.assigned_agent_id } : c)
              .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          }
          return [{ id: row.id, status: row.status, product_type: row.product_type, updated_at: row.updated_at, assigned_agent_id: row.assigned_agent_id, contact_name: null, contact_phone: null }, ...prev];
        });

        // Update selected conv status live
        if (selectedRef.current?.id === row.id) {
          setSelected(prev => prev ? { ...prev, status: row.status, assigned_agent_id: row.assigned_agent_id } : prev);
        }
      })
      .subscribe();

    return () => { void sb.removeChannel(ch); };
  }, [tenantId]);

  // ── Realtime: new messages in selected conversation ───────────────────────
  useEffect(() => {
    if (!selected) return;
    const sb  = supabaseRef.current;
    const cid = selected.id;

    const ch = sb.channel(`inbox:msgs:${cid}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${cid}`,
      }, payload => {
        const msg = payload.new as InboxMessage;
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        // Mark conv as unread if it's not the selected one
        if (selectedRef.current?.id !== cid) {
          setUnreadIds(s => new Set([...s, cid]));
        }
      })
      .subscribe();

    return () => { void sb.removeChannel(ch); };
  }, [selected?.id]);

  // ── Auto-scroll on new messages ───────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Select conversation ───────────────────────────────────────────────────
  const selectConv = useCallback(async (conv: InboxConversation) => {
    setSelected(conv);
    setMessages([]);
    setDraft('');
    setSendError(null);
    setUnreadIds(s => { const n = new Set(s); n.delete(conv.id); return n; });
    setLoadingMsgs(true);
    const msgs = await getInboxMessagesAction(conv.id);
    setMessages(msgs);
    setLoadingMsgs(false);
  }, []);

  // ── Send ──────────────────────────────────────────────────────────────────
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !draft.trim()) return;
    setSending(true);
    setSendError(null);
    const res = await apiPost(`/api/conversations/${selected.id}/send`, { message: draft.trim() });
    if (res.ok) {
      setDraft('');
    } else {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setSendError(body.error ?? 'Failed to send');
    }
    setSending(false);
  }

  // ── Claim ─────────────────────────────────────────────────────────────────
  async function handleClaim() {
    if (!selected) return;
    setActioning(true);
    await apiPost(`/api/conversations/${selected.id}/claim`);
    setActioning(false);
    // Status update arrives via realtime
  }

  // ── Release to bot ────────────────────────────────────────────────────────
  async function handleRelease() {
    if (!selected) return;
    setActioning(true);
    await apiPost(`/api/conversations/${selected.id}/release`);
    setActioning(false);
  }

  // ── Resolve ───────────────────────────────────────────────────────────────
  async function handleResolve() {
    if (!selected) return;
    setActioning(true);
    const t = await token();
    await fetch(`${API_BASE}/api/conversations/${selected.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body:    JSON.stringify({ status: 'resolved' }),
    });
    setActioning(false);
    // Conv will disappear from list via realtime
    setSelected(null);
  }

  const escalatedCount = convs.filter(c => c.status === 'escalated').length;
  const agentCount     = convs.filter(c => c.status === 'bot_paused').length;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-white shrink-0">
        <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
          <Inbox size={16} className="text-emerald-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-bold text-gray-900">Agent Inbox</h2>
          <p className="text-xs text-gray-500 mt-px">
            {loading ? 'Loading…' : `${escalatedCount} escalated · ${agentCount} with agent`}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel ──────────────────────────────────────────────────── */}
        <aside className="w-72 shrink-0 border-r border-gray-100 bg-white flex flex-col overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={20} className="text-gray-300 animate-spin" />
            </div>
          ) : convs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mb-3">
                <CheckCircle2 size={22} className="text-emerald-400" />
              </div>
              <p className="text-sm font-semibold text-gray-600">All clear</p>
              <p className="text-xs text-gray-400 mt-1">No escalated conversations right now.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* Section labels */}
              {escalatedCount > 0 && (
                <>
                  <div className="px-4 py-2 bg-red-50/60 border-b border-red-100">
                    <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertCircle size={10} /> Escalated ({escalatedCount})
                    </span>
                  </div>
                  {convs.filter(c => c.status === 'escalated').map(c => (
                    <ConvRow key={c.id} conv={c} selected={selected?.id === c.id} unread={unreadIds.has(c.id)} onClick={() => selectConv(c)} />
                  ))}
                </>
              )}
              {agentCount > 0 && (
                <>
                  <div className="px-4 py-2 bg-amber-50/60 border-b border-amber-100">
                    <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                      With Agent ({agentCount})
                    </span>
                  </div>
                  {convs.filter(c => c.status === 'bot_paused').map(c => (
                    <ConvRow key={c.id} conv={c} selected={selected?.id === c.id} unread={unreadIds.has(c.id)} onClick={() => selectConv(c)} />
                  ))}
                </>
              )}
            </div>
          )}
        </aside>

        {/* ── Right panel ─────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden bg-gray-50/40">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-3xl bg-white border border-gray-100 flex items-center justify-center mb-4 shadow-sm">
                <MessageSquare size={26} className="text-gray-300" />
              </div>
              <p className="text-sm font-semibold text-gray-500">Select a conversation</p>
              <p className="text-xs text-gray-400 mt-1">Choose from the left to start handling</p>
            </div>
          ) : (
            <>
              {/* Conv header */}
              <div className="px-5 py-3.5 bg-white border-b border-gray-100 flex items-center gap-3 shrink-0">
                {(() => {
                  const name = displayName(selected);
                  const idx  = name.charCodeAt(0) % AVATAR_COLORS.length;
                  return (
                    <div className={`w-9 h-9 rounded-full ${AVATAR_COLORS[idx]} flex items-center justify-center font-bold text-sm shrink-0`}>
                      {initials(selected.contact_name, selected.contact_phone)}
                    </div>
                  );
                })()}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{displayName(selected)}</p>
                  {selected.contact_name && selected.contact_phone && (
                    <p className="text-xs text-gray-400">{selected.contact_phone}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded capitalize ${PRODUCT_COLORS[selected.product_type] ?? 'bg-gray-100 text-gray-500'}`}>
                    {PRODUCT_LABEL[selected.product_type] ?? selected.product_type}
                  </span>
                  {selected.status === 'escalated' ? (
                    <span className="text-[10px] font-bold text-red-600 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                      Escalated
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-600">Bot paused</span>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {loadingMsgs ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 size={20} className="text-gray-300 animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-xs text-gray-400">No messages yet</div>
                ) : (
                  <>
                    {messages.map(m => <MsgBubble key={m.id} msg={m} productType={selected.product_type} />)}
                    <div ref={bottomRef} />
                  </>
                )}
              </div>

              {/* Action bar */}
              <div className="bg-white border-t border-gray-100 px-5 py-3 shrink-0 space-y-2.5">
                {/* Controls */}
                <div className="flex items-center gap-2 flex-wrap">
                  {selected.status === 'escalated' && (
                    <button
                      type="button"
                      onClick={handleClaim}
                      disabled={actioning}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors disabled:opacity-50 shadow-sm"
                    >
                      <UserCheck size={13} />
                      {actioning ? 'Claiming…' : 'Claim & take over'}
                    </button>
                  )}
                  {selected.status === 'bot_paused' && (
                    <>
                      <button
                        type="button"
                        onClick={handleRelease}
                        disabled={actioning}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
                      >
                        <RefreshCw size={13} />
                        {actioning ? '…' : 'Release to bot'}
                      </button>
                      <button
                        type="button"
                        onClick={handleResolve}
                        disabled={actioning}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-medium transition-colors disabled:opacity-50"
                      >
                        <CheckCircle2 size={13} />
                        {actioning ? '…' : 'Mark resolved'}
                      </button>
                    </>
                  )}
                </div>

                {/* Reply input — only when agent has claimed (bot_paused) */}
                {selected.status === 'bot_paused' && (
                  <>
                    {sendError && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">{sendError}</p>
                    )}
                    <form onSubmit={handleSend} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={draft}
                        onChange={e => { setDraft(e.target.value); setSendError(null); }}
                        placeholder="Type a reply…"
                        className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      />
                      <button
                        type="submit"
                        disabled={sending || !draft.trim()}
                        className="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center disabled:opacity-40 transition-colors shadow-sm shrink-0"
                      >
                        {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      </button>
                    </form>
                  </>
                )}

                {selected.status === 'escalated' && (
                  <p className="text-[11px] text-gray-400 text-center">Claim this conversation to start replying</p>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
