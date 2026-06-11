'use client';

import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

const PAGE_TITLES: Record<string, string> = {
  '/platform/clients':       'Clients',
  '/platform/users':         'Team',
  '/platform/notifications': 'Notifications',
  '/platform/settings':      'Settings',
};

function getTitle(pathname: string): { section: string; page: string | null } {
  if (pathname === '/platform/clients/new')          return { section: 'Clients', page: 'New Client' };
  if (pathname.match(/\/platform\/clients\/[^/]+$/)) return { section: 'Clients', page: 'Client Detail' };
  return { section: PAGE_TITLES[pathname] ?? 'Platform', page: null };
}

export function PlatformTopbar({
  email,
  name,
}: {
  email: string;
  name: string;
}) {
  const pathname = usePathname();
  const { section, page } = getTitle(pathname);
  const initial = (name || email)[0]?.toUpperCase() ?? 'P';

  return (
    <header className="h-[64px] shrink-0 flex items-center justify-between px-6 bg-white border-b border-slate-100">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-400 font-medium">Platform</span>
        <ChevronRight size={14} className="text-slate-300" />
        <span className={`font-semibold ${page ? 'text-slate-400' : 'text-slate-800'}`}>{section}</span>
        {page && (
          <>
            <ChevronRight size={14} className="text-slate-300" />
            <span className="font-semibold text-slate-800">{page}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
          {initial}
        </div>
        <div className="hidden sm:block">
          <p className="text-xs font-semibold text-slate-700 leading-tight">{name}</p>
          <p className="text-[10px] text-slate-400 leading-tight">{email}</p>
        </div>
      </div>
    </header>
  );
}
