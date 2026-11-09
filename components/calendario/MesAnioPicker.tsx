'use client';

import { useState } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { Button, Dialog } from '../ui/crm';
import { Select } from '../ui/FormControls';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Título del período; al presionarlo abre un pop-up para saltar a cualquier mes y año. */
export function MesAnioPicker({
  label,
  value,
  onSelect,
}: {
  label: string;
  value: Date;
  onSelect: (year: number, month: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(value.getFullYear());
  const [month, setMonth] = useState(value.getMonth());
  const currentYear = new Date().getFullYear();
  const first = Math.min(currentYear - 15, year);
  const last = Math.max(currentYear + 10, year);
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);

  const abrir = () => {
    setYear(value.getFullYear());
    setMonth(value.getMonth());
    setOpen(true);
  };
  const ir = (y: number, m: number) => {
    onSelect(y, m);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={abrir}
        className="flex min-w-44 items-center justify-center gap-1.5 rounded-lg px-2 py-1 transition hover:bg-surface-muted"
      >
        <h1 className="m-0 text-lg font-semibold capitalize text-ink">{label}</h1>
        <ChevronDown size={16} aria-hidden className="text-ink-muted" />
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Ir a otro mes"
        description="Elige el mes y el año que quieres ver."
        size="sm"
        footer={
          <>
            <Button
              variant="subtle"
              icon={CalendarDays}
              onClick={() => {
                const now = new Date();
                ir(now.getFullYear(), now.getMonth());
              }}
            >
              Mes actual
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => ir(year, month)}>
              Ir
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">Mes</label>
            <Select aria-label="Mes" value={String(month)} onChange={(e) => setMonth(Number(e.target.value))} className="hg-field">
              {MESES.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">Año</label>
            <Select aria-label="Año" value={String(year)} onChange={(e) => setYear(Number(e.target.value))} className="hg-field">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Dialog>
    </>
  );
}
