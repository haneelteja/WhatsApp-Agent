'use client';

import { usePathname } from 'next/navigation';
import { Bell, ChevronRight, Menu } from 'lucide-react';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':       'Overview',
  '/conversations':   'Conversations',
  '/escalations':     'Escalations',
  '/knowledge-base':  'Knowledge Base',
  '/settings':        'Settings',
  '/analytics':       'Analytics',
  '/campaigns':       'Campaigns',
  '/leads':           'Leads',
  '/billing':         'Billing',
  '/integrations':    'Integrations',
  '/guardrails':      'Guardrails',
  '/call-triggers':   'Triggers',
  '/button-templates':'Buttons',
  '/orders':          'Orders',
  '/contacts':        'Contacts',
  '/groups':          'Groups',
  '/voice':           'Voice Calls',
  '/follow-ups':      'Follow-ups',
  '/ai-models':       'AI Models',
  '/catalogue':       'Catalogue',
  '/team':            'Team',
};

function getTitle(pathname: string): string {
  if (pathname.startsWith('/conversations/')) return 'Conversation';
  if (pathname.startsWith('/campaigns/')) return 'Campaign';
  if (pathname.startsWith('/voice/')) return 'Call Detail';
  if (pathname.startsWith('/groups/')) return 'Group';
  return PAGE_TITLES[pathname] ?? 'Alphabot';
}

export function Topbar({
  email,
  tenantName,
  onMenuClick,
}: {
  email: string;
  tenantName: string;
  onMenuClick?: () => void;
}) {
  const pathname = usePathname();
  const title    = getTitle(pathname);
  const initial  = email[0]?.toUpperCase() ?? 'U';
  const isDetail = pathname.startsWith('/conversations/');

  return (
    <header className="h-[64px] shrink-0 flex items-center justify-between px-4 sm:px-6 bg-white border-b border-green-100">
      {/* Left: hamburger (mobile) + breadcrumb */}
      <div className="flex items-center gap-3">
        {/* Mobile hamburger — hidden on lg+ */}
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          className="lg:hidden -ml-1 w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-green-50 hover:text-green-700 transition-colors"
        >
          <Menu size={18} />
        </button>

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-2 text-sm list-none" style={{ margin: 0, padding: 0 }}>
            <li>
              <span className="text-green-600/50 font-medium truncate max-w-[120px] sm:max-w-none block">{tenantName}</span>
            </li>
            <li aria-hidden="true"><ChevronRight size={14} className="text-green-300" /></li>
            <li>
              <span className={`font-semibold ${isDetail ? 'text-green-600/50' : 'text-gray-800'}`}>
                {isDetail ? 'Conversations' : title}
              </span>
            </li>
            {isDetail && (
              <>
                <li aria-hidden="true"><ChevronRight size={14} className="text-green-300" /></li>
                <li><span className="font-semibold text-gray-800">Detail</span></li>
              </>
            )}
          </ol>
        </nav>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Notifications"
          className="relative w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:bg-green-50 hover:text-green-600 transition-colors"
        >
          <Bell size={16} aria-hidden="true" />
          {/* Notification dot — would carry a count in a full implementation */}
          <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        </button>

        <div
          className="flex items-center gap-2.5 pl-2 ml-1 border-l border-green-100"
          role="img"
          aria-label={`Signed in as ${email}`}
        >
          <div
            className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center text-white text-xs font-bold shadow-sm shadow-emerald-200"
            aria-hidden="true"
          >
            {initial}
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-semibold text-gray-700 leading-tight">{email.split('@')[0]}</p>
            <p className="text-[10px] text-gray-400 leading-tight">{email}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
