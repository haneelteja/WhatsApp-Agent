'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: 'message' | 'action_pending';
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolUseId?: string;
  actionStatus?: 'pending' | 'approved' | 'cancelled' | 'executed';
}

interface CopilotWidgetProps {
  initialMessages: CopilotMessage[];
}

const GO_LINK_RE = /\[GO:([^\s\]"]+)\s+"([^"]+)"\]/g;

function parseContent(text: string): Array<{ kind: 'text' | 'nav'; content: string; path?: string; label?: string }> {
  const parts: Array<{ kind: 'text' | 'nav'; content: string; path?: string; label?: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(GO_LINK_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ kind: 'text', content: text.slice(last, m.index) });
    parts.push({ kind: 'nav', content: m[0], path: m[1], label: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', content: text.slice(last) });
  return parts;
}

function ActionCard({ msg, onAction }: { msg: CopilotMessage; onAction: (m: CopilotMessage, approved: boolean) => void }) {
  const input = msg.toolInput ?? {};
  let summary = `Execute: ${msg.toolName}`;
  if (msg.toolName === 'add_kb_article') {
    summary = `Add KB article: "${input['question'] as string}" → "${input['collection_name'] as string}"`;
  } else if (msg.toolName === 'update_escalation_triggers') {
    const triggers = input['triggers'] as string[];
    summary = `Set escalation triggers for ${input['product_slug'] as string}: ${triggers.slice(0, 3).join(', ')}${triggers.length > 3 ? '…' : ''}`;
  } else if (msg.toolName === 'toggle_button_template') {
    summary = `${input['is_active'] ? 'Enable' : 'Disable'} button template: "${input['template_name'] as string}"`;
  } else if (msg.toolName === 'update_system_prompt') {
    summary = `Update system prompt for ${input['product_slug'] as string}`;
  }

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 max-w-[90%] mt-1">
      <p className="text-[11px] font-semibold text-amber-800 mb-1">Proposed Action</p>
      <p className="text-xs text-amber-700 mb-2.5 leading-snug">{summary}</p>
      <div className="flex gap-2">
        <button
          onClick={() => onAction(msg, true)}
          className="flex-1 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white text-xs font-semibold py-1.5 rounded-lg transition-colors"
        >
          ✓ Approve
        </button>
        <button
          onClick={() => onAction(msg, false)}
          className="flex-1 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium py-1.5 rounded-lg border border-slate-200 transition-colors"
        >
          ✗ Cancel
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ msg, onAction }: { msg: CopilotMessage; onAction: (m: CopilotMessage, approved: boolean) => void }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-emerald-500 text-white rounded-2xl rounded-tr-sm px-3.5 py-2 max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap break-words">
          {msg.content}
        </div>
      </div>
    );
  }

  const parts = parseContent(msg.content);
  const textParts = parts.filter(p => p.kind === 'text').map(p => p.content).join('').trim();
  const navParts = parts.filter(p => p.kind === 'nav');

  return (
    <div className="flex items-start gap-2">
      <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center text-[13px] flex-shrink-0 mt-0.5 select-none">
        ✨
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        {textParts && (
          <div className="bg-slate-50 border border-slate-100 text-slate-800 rounded-2xl rounded-tl-sm px-3.5 py-2 max-w-[90%] text-sm leading-relaxed whitespace-pre-wrap break-words">
            {textParts}
          </div>
        )}
        {navParts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {navParts.map((nav, i) => (
              <Link
                key={i}
                href={nav.path!}
                className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-1 hover:bg-emerald-100 transition-colors font-medium"
              >
                {nav.label} →
              </Link>
            ))}
          </div>
        )}
        {msg.type === 'action_pending' && msg.actionStatus === 'pending' && (
          <ActionCard msg={msg} onAction={onAction} />
        )}
        {msg.actionStatus === 'approved' && (
          <p className="text-[11px] text-emerald-600">✓ Executing…</p>
        )}
        {msg.actionStatus === 'cancelled' && (
          <p className="text-[11px] text-slate-400">✗ Cancelled</p>
        )}
      </div>
    </div>
  );
}

export function CopilotWidget({ initialMessages }: CopilotWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: CopilotMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      type: 'message',
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json() as {
        type: 'message' | 'action_pending';
        messageId: string;
        content?: string;
        assistantText?: string;
        toolName?: string;
        toolInput?: Record<string, unknown>;
        toolUseId?: string;
      };

      if (data.type === 'action_pending') {
        setMessages(prev => [...prev, {
          id: data.messageId,
          role: 'assistant',
          content: data.assistantText ?? '',
          type: 'action_pending',
          toolName: data.toolName,
          toolInput: data.toolInput,
          toolUseId: data.toolUseId,
          actionStatus: 'pending',
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: data.messageId,
          role: 'assistant',
          content: data.content ?? '',
          type: 'message',
        }]);
      }
    } catch {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Something went wrong. Please try again.',
        type: 'message',
      }]);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const handleAction = useCallback(async (msg: CopilotMessage, approved: boolean) => {
    setMessages(prev =>
      prev.map(m => m.id === msg.id ? { ...m, actionStatus: approved ? 'approved' : 'cancelled' } : m)
    );
    setLoading(true);

    try {
      const res = await fetch('/api/copilot/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: msg.id, approved }),
      });
      const data = await res.json() as { type: string; content: string; messageId: string };
      setMessages(prev => [...prev, {
        id: data.messageId,
        role: 'assistant',
        content: data.content,
        type: 'message',
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Something went wrong executing that action.',
        type: 'message',
      }]);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end select-none">
      {open && (
        <div className="mb-3 w-[380px] h-[520px] bg-white rounded-2xl shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="text-lg leading-none">✨</span>
              <div>
                <p className="text-white font-semibold text-sm leading-tight">AI Copilot</p>
                <p className="text-emerald-100 text-[10px] leading-tight">Ask about your bot config</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/70 hover:text-white text-2xl leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
            {messages.length === 0 && (
              <div className="text-center text-slate-400 text-sm mt-10 px-4">
                <p className="text-3xl mb-3">✨</p>
                <p className="leading-relaxed">
                  Hi! Ask me anything about your bot config — I can answer questions, guide you to the right page, and make changes with your approval.
                </p>
              </div>
            )}
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} onAction={handleAction} />
            ))}
            {loading && (
              <div className="flex items-center gap-1 pl-8">
                <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-100 p-3 flex gap-2 flex-shrink-0">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
              }}
              placeholder="Ask anything… (Enter to send)"
              rows={1}
              disabled={loading}
              className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent disabled:opacity-50 leading-relaxed"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl w-10 flex items-center justify-center transition-colors text-base font-bold"
            >
              ↑
            </button>
          </div>
        </div>
      )}

      {/* Bubble button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 active:scale-95 text-white rounded-full shadow-lg px-4 py-2.5 flex items-center gap-2 transition-all duration-150 select-none"
      >
        <span className="text-base leading-none">✨</span>
        <span className="text-sm font-semibold">AI Copilot</span>
      </button>
    </div>
  );
}
