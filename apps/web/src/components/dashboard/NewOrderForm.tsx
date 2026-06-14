'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Check, Send } from 'lucide-react';
import { createOrderAction, type OrderItem } from '@/app/actions/orders';

interface Contact      { id: string; phone: string; name: string | null }
interface Conversation { id: string; contact_id: string; product_type: string; created_at: string }

interface Props {
  tenantId:      string;
  contacts:      Contact[];
  conversations: Conversation[];
}

const emptyItem = (): OrderItem => ({ name: '', quantity: 1, price: 0 });

export function NewOrderForm({ tenantId, contacts, conversations }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error,  setError]  = useState<string | null>(null);
  const [result, setResult] = useState<{ linkUrl: string | null } | null>(null);

  const [contactId,      setContactId]      = useState('');
  const [conversationId, setConversationId] = useState('');
  const [items,          setItems]          = useState<OrderItem[]>([emptyItem()]);
  const [sendLink,       setSendLink]       = useState(true);

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);

  const contactConversations = conversations.filter(c => c.contact_id === contactId);

  function updateItem(index: number, field: keyof OrderItem, value: string | number) {
    setItems(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: field === 'name' ? value : Number(value) } : item
    ));
  }

  function addItem()         { setItems(p => [...p, emptyItem()]); }
  function removeItem(i: number) { setItems(p => p.filter((_, idx) => idx !== i)); }

  function handleSubmit() {
    setError(null);
    if (!contactId || !conversationId) { setError('Select a contact and conversation'); return; }
    if (items.some(i => !i.name || i.price <= 0)) { setError('Fill in all item names and prices'); return; }

    startTransition(async () => {
      const res = await createOrderAction(tenantId, contactId, conversationId, items, total, sendLink);
      if ('error' in res) {
        setError(res.error);
      } else {
        setResult({ linkUrl: res.linkUrl ?? null });
        setTimeout(() => router.push('/orders'), 3000);
      }
    });
  }

  if (result) {
    return (
      <div className="bg-white rounded-2xl border border-green-100 p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <Check size={22} className="text-emerald-600" />
        </div>
        <p className="text-lg font-bold text-slate-800">Order Created!</p>
        {result.linkUrl ? (
          <>
            <p className="text-sm text-slate-500">Payment link sent via WhatsApp.</p>
            <a href={result.linkUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-indigo-600 underline break-all">{result.linkUrl}</a>
          </>
        ) : (
          <p className="text-sm text-slate-500">Order saved. No payment link generated.</p>
        )}
        <p className="text-xs text-slate-400">Redirecting to orders…</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-6 space-y-5">
      {/* Contact */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Contact</label>
        <select
          value={contactId}
          onChange={e => { setContactId(e.target.value); setConversationId(''); }}
          className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white"
        >
          <option value="">Select a contact…</option>
          {contacts.map(c => (
            <option key={c.id} value={c.id}>{c.name ? `${c.name} · ` : ''}{c.phone}</option>
          ))}
        </select>
      </div>

      {/* Conversation */}
      {contactId && (
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Conversation</label>
          {contactConversations.length === 0 ? (
            <p className="text-xs text-slate-400">No open conversations for this contact.</p>
          ) : (
            <select
              value={conversationId}
              onChange={e => setConversationId(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white"
            >
              <option value="">Select a conversation…</option>
              {contactConversations.map(c => (
                <option key={c.id} value={c.id}>
                  {c.product_type.replace(/_/g, ' ')} · {new Date(c.created_at).toLocaleDateString('en-IN')}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Items</label>
          <button type="button" onClick={addItem} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 font-semibold">
            <Plus size={12} /> Add item
          </button>
        </div>
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-[1fr_80px_90px_32px] gap-2 items-center">
              <input
                type="text"
                value={item.name}
                onChange={e => updateItem(i, 'name', e.target.value)}
                placeholder="Item name"
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
              <input
                type="number"
                value={item.quantity}
                min={1}
                onChange={e => updateItem(i, 'quantity', e.target.value)}
                placeholder="Qty"
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 text-center"
              />
              <input
                type="number"
                value={item.price || ''}
                min={0}
                step={0.01}
                onChange={e => updateItem(i, 'price', e.target.value)}
                placeholder="₹ Price"
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
              <button type="button" onClick={() => removeItem(i)} disabled={items.length === 1}
                className="p-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-30">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Total */}
      <div className="flex items-center justify-between py-3 border-t border-slate-100">
        <p className="text-sm font-semibold text-slate-600">Total</p>
        <p className="text-xl font-bold text-slate-800 tabular-nums">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
      </div>

      {/* Send link toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={sendLink} onChange={e => setSendLink(e.target.checked)}
          className="w-4 h-4 accent-emerald-600" />
        <span className="text-sm text-slate-600">Send PhonePe payment link via WhatsApp</span>
      </label>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending || !contactId || !conversationId || total <= 0}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
      >
        <Send size={14} />
        {pending ? 'Creating…' : 'Create Order & Send Link'}
      </button>
    </div>
  );
}
