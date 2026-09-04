'use client';

import { useState, useEffect, useRef } from 'react';
import { DashboardNav } from '@/components/dashboard-nav';
import { Topbar } from '@/components/topbar';
import { GuidedTour } from '@/components/dashboard/GuidedTour';
import type { ActiveBot } from '@/components/dashboard/BotSelector';

export function DashboardShell({
  children,
  tenantName,
  email,
  userRole,
  hasLifecycleBot,
  activeBots = [],
  tourCompleted = true,
}: {
  children: React.ReactNode;
  tenantName: string;
  email: string;
  userRole: string;
  hasLifecycleBot: boolean;
  activeBots?: ActiveBot[];
  tourCompleted?: boolean;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close sidebar on Escape
  useEffect(() => {
    if (!sidebarOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSidebarOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  // Trap focus inside drawer when open on mobile
  useEffect(() => {
    if (sidebarOpen && drawerRef.current) {
      drawerRef.current.focus();
    }
  }, [sidebarOpen]);

  return (
    <>
    <GuidedTour initialCompleted={tourCompleted} />
    <div className="flex h-screen bg-[#f3fdf5] overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — fixed overlay on mobile, static on lg+ */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        aria-label="Navigation drawer"
        className={`
          fixed lg:relative inset-y-0 left-0 z-50
          transform transition-transform duration-200 ease-in-out
          lg:translate-x-0 lg:transform-none
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          focus:outline-none
        `}
      >
        <DashboardNav
          tenantName={tenantName}
          userRole={userRole}
          hasLifecycleBot={hasLifecycleBot}
          onLinkClick={() => setSidebarOpen(false)}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Topbar
          email={email}
          tenantName={tenantName}
          onMenuClick={() => setSidebarOpen(true)}
          activeBots={activeBots}
        />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
    </>
  );
}
