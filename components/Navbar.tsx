'use client';

import React from 'react';
import { usePathname } from 'next/navigation';

export function Navbar() {
  const pathname = usePathname();

  if (pathname === '/login') return null;

  return (
    <header className="bg-[#213343] h-[72px] shrink-0 border-b border-[#162635] z-20" />
  );
}
