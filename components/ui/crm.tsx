'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Info,
  MoreHorizontal, Search, X, XCircle,
} from 'lucide-react';

/* Componentes base del CRM sobre los tokens de app/globals.css (plans/plan-rediseno-hig.md).
   Reglas: sin hex sueltos, sin paleta Tailwind cruda, texto ≥ 11 px, pesos 400–700. */

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-ink-muted border-line',
  success: 'bg-success-soft text-success border-success-line',
  warning: 'bg-warning-soft text-warning border-warning-line',
  danger: 'bg-danger-soft text-danger border-danger-line',
  info: 'bg-info-soft text-info border-info-line',
  accent: 'bg-accent-soft text-accent-ink border-accent-line',
};

const toneIcons: Partial<Record<Tone, typeof Info>> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
};

/* ─── Botones ─────────────────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'destructive';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent border-accent hover:bg-accent-hover hover:border-accent-hover',
  secondary: 'bg-surface text-ink border-line hover:bg-surface-muted',
  subtle: 'bg-transparent text-ink-muted border-transparent hover:bg-surface-muted hover:text-ink',
  destructive: 'bg-surface text-danger border-danger-line hover:bg-danger-soft',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className,
  children,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: typeof Info;
}) {
  return (
    <button
      type={type}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-control border font-semibold transition-colors whitespace-nowrap',
        size === 'sm' ? 'min-h-8 px-2.5 text-[13px]' : 'min-h-9 px-3.5 text-sm',
        buttonVariants[variant],
        className,
      )}
      {...props}
    >
      {Icon && <Icon size={size === 'sm' ? 15 : 16} aria-hidden />}
      {children}
    </button>
  );
}

/** Botón solo-ícono: la etiqueta es obligatoria (lectores de pantalla y tooltip). */
export function IconButton({
  icon: Icon,
  label,
  className,
  type = 'button',
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & { icon: typeof Info; label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={clsx('inline-grid h-9 w-9 place-items-center rounded-control text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink', className)}
      {...props}
    >
      <Icon size={18} aria-hidden />
    </button>
  );
}

/* ─── Estructura de página ────────────────────────────────────────────── */

/** Un título por pantalla, acciones a la derecha, como máximo un botón primario. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="t-page truncate">{title}</h1>
        {description && <p className="t-caption mt-1 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ title, actions, children, className }: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx('hg-panel', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-4 py-3">
          {title && <h2 className="t-section">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="hg-list-toolbar">{children}</div>;
}

/**
 * Resumen accionable en una línea: reemplaza las filas de tarjetas KPI de colores.
 * Cada ítem con onClick se comporta como filtro.
 */
export function SummaryLine({
  items,
}: {
  items: { label: string; value: React.ReactNode; tone?: Tone; active?: boolean; onClick?: () => void }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
      {items.map((item, index) => {
        const Icon = item.tone ? toneIcons[item.tone] : undefined;
        const content = (
          <>
            {Icon && <Icon size={15} aria-hidden className={toneTextClass(item.tone)} />}
            <span className="t-num font-semibold text-ink">{item.value}</span>
            <span className="text-ink-muted">{item.label}</span>
          </>
        );
        return (
          <React.Fragment key={item.label}>
            {index > 0 && <span aria-hidden className="px-1 text-line">·</span>}
            {item.onClick ? (
              <button
                type="button"
                onClick={item.onClick}
                aria-pressed={item.active}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-control px-2 py-1 transition-colors hover:bg-surface-muted',
                  item.active && 'bg-accent-soft ring-1 ring-accent-line',
                )}
              >
                {content}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-1">{content}</span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function toneTextClass(tone?: Tone) {
  return tone === 'success' ? 'text-success'
    : tone === 'warning' ? 'text-warning'
    : tone === 'danger' ? 'text-danger'
    : tone === 'info' ? 'text-info'
    : tone === 'accent' ? 'text-accent-ink'
    : 'text-ink-muted';
}

export function DataTable({ columns, children }: { columns: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="hg-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="hg-table">
          <thead>{columns}</thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function RecordLayout({ sidebar, children, aside }: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
      <aside className="xl:col-span-3">{sidebar}</aside>
      <main className={aside ? 'min-w-0 xl:col-span-6' : 'min-w-0 xl:col-span-9'}>{children}</main>
      {aside && <aside className="xl:col-span-3">{aside}</aside>}
    </div>
  );
}

export function PropertyPanel({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="hg-panel p-4">
      <h2 className="t-caption mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function ActivityTimeline({ children }: { children: React.ReactNode }) {
  return <div className="hg-panel divide-y divide-line-subtle">{children}</div>;
}

/* ─── Estado e identidad ──────────────────────────────────────────────── */

/** Estado con ícono además de color (nunca solo color). */
export function StatusBadge({ children, tone = 'neutral', icon = true }: {
  children: React.ReactNode;
  tone?: Tone;
  icon?: boolean;
}) {
  const Icon = icon ? toneIcons[tone] : undefined;
  return (
    <span className={clsx('t-micro inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5', toneClasses[tone])}>
      {Icon && <Icon size={12} aria-hidden />}
      {children}
    </span>
  );
}

/** Folio o código estampado (OP-, OC-, PV-, NV-, SKU). Nunca para fechas. */
export function CodeStamp({ children, title }: { children: React.ReactNode; title?: string }) {
  return <span className="code-stamp" title={title}>{children}</span>;
}

export const ETAPAS_OBRA = [
  { id: 'cotizacion', label: 'Cotización' },
  { id: 'venta', label: 'Venta' },
  { id: 'abastecimiento', label: 'Abastecimiento' },
  { id: 'despacho', label: 'Despacho' },
  { id: 'instalacion', label: 'Instalación' },
  { id: 'postventa', label: 'Postventa' },
] as const;

/**
 * Riel de obra (firma visual): bloques como un pallet que muestran la etapa actual.
 * `current` es el índice de la etapa en curso; las anteriores quedan completas.
 */
export function StageRail({
  current,
  stages = ETAPAS_OBRA,
  size = 'lg',
}: {
  current: number;
  stages?: readonly { id: string; label: string }[];
  size?: 'lg' | 'mini';
}) {
  const summary = `Etapa ${Math.min(current + 1, stages.length)} de ${stages.length}: ${stages[current]?.label ?? 'Completada'}`;

  if (size === 'mini') {
    return (
      <div role="img" aria-label={summary} title={summary} className="flex w-full max-w-36 gap-0.5">
        {stages.map((stage, index) => (
          <span
            key={stage.id}
            className={clsx(
              'h-1.5 flex-1 rounded-[2px]',
              index < current ? 'bg-accent' : index === current ? 'bg-accent-line' : 'bg-surface-muted',
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <ol aria-label="Etapa de la obra" className="flex w-full gap-1">
      {stages.map((stage, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'pending';
        return (
          <li key={stage.id} className="min-w-0 flex-1" aria-current={state === 'current' ? 'step' : undefined}>
            <span
              className={clsx(
                'block h-2.5 rounded-[3px] transition-colors duration-200',
                state === 'done' && 'bg-accent',
                state === 'current' && 'bg-accent-soft ring-2 ring-inset ring-accent',
                state === 'pending' && 'bg-surface-muted',
              )}
            />
            <span className={clsx(
              't-micro mt-1.5 flex items-center gap-1 truncate',
              state === 'pending' ? 'font-medium text-ink-muted' : 'text-ink',
            )}>
              {state === 'done' && <Check size={11} aria-hidden className="shrink-0 text-accent-ink" />}
              {stage.label}
              <span className="sr-only">{state === 'done' ? ' (completada)' : state === 'current' ? ' (en curso)' : ' (pendiente)'}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Tabs({ items, active, onChange, label = 'Secciones' }: {
  items: { id: string; label: React.ReactNode; count?: number }[];
  active: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap items-center gap-1 border-b border-line">
      {items.map((item) => {
        const selected = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            className={clsx(
              '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors',
              selected ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {item.label}
            {item.count !== undefined && <span className="hg-list-count">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Formularios ─────────────────────────────────────────────────────── */

/** Etiqueta + control + ayuda o error. El control recibe el id por render-prop. */
export function Field({ label, hint, error, required, children }: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => React.ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-semibold text-ink">
        {label}{required && <span className="text-danger" aria-hidden> *</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error ? (
        <p id={`${id}-error`} className="t-caption flex items-center gap-1 text-danger"><XCircle size={13} aria-hidden />{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="t-caption">{hint}</p>
      ) : null}
    </div>
  );
}

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...props }, ref) {
    return <input ref={ref} className={clsx('hg-field', className)} {...props} />;
  },
);

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={clsx('relative', className)}>
      <select className="hg-field appearance-none pr-9" {...props}>{children}</select>
      <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
    </div>
  );
}

/** Filtro con etiqueta propia (no "Origen: Todos" dentro del valor). */
export function FilterSelect({ label, className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <label htmlFor={id} className="t-caption whitespace-nowrap">{label}</label>
      <Select id={id} {...props}>{children}</Select>
    </div>
  );
}

export function SearchField({ className, label = 'Buscar', ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <div className={clsx('relative min-w-[220px] flex-1', className)}>
      <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
      <input type="search" aria-label={label} className="hg-field pl-9" {...props} />
    </div>
  );
}

/* ─── Diálogos ────────────────────────────────────────────────────────── */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Escape cierra, Tab queda dentro, el foco vuelve al disparador y el fondo no se desplaza. */
function useDialogBehavior(open: boolean, onClose: () => void, ref: React.RefObject<HTMLElement | null>) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>('[data-autofocus]') ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.stopPropagation(); onCloseRef.current(); return; }
      if (event.key !== 'Tab' || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const [head, tail] = [items[0], items[items.length - 1]];
      if (event.shiftKey && document.activeElement === head) { event.preventDefault(); tail.focus(); }
      else if (!event.shiftKey && document.activeElement === tail) { event.preventDefault(); head.focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = overflow;
      trigger?.focus?.();
    };
  }, [open, ref]);
}

/** Diálogo centrado para una tarea corta. El título nombra la tarea. */
export function Dialog({ open, title, description, children, footer, onClose, size = 'md' }: {
  open: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useDialogBehavior(open, onClose, ref);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={clsx(
          'flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-[var(--hg-shadow-popover)] outline-none',
          size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : 'max-w-lg',
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line-subtle px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="t-section">{title}</h2>
            {description && <p id={descriptionId} className="t-caption mt-1">{description}</p>}
          </div>
          <IconButton icon={X} label="Cerrar" onClick={onClose} className="-mr-2 -mt-1" />
        </header>
        {children && <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>}
        {footer && <footer className="flex justify-end gap-2 border-t border-line-subtle bg-app px-5 py-3">{footer}</footer>}
      </section>
    </div>
  );
}

/** Hoja lateral para ver o editar un registro sin perder la lista de fondo. */
export function Sheet({ open, title, children, footer, onClose, width = 'md' }: {
  open: boolean;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  width?: 'md' | 'lg';
}) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  useDialogBehavior(open, onClose, ref);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-ink/30" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx(
          'absolute right-0 top-0 flex h-full w-full flex-col border-l border-line bg-surface shadow-[var(--hg-shadow-popover)] outline-none',
          width === 'lg' ? 'max-w-3xl' : 'max-w-xl',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line-subtle px-5 py-4">
          <h2 id={titleId} className="t-section truncate">{title}</h2>
          <IconButton icon={X} label="Cerrar" onClick={onClose} className="-mr-2" />
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line-subtle bg-app px-5 py-3">{footer}</footer>}
      </aside>
    </div>
  );
}

/** @deprecated usar Sheet */
export const Drawer = Sheet;
/** @deprecated usar Dialog */
export const Modal = Dialog;

/* ─── Estados vacíos, menús y paginación ──────────────────────────────── */

/** Pantalla vacía con siguiente paso claro. */
export function EmptyState({ icon: Icon, title, description, action }: {
  icon?: typeof Info;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {Icon && <span className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-surface-muted text-ink-muted"><Icon size={20} aria-hidden /></span>}
      <p className="t-section">{title}</p>
      {description && <p className="t-caption mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ActionMenu({ label = 'Más acciones', children }: { label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <IconButton icon={MoreHorizontal} label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} />
      {open && (
        <div role="menu" onClick={() => setOpen(false)} className="absolute right-0 top-full z-20 mt-1 min-w-48 rounded-panel border border-line bg-surface p-1 shadow-[var(--hg-shadow-popover)]">
          {children}
        </div>
      )}
    </div>
  );
}

export function ActionMenuItem({ icon: Icon, destructive, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: typeof Info;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={clsx(
        'flex w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm hover:bg-surface-muted',
        destructive ? 'text-danger' : 'text-ink',
      )}
      {...props}
    >
      {Icon && <Icon size={16} aria-hidden />}
      {children}
    </button>
  );
}

export function Pagination({ currentPage, totalItems, itemsPerPage, onPageChange, onItemsPerPageChange }: {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (items: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const selectId = useId();
  if (totalItems === 0) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1);

  return (
    <nav aria-label="Paginación" className="flex flex-col items-center justify-between gap-3 border-t border-line-subtle px-4 py-3 text-[13px] text-ink-muted sm:flex-row">
      <div className="flex items-center gap-2">
        <label htmlFor={selectId}>Filas por página</label>
        <select
          id={selectId}
          value={itemsPerPage}
          onChange={(event) => { onItemsPerPageChange(Number(event.target.value)); onPageChange(1); }}
          className="hg-field min-h-8 w-auto py-1"
        >
          {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <span className="t-num">
          {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, totalItems)} de {totalItems}
        </span>
        <div className="flex items-center gap-0.5">
          <IconButton icon={ChevronLeft} label="Página anterior" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className="h-8 w-8" />
          {pages.map((page, index) => (
            <React.Fragment key={page}>
              {index > 0 && page - pages[index - 1] > 1 && <span aria-hidden className="px-1">…</span>}
              <button
                type="button"
                onClick={() => onPageChange(page)}
                aria-current={currentPage === page ? 'page' : undefined}
                className={clsx(
                  't-num grid h-8 min-w-8 place-items-center rounded-control px-2 font-semibold transition-colors',
                  currentPage === page ? 'bg-surface-muted text-ink ring-1 ring-line' : 'hover:bg-surface-muted hover:text-ink',
                )}
              >
                {page}
              </button>
            </React.Fragment>
          ))}
          <IconButton icon={ChevronRight} label="Página siguiente" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className="h-8 w-8" />
        </div>
      </div>
    </nav>
  );
}
