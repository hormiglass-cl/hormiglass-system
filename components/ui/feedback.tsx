'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { Button, Dialog } from './crm';

/* Reemplazos de window.confirm() y window.alert() (alerts.md: alertas solo para lo
   destructivo e irreversible; el resto se comunica dentro de la interfaz). */

type ConfirmOptions = {
  title: string;
  message?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ToastTone = 'success' | 'danger' | 'info' | 'warning';
type ToastOptions = {
  message: React.ReactNode;
  tone?: ToastTone;
  action?: { label: string; onClick: () => void };
  duration?: number;
};

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);
const ToastContext = createContext<((options: ToastOptions | string) => void) | null>(null);

/** const confirm = useConfirm(); if (await confirm({ title, confirmLabel: 'Eliminar', destructive: true })) … */
export function useConfirm() {
  const value = useContext(ConfirmContext);
  if (!value) throw new Error('useConfirm requiere <FeedbackProvider>');
  return value;
}

/** const toast = useToast(); toast({ message: 'Abono registrado', tone: 'success', action: { label: 'Deshacer', onClick } }) */
export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast requiere <FeedbackProvider>');
  return value;
}

const toastIcon: Record<ToastTone, typeof Info> = { success: CheckCircle2, danger: XCircle, info: Info, warning: AlertTriangle };
const toastIconClass: Record<ToastTone, string> = { success: 'text-success', danger: 'text-danger', info: 'text-info', warning: 'text-warning' };

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const [toasts, setToasts] = useState<(ToastOptions & { id: number })[]>([]);
  const nextId = useRef(0);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setPending({ ...options, resolve });
  }), []);

  const settle = useCallback((ok: boolean) => {
    setPending((current) => { current?.resolve(ok); return null; });
  }, []);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((toast) => toast.id !== id)), []);

  const toast = useCallback((options: ToastOptions | string) => {
    const id = ++nextId.current;
    setToasts((list) => [...list.slice(-2), { ...(typeof options === 'string' ? { message: options } : options), id }]);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      <ToastContext.Provider value={toast}>
        {children}
        <Dialog
          open={!!pending}
          size="sm"
          title={pending?.title ?? ''}
          onClose={() => settle(false)}
          footer={<>
            {/* En acciones destructivas el foco inicial va a Cancelar. */}
            <Button variant="secondary" onClick={() => settle(false)} data-autofocus={pending?.destructive ? '' : undefined}>
              {pending?.cancelLabel ?? 'Cancelar'}
            </Button>
            <Button variant={pending?.destructive ? 'destructive' : 'primary'} onClick={() => settle(true)} data-autofocus={pending?.destructive ? undefined : ''}>
              {pending?.confirmLabel}
            </Button>
          </>}
        >
          {pending?.message && <div className="t-body text-ink-muted">{pending.message}</div>}
        </Dialog>
        <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
          {toasts.map((item) => <ToastItem key={item.id} {...item} onDismiss={() => dismiss(item.id)} />)}
        </div>
      </ToastContext.Provider>
    </ConfirmContext.Provider>
  );
}

function ToastItem({ message, tone = 'success', action, duration = 5000, onDismiss }: ToastOptions & { onDismiss: () => void }) {
  const Icon = toastIcon[tone];
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, action ? Math.max(duration, 8000) : duration);
    return () => window.clearTimeout(timer);
  }, [action, duration, onDismiss]);

  return (
    <div className="pointer-events-auto flex items-start gap-2.5 rounded-panel border border-line bg-surface px-3.5 py-3 text-sm text-ink shadow-[var(--hg-shadow-popover)]">
      <Icon size={18} aria-hidden className={clsx('mt-px shrink-0', toastIconClass[tone])} />
      <div className="min-w-0 flex-1">{message}</div>
      {action && (
        <button type="button" onClick={() => { action.onClick(); onDismiss(); }} className="shrink-0 font-semibold text-accent-ink hover:underline">
          {action.label}
        </button>
      )}
      <button type="button" onClick={onDismiss} aria-label="Cerrar aviso" className="-mr-1 shrink-0 rounded p-0.5 text-ink-muted hover:text-ink">
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
