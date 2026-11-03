'use client';

import { useState, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { ConversationProvider } from '../lib/whatsapp/store';
import { BreadcrumbProvider } from '../lib/context/BreadcrumbContext';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    setIsNavigating(false);
  }, [pathname, searchParams]);

  if (pathname === '/login' || pathname.startsWith('/auth')) return <main>{children}</main>;

  return (
    <ConversationProvider>
    <BreadcrumbProvider>
      <div className="flex min-h-screen bg-app">
        {/* Barra de progreso de navegación superior instantánea */}
        {isNavigating && (
          <div
            className="fixed top-0 left-0 right-0 h-[2.5px] z-[9999] bg-accent shadow-[0_0_8px_var(--hg-accent)] animate-pulse"
            role="progressbar"
            aria-label="Cargando página"
          />
        )}
        <Sidebar
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          onNavigate={() => setIsNavigating(true)}
        />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Navbar onMenuClick={() => setMobileOpen(true)} />
          <main className="hg-app-main w-full flex-1 px-4 py-5 sm:px-6 lg:px-8">
            <div key={pathname} className="mx-auto max-w-[1800px] hg-page-transition">
              {children}
            </div>
          </main>
        </div>
      </div>
    </BreadcrumbProvider>
    </ConversationProvider>
  );
}
