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
  BarChart2,
  ShieldCheck,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const navItems = [
  { href: '/dashboard',      label: 'Overview',       icon: LayoutDashboard },
  { href: '/conversations',  label: 'Conversations',  icon: MessageSquare   },
  { href: '/escalations',    label: 'Escalations',    icon: AlertCircle     },
  { href: '/knowledge-base', label: 'Knowledge Base', icon: BookOpen        },
  { href: '/guardrails',     label: 'Guardrails',     icon: ShieldCheck     },
  { href: '/ai-models',      label: 'AI Models',      icon: Cpu             },
  { href: '/follow-ups',     label: 'Follow-ups',     icon: RefreshCw       },
  { href: '/analytics',      label: 'Analytics',      icon: BarChart2       },
  { href: '/settings',       label: 'Settings',       icon: Settings        },
];

export function DashboardNav({ tenantName, userRole }: { tenantName: string; userRole: string }) {
  const pathname = usePathname();
  const router   = useRouter();
  const supabase = getSupabaseBrowserClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const roleLabel = userRole.replace(/_/g, ' ');

  return (
    <aside className="w-[240px] shrink-0 flex flex-col h-screen bg-[#071c0f] border-r border-emerald-900/40">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-[64px] shrink-0 border-b border-emerald-900/40">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-900/60 shrink-0">
          <Bot size={15} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-white font-bold text-sm tracking-tight truncate">{tenantName}</p>
          <p className="text-emerald-600 text-[10px] leading-none mt-0.5 font-medium capitalize">{roleLabel}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-emerald-800 text-[10px] font-semibold uppercase tracking-widest px-3 pb-2">
          Navigation
        </p>
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group ${
                active
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-emerald-700 hover:bg-white/5 hover:text-emerald-300'
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-emerald-400" />
              )}
              <Icon size={15} className={`shrink-0 ${active ? 'text-emerald-400' : 'group-hover:text-emerald-300'}`} />
              <span className="font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-emerald-900/40">
        <button
          type="button"
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-emerald-800 hover:bg-white/5 hover:text-emerald-300 transition-all group"
        >
          <LogOut size={15} className="shrink-0" />
          <span className="font-medium">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
