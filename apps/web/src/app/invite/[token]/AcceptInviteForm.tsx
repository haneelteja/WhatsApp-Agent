'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { acceptInviteAction } from '@/app/actions/invites';

export function AcceptInviteForm({
  token,
  email,
  tenantName,
  role,
}: {
  token: string;
  email: string;
  tenantName: string;
  role: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name,     setName]     = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    startTransition(async () => {
      const result = await acceptInviteAction(token, name.trim(), password);

      if (result.error) {
        setError(result.error);
        return;
      }

      // Auto sign-in after account created
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: result.email!,
        password,
      });

      if (signInError) {
        // Account created but sign-in failed — redirect to login
        router.push('/login?message=Account+created.+Please+sign+in.');
        return;
      }

      router.push('/dashboard');
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-sm text-gray-500 mb-1">Joining as</p>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-800">{tenantName}</p>
            <p className="text-xs text-emerald-600">{email}</p>
          </div>
          <span className="text-[11px] px-2 py-0.5 bg-white text-emerald-700 rounded-full font-medium border border-emerald-200 capitalize">
            {role.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your full name"
            className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Confirm Password</label>
          <input
            type="password"
            required
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Repeat password"
            className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-3 bg-emerald-600 text-white font-semibold text-sm rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
      >
        {pending ? 'Creating account…' : 'Accept Invitation & Get Started'}
      </button>
    </form>
  );
}
