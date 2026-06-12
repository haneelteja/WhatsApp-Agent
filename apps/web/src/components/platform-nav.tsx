'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, Users, Bell, Settings, LogOut, Shield, ShieldCheck, Box } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const NAV_ITEMS = [
  { href: '/platform/clients',    label: 'Clients',    icon: Building2  },
  { href: '/platform/users',      label: 'Team',       icon: Users      },
  { href: '/platform/products',   label: 'Products',   icon: Box        },
  { href: '/platform/guardrails', label: 'Guardrails', icon: ShieldCheck },
  { href: '/platform/notifications', label: 'Notifications', icon: Bell },
  { href: '/platform/settings',   label: 'Settings',   icon: Settings   },
];

export function PlatformNav({ role }: { role: string }) {
  const pathname = usePathname();
  const router   = useRouter();
  const supabase = getSupabaseBrowserClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <aside className="w-[240px] shrink-0 flex flex-col h-screen bg-slate-950 border-r border-slate-800">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-[64px] shrink-0 border-b border-slate-800">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shrink-0">
          <Shield size={15} className="text-white" />
        </div>
        <div>
          <p className="text-white font-bold text-sm tracking-tight">Alphabot</p>
          <p className="text-indigo-400 text-[10px] leading-none mt-0.5 font-medium">Platform Console</p>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-slate-600 text-[10px] font-semibold uppercase tracking-widest px-3 pb-2">
          Management
        </p>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all group ${
                active
                  ? 'bg-indigo-500/10 text-indigo-400'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-indigo-400" />
              )}
              <Icon size={15} className="shrink-0" />
              <span className="font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Role + sign out */}
      <div className="p-3 border-t border-slate-800 space-y-1">
        <div className="px-3 py-1.5">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
            role === 'manager'
              ? 'bg-indigo-500/20 text-indigo-400'
              : 'bg-slate-700 text-slate-400'
          }`}>
            {role === 'manager' ? 'Platform Manager' : 'Platform Admin'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-slate-500 hover:bg-white/5 hover:text-slate-200 transition-all"
        >
          <LogOut size={15} className="shrink-0" />
          <span className="font-medium">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
