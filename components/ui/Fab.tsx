'use client';

import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import { useMounted } from './useMounted';

/**
 * Botón flotante de acción principal, siempre visible en la esquina inferior derecha de la ventana.
 * Se dibuja en el body para que ningún contenedor de la página lo desplace.
 */
export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  const mounted = useMounted();
  if (!mounted) return null;
  return createPortal(
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="fixed bottom-6 right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-accent text-on-accent shadow-[var(--hg-shadow-popover)] transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
    >
      <Plus size={26} aria-hidden />
    </button>,
    document.body,
  );
}
