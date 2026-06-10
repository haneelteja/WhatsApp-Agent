'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageSquare,
  LayoutDashboard,
  BookOpen,
  AlertCircle,
  Settings,
  LogOut,
  Bot,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/conversations', label: 'Conversations', icon: MessageSquare },
  { href: '/escalations', label: 'Escalations', icon: AlertCircle },
  { href: '/knowledge-base', label: 'Knowledge Base', icon: BookOpen },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <aside className="w-[220px] shrink-0 flex flex-col bg-slate-900 h-screen">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-[60px] shrink-0">
        <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/30">
          <Bot size={16} className="text-white" />
        </div>
        <div>
          <p className="text-white font-bold text-sm tracking-tight">Alphabot</p>
          <p className="text-slate-500 text-[11px] leading-none mt-0.5">Dashboard</p>
        </div>
      </div>

      <div className="mx-4 h-px bg-slate-800" />

      {/* Nav section label */}
      <p className="text-slate-600 text-[10px] font-semibold uppercase tracking-widest px-5 mt-5 mb-2">
        Menu
      </p>

      {/* Nav items */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all group ${
                active
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
              }`}
            >
              <Icon
                size={16}
                className={`shrink-0 ${active ? 'text-emerald-400' : 'group-hover:text-slate-300'}`}
              />
              <span className="font-medium">{label}</span>
              {active && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mx-4 h-px bg-slate-800" />

      {/* Sign out */}
      <div className="p-3">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-all group"
        >
          <LogOut size={16} className="shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
