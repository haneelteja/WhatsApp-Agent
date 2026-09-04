'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  MessageSquare,
  LayoutDashboard,
  BookOpen,
  Settings,
  LogOut,
  Bot,
  BarChart2,
  ShieldCheck,
  CreditCard,
  ShoppingCart,
  Megaphone,
  Zap,
  Target,
  MessageSquareMore,
  Plug,
  CalendarClock,
  ClipboardList,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const BASE_NAV = [
  { href: '/dashboard',        label: 'Overview',       icon: LayoutDashboard  },
  { href: '/conversations',    label: 'Conversations',  icon: MessageSquare    },
  { href: '/knowledge-base',   label: 'Knowledge Base', icon: BookOpen         },
  { href: '/guardrails',       label: 'Guardrails',     icon: ShieldCheck      },
  { href: '/call-triggers',    label: 'Triggers',       icon: Zap              },
  { href: '/button-templates', label: 'Buttons',        icon: MessageSquareMore },
  { href: '/campaigns',            label: 'Campaigns',  icon: Megaphone    },
  { href: '/scheduled-messages',  label: 'Scheduled',  icon: CalendarClock },
  { href: '/analytics',           label: 'Analytics',  icon: BarChart2    },
  { href: '/billing',          label: 'Billing',        icon: CreditCard       },
  { href: '/settings',         label: 'Settings',       icon: Settings         },
];

const LEADS_ITEM        = { href: '/leads',        label: 'Leads',        icon: Target      };
const INTEGRATIONS_ITEM = { href: '/integrations', label: 'Integrations', icon: Plug        };
const ORDERS_ITEM       = { href: '/orders',       label: 'Orders',       icon: ShoppingCart };

export function DashboardNav({
  tenantName,
  userRole,
  hasLifecycleBot,
  onLinkClick,
}: {
  tenantName: string;
  userRole: string;
  hasLifecycleBot: boolean;
  onLinkClick?: () => void;
}) {
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const botParam     = searchParams.get('bot');
  const supabase = getSupabaseBrowserClient();

  const ADMIN_ONLY_HREFS = new Set(['/audit']);
  const AGENT_HREFS      = new Set(['/dashboard', '/conversations']);
  const SUPERVISOR_HREFS = new Set(['/dashboard', '/conversations', '/leads', '/integrations', '/knowledge-base', '/orders', '/analytics', '/scheduled-messages', '/settings']);

  const navItems = (() => {
    const items = [...BASE_NAV];
    const convsIdx = items.findIndex(i => i.href === '/conversations');
    items.splice(convsIdx + 1, 0, LEADS_ITEM, INTEGRATIONS_ITEM);
    if (hasLifecycleBot) {
      const guardrailsIdx = items.findIndex(i => i.href === '/guardrails');
      items.splice(guardrailsIdx + 1, 0, ORDERS_ITEM);
    }
    // Audit log — admin and client_manager only
    if (['admin', 'client_manager'].includes(userRole)) {
      const analyticsIdx = items.findIndex(i => i.href === '/analytics');
      items.splice(analyticsIdx + 1, 0, { href: '/audit', label: 'Activity Log', icon: ClipboardList });
    }
    if (userRole === 'agent') return items.filter(i => !ADMIN_ONLY_HREFS.has(i.href) && AGENT_HREFS.has(i.href));
    if (userRole === 'supervisor') return items.filter(i => !ADMIN_ONLY_HREFS.has(i.href) && SUPERVISOR_HREFS.has(i.href));
    return items;
  })();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const roleLabel = userRole.replace(/_/g, ' ');

  return (
    <aside
      className="w-[240px] shrink-0 flex flex-col h-screen bg-[#071c0f] border-r border-emerald-900/40"
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-[64px] shrink-0 border-b border-emerald-900/40">
        <div
          className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-900/60 shrink-0"
          aria-hidden="true"
        >
          <Bot size={15} className="text-white" />
        </div>
        <div className="min-w-0">
          {/* #fff — white text on #071c0f: 19:1 contrast */}
          <p className="text-white font-bold text-sm tracking-tight truncate">{tenantName}</p>
          {/* #6ee7b7 (emerald-300) on #071c0f: ~5:1 contrast — passes WCAG AA */}
          <p className="text-emerald-300 text-[10px] leading-none mt-0.5 font-medium capitalize">{roleLabel}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" role="navigation" aria-label="Dashboard sections">
        {/* #6ee7b7 (emerald-300) on #071c0f: ~5:1 — passes AA */}
        <p className="text-emerald-300/50 text-[10px] font-semibold uppercase tracking-widest px-3 pb-2" aria-hidden="true">
          Navigation
        </p>
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          const navHref = botParam ? `${href}?bot=${botParam}` : href;
          // Derive a stable tour-id from the href path segment
          const tourId = href.replace(/^\//, '').replace(/\//g, '-') || 'overview';
          return (
            <Link
              key={href}
              href={navHref}
              onClick={onLinkClick}
              aria-current={active ? 'page' : undefined}
              data-tour-id={tourId}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group ${
                active
                  /* active: #6ee7b7 emerald-300 on #071c0f — ~5:1 contrast ✓ */
                  ? 'bg-emerald-500/10 text-emerald-300'
                  /* inactive: #a7f3d0 emerald-200 on #071c0f — ~5.2:1 contrast ✓ */
                  : 'text-emerald-200/70 hover:bg-white/5 hover:text-emerald-200'
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-emerald-400" aria-hidden="true" />
              )}
              <Icon size={15} className={`shrink-0 ${active ? 'text-emerald-300' : 'text-emerald-200/50 group-hover:text-emerald-200'}`} aria-hidden="true" />
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
          aria-label="Sign out of Alphabot"
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-emerald-200/50 hover:bg-white/5 hover:text-emerald-200 transition-all group"
        >
          <LogOut size={15} className="shrink-0" aria-hidden="true" />
          <span className="font-medium">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
