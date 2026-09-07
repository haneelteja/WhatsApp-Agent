'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Flag } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { flagMessageAction } from '@/app/actions/kb-feedback';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  confidence_score: number | null;
}

export function ConversationMessages({
  conversationId,
  initialMessages,
}: {
  conversationId: string;
  initialMessages: Message[];
}) {
  const [messages,  setMessages]  = useState<Message[]>(initialMessages);
  const [flagged,   setFlagged]   = useState<Set<string>>(new Set());
  const [, startTransition]       = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase  = useRef(getSupabaseBrowserClient()).current;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          setMessages(prev => {
            if (prev.some(m => m.id === (payload.new as Message).id)) return prev;
            return [...prev, payload.new as Message];
          });
        },
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          setMessages(prev => prev.map(m => m.id === (payload.new as Message).id ? payload.new as Message : m));
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [conversationId, supabase]);

  function handleFlag(msg: Message) {
    if (flagged.has(msg.id)) return;
    setFlagged(prev => new Set([...prev, msg.id]));
    startTransition(() => {
      void flagMessageAction(msg.id, conversationId, msg.content);
    });
  }

  const renderedMessages = useMemo(
    () => messages.map(msg => {
      if (msg.role === 'system') {
        return (
          <div key={msg.id} className="flex justify-center">
            <span className="text-[11px] text-slate-400 bg-white border border-slate-200 rounded-full px-3 py-1 italic">
              {msg.content}
            </span>
          </div>
        );
      }

      const isBot      = msg.role === 'assistant';
      const isFlagged  = flagged.has(msg.id);

      return (
        <div key={msg.id} className={`flex ${isBot ? 'justify-end' : 'justify-start'} group`}>
          {!isBot && (
            <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-xs font-bold shrink-0 mt-1 mr-2">
              U
            </div>
          )}
          <div className={`max-w-[72%] ${isBot ? 'items-end' : 'items-start'} flex flex-col`}>
            <div
              className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                isBot
                  ? 'bg-emerald-600 text-white rounded-tr-md'
                  : 'bg-white text-slate-800 border border-slate-200 shadow-sm rounded-tl-md'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
            <div className={`flex items-center gap-1.5 mt-1 px-1 ${isBot ? 'flex-row-reverse' : ''}`}>
              <span className="text-[10px] text-slate-400" suppressHydrationWarning>
                {new Date(msg.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
              {isBot && msg.confidence_score !== null && (
                <span className="text-[10px] text-slate-400">
                  · {Math.round(msg.confidence_score * 100)}% conf.
                </span>
              )}
              {/* Flag button — only on bot messages, visible on group hover */}
              {isBot && (
                <button
                  type="button"
                  onClick={() => handleFlag(msg)}
                  title={isFlagged ? 'Flagged for KB review' : 'Flag this answer for KB improvement'}
                  className={`opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md ${
                    isFlagged
                      ? 'text-amber-600 bg-amber-50 opacity-100'
                      : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'
                  }`}
                >
                  <Flag size={10} />
                  {isFlagged ? 'Flagged' : 'Flag'}
                </button>
              )}
            </div>
          </div>
          {isBot && (
            <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-1 ml-2">
              AI
            </div>
          )}
        </div>
      );
    }),
    [messages, flagged],
  );

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 bg-slate-50">
      {messages.length === 0 && (
        <p className="text-sm text-slate-400 text-center mt-12">No messages yet in this conversation.</p>
      )}
      {renderedMessages}
      <div ref={bottomRef} />
    </div>
  );
}
