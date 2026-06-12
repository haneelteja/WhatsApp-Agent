'use client';

import { useState, useTransition } from 'react';
import { Mail, UserPlus, Copy, Check } from 'lucide-react';
import { sendInviteAction } from '@/app/actions/invites';

export function InviteUserForm({ tenantId }: { tenantId: string }) {
  const [pending, startTransition] = useTransition();
  const [email,   setEmail]   = useState('');
  const [role,    setRole]    = useState('client_manager');
  const [result,  setResult]  = useState<{ inviteUrl?: string; error?: string } | null>(null);
  const [copied,  setCopied]  = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const res = await sendInviteAction(tenantId, email, role);
      setResult(res.error ? { error: res.error } : { inviteUrl: res.inviteUrl });
      if (!res.error) setEmail('');
    });
  }

  function copyLink() {
    if (!result?.inviteUrl) return;
    navigator.clipboard.writeText(result.inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="client@company.com"
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
        >
          <option value="client_manager">Manager</option>
          <option value="client_admin">Admin</option>
          <option value="agent">Agent</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
        >
          <UserPlus size={14} />
          {pending ? 'Sending…' : 'Send Invite'}
        </button>
      </form>

      {result?.error && (
        <p className="text-sm text-red-500">{result.error}</p>
      )}

      {result?.inviteUrl && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Mail size={14} className="text-emerald-600 shrink-0" />
            <p className="text-sm font-semibold text-emerald-800">Invite sent!</p>
          </div>
          <p className="text-xs text-emerald-600">
            Email sent to <strong>{email || 'the client'}</strong>. Share the link below if email doesn&apos;t arrive.
          </p>
          <div className="flex items-center gap-2 bg-white border border-emerald-200 rounded-lg px-3 py-2">
            <code className="flex-1 text-xs text-slate-600 truncate font-mono">{result.inviteUrl}</code>
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 text-slate-400 hover:text-slate-700 transition-colors"
              title="Copy link"
            >
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
