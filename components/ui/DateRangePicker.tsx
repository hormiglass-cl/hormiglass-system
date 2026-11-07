'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

/* Selector de rango con dos calendarios: el izquierdo fija el inicio y el derecho el fin.
   Al pulsar el mes o el año se abre un selector para saltar rápido. Valores YYYY-MM-DD ('' = sin límite). */

const pad = (n: number) => String(n).padStart(2, '0');
export const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const firstOfMonth = (k: string) => {
  const base = k ? fromKey(k) : new Date();
  return new Date(base.getFullYear(), base.getMonth(), 1);
};

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function buildGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // semana desde el lunes
  return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + i));
}

type Mode = 'days' | 'months' | 'years';

export function CalendarPane({
  title,
  view,
  onView,
  value,
  rangeFrom,
  rangeTo,
  min,
  max,
  onPick,
}: {
  title?: string;
  view: Date;
  onView: (d: Date) => void;
  value: string;
  rangeFrom?: string;
  rangeTo?: string;
  min?: string;
  max?: string;
  onPick: (key: string) => void;
}) {
  const [mode, setMode] = useState<Mode>('days');
  const [yearPage, setYearPage] = useState(() => Math.floor(view.getFullYear() / 12) * 12);
  const todayKey = toKey(new Date());
  const year = view.getFullYear();
  const month = view.getMonth();

  const shift = (delta: number) => onView(new Date(year, month + delta, 1));

  const navBtn = 'grid h-8 w-8 cursor-pointer place-items-center rounded-full text-ink-muted transition hover:bg-surface-muted hover:text-ink';
  const headBtn = 'cursor-pointer rounded-lg px-2 py-1 text-sm font-semibold text-ink transition hover:bg-surface-muted';

  return (
    <div className="min-w-0 flex-1">
      {title && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>}

      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label={mode === 'years' ? 'Años anteriores' : mode === 'months' ? 'Año anterior' : 'Mes anterior'}
          onClick={() => (mode === 'years' ? setYearPage((p) => p - 12) : mode === 'months' ? onView(new Date(year - 1, month, 1)) : shift(-1))}
          className={navBtn}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <div className="flex items-center">
          {mode !== 'years' && (
            <button type="button" className={headBtn} aria-label="Elegir mes" onClick={() => setMode(mode === 'months' ? 'days' : 'months')}>
              {MONTHS[month]}
            </button>
          )}
          <button
            type="button"
            className={headBtn}
            aria-label="Elegir año"
            onClick={() => { setYearPage(Math.floor(year / 12) * 12); setMode(mode === 'years' ? 'days' : 'years'); }}
          >
            {mode === 'years' ? `${yearPage} – ${yearPage + 11}` : year}
          </button>
        </div>
        <button
          type="button"
          aria-label={mode === 'years' ? 'Años siguientes' : mode === 'months' ? 'Año siguiente' : 'Mes siguiente'}
          onClick={() => (mode === 'years' ? setYearPage((p) => p + 12) : mode === 'months' ? onView(new Date(year + 1, month, 1)) : shift(1))}
          className={navBtn}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {mode === 'months' && (
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {MONTHS.map((name, i) => (
            <button
              key={name}
              type="button"
              onClick={() => { onView(new Date(year, i, 1)); setMode('days'); }}
              className={clsx(
                'h-11 cursor-pointer rounded-xl text-sm font-medium transition',
                i === month ? 'bg-accent font-bold text-on-accent' : 'text-ink hover:bg-surface-muted',
              )}
            >
              {name.slice(0, 3)}
            </button>
          ))}
        </div>
      )}

      {mode === 'years' && (
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {Array.from({ length: 12 }, (_, i) => yearPage + i).map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => { onView(new Date(y, month, 1)); setMode('months'); }}
              className={clsx(
                't-num h-11 cursor-pointer rounded-xl text-sm font-medium transition',
                y === year ? 'bg-accent font-bold text-on-accent' : 'text-ink hover:bg-surface-muted',
              )}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      {mode === 'days' && (
        <>
          <div className="mt-2 grid grid-cols-7 text-center text-[11px] font-semibold text-ink-muted">
            {WEEKDAYS.map((d, i) => <span key={i} className="py-1">{d}</span>)}
          </div>
          <div className="grid grid-cols-7">
            {buildGrid(view).map((day) => {
              const key = toKey(day);
              const inMonth = day.getMonth() === month;
              const selected = key === value;
              const inRange = Boolean(rangeFrom && rangeTo && key > rangeFrom && key < rangeTo);
              const disabled = Boolean((min && key < min) || (max && key > max));
              return (
                <div key={key} className={clsx('p-px', inRange && 'bg-accent-soft')}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(key)}
                    aria-label={day.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    aria-pressed={selected}
                    className={clsx(
                      't-num grid h-9 w-full place-items-center rounded-full text-sm transition',
                      selected ? 'cursor-pointer bg-accent font-bold text-on-accent' : disabled ? 'cursor-not-allowed text-ink-muted opacity-30' : 'cursor-pointer hover:bg-surface-muted',
                      !selected && !disabled && (inMonth ? 'text-ink' : 'text-ink-muted opacity-40'),
                      key === todayKey && !selected && 'ring-1 ring-accent-line',
                    )}
                  >
                    {day.getDate()}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  placeholder?: string;
  className?: string;
}

export function DateRangePicker({ from, to, onChange, placeholder = 'Todo el período', className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [viewFrom, setViewFrom] = useState(() => firstOfMonth(from));
  const [viewTo, setViewTo] = useState(() => firstOfMonth(to));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function toggle() {
    if (!open) {
      setDraftFrom(from);
      setDraftTo(to);
      setViewFrom(firstOfMonth(from));
      setViewTo(firstOfMonth(to));
    }
    setOpen((v) => !v);
  }

  const fmt = (k: string, withYear = false) =>
    fromKey(k).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }).replace('.', '');

  const label = from && to
    ? from === to ? fmt(from, true) : `${fmt(from, from.slice(0, 4) !== to.slice(0, 4))} – ${fmt(to, true)}`
    : from ? `Desde ${fmt(from, true)}`
    : to ? `Hasta ${fmt(to, true)}`
    : placeholder;
  const hasValue = Boolean(from || to);

  function apply(f: string, t: string) {
    onChange(f, t);
    setOpen(false);
  }

  return (
    <div ref={ref} className={clsx('relative inline-flex', className)}>
      <div className="inline-flex h-11 items-center rounded-full border border-line bg-surface transition hover:border-accent">
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={clsx('inline-flex h-full cursor-pointer items-center gap-2.5 rounded-full pl-4 text-xs font-semibold text-ink sm:pl-5 sm:text-sm', hasValue ? 'pr-2' : 'pr-4 sm:pr-5')}
        >
          <Calendar className="h-4 w-4 shrink-0 text-accent-ink" aria-hidden />
          <span className={clsx('whitespace-nowrap', !hasValue && 'text-ink-muted')}>{label}</span>
        </button>
        {hasValue && (
          <button
            type="button"
            onClick={() => apply('', '')}
            aria-label="Quitar filtro de fechas"
            title="Quitar filtro de fechas"
            className="mr-2 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full text-ink-muted transition hover:bg-surface-muted hover:text-danger"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-label="Seleccionar rango de fechas"
          className="absolute right-0 top-full z-50 mt-2 w-[min(94vw,660px)] rounded-[20px] border border-line bg-surface p-5 shadow-[var(--hg-shadow-popover)]"
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
            <CalendarPane
              title="Inicio"
              view={viewFrom}
              onView={setViewFrom}
              value={draftFrom}
              rangeFrom={draftFrom}
              rangeTo={draftTo}
              max={draftTo || undefined}
              onPick={(k) => setDraftFrom(k === draftFrom ? '' : k)}
            />
            <div className="hidden w-px bg-line-subtle sm:block" aria-hidden />
            <CalendarPane
              title="Fin"
              view={viewTo}
              onView={setViewTo}
              value={draftTo}
              rangeFrom={draftFrom}
              rangeTo={draftTo}
              min={draftFrom || undefined}
              onPick={(k) => setDraftTo(k === draftTo ? '' : k)}
            />
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-line-subtle pt-4">
            <button
              type="button"
              onClick={() => { setDraftFrom(''); setDraftTo(''); }}
              className="cursor-pointer text-sm font-semibold text-ink-muted transition hover:text-danger"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={() => apply(draftFrom, draftTo)}
              className="h-10 cursor-pointer rounded-full bg-accent px-6 text-sm font-semibold text-on-accent transition hover:bg-accent-hover"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
