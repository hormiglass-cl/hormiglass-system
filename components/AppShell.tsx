'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { CommandPalette } from './CommandPalette';
import { BreadcrumbProvider } from '../lib/context/BreadcrumbContext';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Las pantallas de acceso no usan el marco: así no leen la URL durante el prerender.
  if (pathname === '/login' || pathname.startsWith('/auth')) return <main>{children}</main>;
  return <AppFrame pathname={pathname}>{children}</AppFrame>;
}

function AppFrame({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Atajo ⌘K / Ctrl K: abre el buscador desde cualquier pantalla.
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
  // La barra de progreso se enciende al pulsar un enlace y se apaga sola cuando cambia la ubicación.
  const locationKey = `${pathname}?${searchParams.toString()}`;
  const [navigatingFrom, setNavigatingFrom] = useState<string | null>(null);
  const isNavigating = navigatingFrom === locationKey;

  return (
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
          onNavigate={() => setNavigatingFrom(locationKey)}
          onSearch={() => setPaletteOpen(true)}
        />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Navbar onMenuClick={() => setMobileOpen(true)} />
          <main className="hg-app-main w-full flex-1 px-4 py-5 sm:px-6 lg:px-8">
            <div key={pathname} className="mx-auto max-w-[1800px] hg-page-transition">
              {children}
            </div>
          </main>
        </div>
        {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      </div>
    </BreadcrumbProvider>
  );
}
