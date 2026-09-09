'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Paperclip, X as XIcon } from 'lucide-react';

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

function parseContent(text: string | undefined | null): Array<{ kind: 'text' | 'nav'; content: string; path?: string; label?: string }> {
  if (!text) return [{ kind: 'text', content: '' }];
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
  } else if (msg.toolName === 'add_kb_articles_bulk') {
    const arts = (input['articles'] as Array<{ question: string }> | undefined) ?? [];
    summary = `Add ${arts.length} KB article${arts.length !== 1 ? 's' : ''} to "${input['collection_name'] as string}"`;
  } else if (msg.toolName === 'update_escalation_triggers') {
    const triggers = (input['triggers'] as string[] | undefined) ?? [];
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
  const navParts  = parts.filter(p => p.kind === 'nav');

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
        {msg.actionStatus === 'approved'  && <p className="text-[11px] text-emerald-600">✓ Executing…</p>}
        {msg.actionStatus === 'cancelled' && <p className="text-[11px] text-slate-400">✗ Cancelled</p>}
      </div>
    </div>
  );
}

const STORAGE_KEY  = 'copilot-pos-y';
const PANEL_HEIGHT = 520; // px — must match the panel's h-[520px]
const BTN_HEIGHT   = 42;  // approximate button height
const EDGE_PAD     = 16;  // px from right edge
const MIN_TOP      = 20;

export function CopilotWidget({ initialMessages }: CopilotWidgetProps) {
  const [open,           setOpen]           = useState(false);
  const [messages,       setMessages]       = useState<CopilotMessage[]>(initialMessages);
  const [input,          setInput]          = useState('');
  const [loading,        setLoading]        = useState(false);
  const [attachedFile,   setAttachedFile]   = useState<{ name: string; content: string } | null>(null);
  const [fileLoading,    setFileLoading]    = useState(false);

  // Drag position — initialised from localStorage after mount (SSR-safe)
  const [posY,     setPosY]     = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const loadingRef     = useRef(false);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const posYRef        = useRef<number>(0);    // sync ref for closure access
  const dragStartY     = useRef(0);
  const dragStartPosY  = useRef(0);
  const totalMovement  = useRef(0);
  const bottomRef      = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const prevInitialRef = useRef(initialMessages);

  // Read saved position once on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const defaultY = Math.max(MIN_TOP, window.innerHeight * 0.78);
    const y = saved ? Math.min(Number(saved), window.innerHeight - BTN_HEIGHT - MIN_TOP) : defaultY;
    setPosY(y);
    posYRef.current = y;
  }, []);

  // Keep posYRef in sync
  useEffect(() => {
    if (posY !== null) posYRef.current = posY;
  }, [posY]);

  // Sync when parent re-renders with fresh DB data
  useEffect(() => {
    if (prevInitialRef.current !== initialMessages) {
      prevInitialRef.current = initialMessages;
      if (!loadingRef.current) setMessages(initialMessages);
    }
  }, [initialMessages]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 0);
    return () => clearTimeout(timer);
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(timer);
  }, [open]);

  // ── Drag handling ─────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    // Only respond to primary button
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    totalMovement.current  = 0;
    dragStartY.current     = e.clientY;
    dragStartPosY.current  = posYRef.current;

    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - dragStartY.current;
      totalMovement.current = Math.abs(dy);

      const maxY = window.innerHeight - BTN_HEIGHT - MIN_TOP;
      const newY = Math.max(MIN_TOP, Math.min(maxY, dragStartPosY.current + dy));
      setPosY(newY);
      posYRef.current = newY;
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
      localStorage.setItem(STORAGE_KEY, String(Math.round(posYRef.current)));
      setDragging(false);
      // If barely moved → treat as click (toggle panel)
      if (totalMovement.current < 6) setOpen(v => !v);
    };

    setDragging(true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);
  }, []);

  // ── Panel position: open above button unless too close to top ────────────
  const panelBelow = posY !== null && posY < PANEL_HEIGHT + 24;

  // ── File attachment ───────────────────────────────────────────────────────
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const textTypes = ['text/plain', 'text/csv', 'text/markdown', 'application/json', 'application/x-ndjson'];
    const isText = textTypes.some(t => file.type === t) || /\.(txt|csv|md|json|tsv)$/i.test(file.name);
    const isPdf  = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

    if (!isText && !isPdf) {
      alert('Unsupported file type. Please attach a PDF, CSV, TXT, MD, or JSON file.');
      return;
    }

    setFileLoading(true);
    try {
      if (isText) {
        const text = await file.text();
        setAttachedFile({ name: file.name, content: text });
      } else {
        // PDF: send to extraction endpoint
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/copilot/file', { method: 'POST', body: fd });
        if (!res.ok) {
          const err = await res.json() as { error?: string };
          alert(`Could not read PDF: ${err.error ?? 'Unknown error'}`);
          return;
        }
        const data = await res.json() as { text: string; filename: string };
        setAttachedFile({ name: data.filename, content: data.text });
      }
    } catch {
      alert('Failed to read file. Please try again.');
    } finally {
      setFileLoading(false);
    }
  }, []);

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loadingRef.current) return;

    // Build message with optional file content
    let fullMessage = text.trim();
    const file = attachedFile;
    if (file) {
      fullMessage = `${text.trim()}\n\n[Attached file: ${file.name}]\n${file.content}`;
    }

    const userMsg: CopilotMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: file ? `${text.trim()} [📎 ${file.name}]` : text,
      type: 'message',
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setAttachedFile(null);
    setLoading(true);
    loadingRef.current = true;

    try {
      const res  = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: fullMessage }),
      });
      const data = await res.json() as {
        type?: 'message' | 'action_pending';
        messageId?: string;
        content?: string;
        assistantText?: string;
        toolName?: string;
        toolInput?: Record<string, unknown>;
        toolUseId?: string;
        error?: string;
      };

      if (!res.ok) {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${data.error ?? res.statusText}`, type: 'message' }]);
      } else if (data.type === 'action_pending') {
        setMessages(prev => [...prev, { id: data.messageId ?? crypto.randomUUID(), role: 'assistant', content: data.assistantText ?? '', type: 'action_pending', toolName: data.toolName, toolInput: data.toolInput, toolUseId: data.toolUseId, actionStatus: 'pending' }]);
      } else {
        setMessages(prev => [...prev, { id: data.messageId ?? crypto.randomUUID(), role: 'assistant', content: data.content ?? '', type: 'message' }]);
      }
    } catch {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: 'Something went wrong. Please try again.', type: 'message' }]);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  const handleAction = useCallback(async (msg: CopilotMessage, approved: boolean) => {
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, actionStatus: approved ? 'approved' : 'cancelled' } : m));
    setLoading(true);
    loadingRef.current = true;
    try {
      const res  = await fetch('/api/copilot/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: msg.id, approved }) });
      const data = await res.json() as { type: string; content?: string; messageId?: string; error?: string };
      if (!res.ok) {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `Failed to execute action: ${data.error ?? res.statusText}`, type: 'message' }]);
      } else {
        setMessages(prev => [...prev, { id: data.messageId ?? crypto.randomUUID(), role: 'assistant', content: data.content ?? '', type: 'message' }]);
      }
    } catch {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: 'Something went wrong executing that action.', type: 'message' }]);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  // Don't render until we know the position (avoids flash at wrong spot)
  if (posY === null) return null;

  return (
    <div
      style={{ position: 'fixed', top: posY, right: EDGE_PAD, zIndex: 50 }}
      className="flex flex-col items-end"
    >
      {/* Chat panel — above or below depending on viewport position */}
      {open && (
        <div
          style={panelBelow
            ? { position: 'absolute', top: BTN_HEIGHT + 8, right: 0 }
            : { position: 'absolute', bottom: BTN_HEIGHT + 8, right: 0 }}
          className="w-[380px] h-[520px] bg-white rounded-2xl shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden animate-in slide-in-from-bottom-2 duration-200"
        >
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
          <div className="border-t border-slate-100 p-3 flex flex-col gap-2 flex-shrink-0">
            {/* Attached file chip */}
            {attachedFile && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                <Paperclip size={11} className="text-emerald-600 shrink-0" />
                <span className="text-xs text-emerald-700 font-medium truncate flex-1">{attachedFile.name}</span>
                <button
                  onClick={() => setAttachedFile(null)}
                  className="text-emerald-400 hover:text-emerald-700 shrink-0"
                  aria-label="Remove attachment"
                >
                  <XIcon size={12} />
                </button>
              </div>
            )}

            <div className="flex gap-2">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv,.md,.json,.tsv,.pdf"
                className="hidden"
                onChange={handleFileSelect}
              />

              {/* Paperclip button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || fileLoading}
                aria-label="Attach file"
                title="Attach a file (CSV, PDF, TXT…)"
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50 transition-colors disabled:opacity-40 shrink-0"
              >
                {fileLoading
                  ? <span className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                  : <Paperclip size={14} />
                }
              </button>

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
                disabled={loading || (!input.trim() && !attachedFile)}
                aria-label="Send"
                className="bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl w-10 flex items-center justify-center transition-colors text-base font-bold shrink-0"
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Draggable bubble button */}
      <button
        onPointerDown={onPointerDown}
        aria-label="AI Copilot"
        className={`bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-full shadow-lg px-4 py-2.5 flex items-center gap-2 transition-shadow duration-150 select-none touch-none ${
          dragging ? 'shadow-2xl scale-105 cursor-grabbing' : 'cursor-grab active:scale-95'
        }`}
      >
        <span className="text-base leading-none">✨</span>
        <span className="text-sm font-semibold">AI Copilot</span>
        {/* Drag hint — shown only when not open */}
        {!open && !dragging && (
          <span className="text-[9px] text-white/50 leading-none ml-0.5">⠿</span>
        )}
      </button>
    </div>
  );
}
