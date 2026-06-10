'use client';

import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Overview',
  '/conversations': 'Conversations',
  '/escalations': 'Escalations',
  '/knowledge-base': 'Knowledge Base',
  '/settings': 'Settings',
};

function getTitle(pathname: string): string {
  if (pathname.startsWith('/conversations/')) return 'Conversation';
  return PAGE_TITLES[pathname] ?? 'Alphabot';
}

export function Topbar({ email }: { email: string }) {
  const pathname = usePathname();
  const title = getTitle(pathname);
  const initial = email[0]?.toUpperCase() ?? 'U';

  return (
    <header className="h-[60px] shrink-0 flex items-center justify-between px-6 bg-white border-b border-slate-200">
      <h1 className="text-base font-semibold text-slate-800">{title}</h1>

      <div className="flex items-center gap-3">
        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
          <Bell size={16} />
        </button>
        <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">
          {initial}
        </div>
      </div>
    </header>
  );
}
