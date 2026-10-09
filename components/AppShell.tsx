'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  if (pathname === '/login' || pathname.startsWith('/auth')) return <main>{children}</main>;

  return <div className="flex min-h-screen bg-app">
    <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
    <div className="flex min-h-screen min-w-0 flex-1 flex-col">
      <Navbar onMenuClick={() => setMobileOpen(true)} />
      <main className="hg-app-main w-full flex-1 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1800px]">{children}</div>
      </main>
    </div>
  </div>;
}
