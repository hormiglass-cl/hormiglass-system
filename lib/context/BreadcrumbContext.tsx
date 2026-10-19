'use client';

import React, { createContext, useContext, useState, type ReactNode } from 'react';

interface BreadcrumbContextType {
  customTitle: string | null;
  setCustomTitle: (title: string | null) => void;
  onBack: (() => void) | null;
  setOnBack: (fn: (() => void) | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextType>({
  customTitle: null,
  setCustomTitle: () => {},
  onBack: null,
  setOnBack: () => {},
});

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [onBack, setOnBack] = useState<(() => void) | null>(null);

  return (
    <BreadcrumbContext.Provider value={{ customTitle, setCustomTitle, onBack, setOnBack }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumb() {
  return useContext(BreadcrumbContext);
}
