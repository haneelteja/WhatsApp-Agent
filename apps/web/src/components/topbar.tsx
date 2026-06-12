'use client';

import { usePathname } from 'next/navigation';
import { Bell, ChevronRight } from 'lucide-react';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':      'Overview',
  '/conversations':  'Conversations',
  '/escalations':    'Escalations',
  '/knowledge-base': 'Knowledge Base',
  '/settings':       'Settings',
};

function getTitle(pathname: string): string {
  if (pathname.startsWith('/conversations/')) return 'Conversation';
  return PAGE_TITLES[pathname] ?? 'Alphabot';
}

export function Topbar({ email, tenantName }: { email: string; tenantName: string }) {
  const pathname = usePathname();
  const title    = getTitle(pathname);
  const initial  = email[0]?.toUpperCase() ?? 'U';
  const isDetail = pathname.startsWith('/conversations/');

  return (
    <header className="h-[64px] shrink-0 flex items-center justify-between px-6 bg-white border-b border-green-100">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-green-600/50 font-medium">{tenantName}</span>
        <ChevronRight size={14} className="text-green-300" />
        <span className={`font-semibold ${isDetail ? 'text-green-600/50' : 'text-gray-800'}`}>
          {isDetail ? 'Conversations' : title}
        </span>
        {isDetail && (
          <>
            <ChevronRight size={14} className="text-green-300" />
            <span className="font-semibold text-gray-800">Detail</span>
          </>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        <button className="relative w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:bg-green-50 hover:text-green-600 transition-colors">
          <Bell size={16} />
          <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-emerald-500" />
        </button>

        <div className="flex items-center gap-2.5 pl-2 ml-1 border-l border-green-100">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center text-white text-xs font-bold shadow-sm shadow-emerald-200">
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
