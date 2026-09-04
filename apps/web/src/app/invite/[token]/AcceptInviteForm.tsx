'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { acceptInviteAction } from '@/app/actions/invites';

const PW_RULES = [
  { label: 'At least 8 characters',   test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter',     test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter',     test: (p: string) => /[a-z]/.test(p) },
  { label: 'One number',               test: (p: string) => /[0-9]/.test(p) },
  { label: 'One special character',    test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function isPasswordValid(p: string) {
  return PW_RULES.every(r => r.test(p));
}

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
  const [name,        setName]        = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [showPw,      setShowPw]      = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwTouched,   setPwTouched]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const confirmMismatch = confirm.length > 0 && password !== confirm;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPwTouched(true);

    if (!isPasswordValid(password)) {
      setError('Password does not meet all requirements.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
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
        {/* Full name */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your full name"
            className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              required
              value={password}
              onChange={e => { setPassword(e.target.value); setPwTouched(true); }}
              placeholder="Create a strong password"
              autoComplete="new-password"
              className={`w-full text-sm border rounded-xl px-4 py-2.5 pr-11 focus:outline-none focus:ring-2 focus:ring-emerald-300 transition ${
                pwTouched && !isPasswordValid(password) ? 'border-red-300' : 'border-gray-200'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          {/* Password strength checklist */}
          {pwTouched && (
            <ul className="mt-2 space-y-1 px-1">
              {PW_RULES.map(rule => {
                const ok = rule.test(password);
                return (
                  <li key={rule.label} className={`flex items-center gap-2 text-[11px] font-medium ${ok ? 'text-emerald-600' : 'text-red-500'}`}>
                    <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold ${ok ? 'bg-emerald-100' : 'bg-red-100'}`}>
                      {ok ? '✓' : '✗'}
                    </span>
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Always-visible hint when not yet touched */}
          {!pwTouched && (
            <p className="mt-1.5 text-[11px] text-gray-400">
              Must include uppercase, lowercase, number, and special character.
            </p>
          )}
        </div>

        {/* Confirm password */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Confirm Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              required
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat your password"
              autoComplete="new-password"
              className={`w-full text-sm border rounded-xl px-4 py-2.5 pr-11 focus:outline-none focus:ring-2 focus:ring-emerald-300 transition ${
                confirmMismatch ? 'border-red-300' : 'border-gray-200'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
            >
              {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {confirmMismatch && (
            <p className="mt-1 text-[11px] font-medium text-red-500">Passwords do not match</p>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
      )}

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
