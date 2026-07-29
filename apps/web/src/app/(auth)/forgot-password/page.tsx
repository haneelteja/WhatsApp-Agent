'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { Bot, ArrowLeft } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');
  const supabase = getSupabaseBrowserClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback?next=/reset-password`
        : '/auth/callback?next=/reset-password';

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="w-full max-w-[400px]">
        <div className="flex items-center gap-2 mb-10">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center">
            <Bot size={16} className="text-white" />
          </div>
          <span className="font-bold text-gray-900 text-lg">Alphabot</span>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Check your inbox</h1>
            <p className="text-sm text-gray-500">
              We&apos;ve sent a password reset link to <span className="font-medium text-gray-700">{email}</span>.
              The link expires in 1 hour.
            </p>
            <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 font-medium mt-4">
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-gray-900">Forgot password?</h1>
              <p className="text-gray-500 text-sm mt-1">Enter your email and we&apos;ll send you a reset link.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                  className="w-full h-11 px-3.5 rounded-xl border border-green-200 bg-white text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2.5 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-3">
                  <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">!</span>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-60 transition-colors shadow-sm shadow-emerald-500/20"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Sending…
                  </span>
                ) : 'Send reset link'}
              </button>
            </form>

            <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mt-6 transition-colors">
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
