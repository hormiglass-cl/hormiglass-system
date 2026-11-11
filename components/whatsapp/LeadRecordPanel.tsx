'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { createClient } from '../../lib/supabase/client';
import { Button } from '../ui/crm';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type LeadCorrection = {
  entity: 'opportunity' | 'customer';
  field: string;
  before: Json;
  after: Json;
  revision: number;
  updated_at: string;
};

export type LeadPanelData = {
  lead_id: string;
  revision: number;
  can_resolve: boolean;
  record: Record<string, Json>;
  corrections: LeadCorrection[];
};

const RECORD_FIELDS: [key: string, label: string][] = [
  ['requirement', 'Requerimiento'],
  ['service', 'Servicio'],
  ['use_case', 'Uso'],
  ['tax_document', 'Documento tributario'],
  ['purchase_order', 'Orden de compra'],
  ['desired_date', 'Fecha deseada'],
  ['source_number', 'Número de origen'],
];
const SITE_FIELDS: [key: string, label: string][] = [
  ['terrain', 'Terreno'],
  ['truck_access', 'Acceso de camión'],
  ['debris_removal', 'Retiro de escombros'],
  ['access_restrictions', 'Restricciones de acceso'],
];
const SUMMARY_FIELDS: [key: string, label: string][] = [
  ['lead_class', 'Clasificación'],
  ['executive_summary', 'Resumen ejecutivo'],
  ['next_best_action', 'Próxima acción sugerida'],
  ['pain', 'Necesidad'],
  ['scope', 'Alcance'],
  ['timing', 'Plazo'],
  ['obstacle', 'Obstáculo'],
];
const CORRECTION_LABELS: Record<string, string> = {
  titulo: 'Título',
  direccion_obra: 'Dirección de obra',
  tipo_venta: 'Tipo de venta',
  modalidad_requerimiento: 'Modalidad',
  forma_entrega: 'Forma de entrega',
  prioridad: 'Prioridad',
  productos: 'Productos',
  tipo_cliente: 'Tipo de cliente',
  apellido_razon_social: 'Razón social',
  rut: 'RUT',
};
const VALUE_LABELS: Record<string, string> = { boleta: 'Boleta', factura: 'Factura' };

function formatValue(value: Json | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (Array.isArray(value)) return value.length ? value.map(formatValue).join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return VALUE_LABELS[String(value)] ?? String(value);
}

function Fields({ title, source, fields }: { title?: string; source: Json | undefined; fields: [string, string][] }) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const rows = fields.filter(([key]) => key in source);
  if (!rows.length) return null;
  return <div className="mt-2">
    {title && <h4 className="text-xs font-semibold text-ink-muted">{title}</h4>}
    <dl className="mt-1 grid grid-cols-1 gap-x-3 gap-y-1 text-xs sm:grid-cols-[max-content_1fr]">
      {rows.map(([key, label]) => <div key={key} className="contents">
        <dt className="text-ink-muted">{label}</dt>
        <dd className="min-w-0 whitespace-pre-wrap break-words">{formatValue(source[key])}</dd>
      </div>)}
    </dl>
  </div>;
}

export function LeadRecordPanel({ panel, busy = false, error, onResolve }: {
  panel: LeadPanelData;
  busy?: boolean;
  error?: string;
  onResolve: (correction: LeadCorrection, accept: boolean) => void;
}) {
  return <section aria-label="Ficha WhatsApp" className="mt-3 rounded-control border border-line bg-surface p-3 text-sm text-ink">
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="font-semibold">Ficha WhatsApp</h3>
      <span className="text-xs text-ink-muted">Revisión {panel.revision}</span>
    </div>
    <Fields source={panel.record} fields={RECORD_FIELDS} />
    <Fields title="Terreno y acceso" source={panel.record.site} fields={SITE_FIELDS} />
    <Fields title="Resumen del asistente" source={panel.record.ai_summary} fields={SUMMARY_FIELDS} />
    <h4 className="mt-3 text-xs font-semibold text-ink-muted">Correcciones del asistente</h4>
    {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    {panel.corrections.length === 0
      ? <p className="mt-1 text-xs text-ink-muted">Sin correcciones pendientes.</p>
      : <ul className="mt-1 space-y-2">
        {panel.corrections.map((correction) => {
          const label = `${CORRECTION_LABELS[correction.field] ?? correction.field}${correction.entity === 'customer' ? ' (cliente)' : ''}`;
          return <li key={`${correction.entity}:${correction.field}`} className="rounded-control border border-line p-2 text-xs">
            <p className="font-semibold">{label}</p>
            <p className="mt-0.5 break-words">
              <span className="text-ink-muted line-through">{formatValue(correction.before)}</span>
              <span aria-hidden="true"> → </span><span className="sr-only"> cambia a </span>
              <span>{formatValue(correction.after)}</span>
            </p>
            {panel.can_resolve && <div className="mt-1.5 flex gap-2">
              <Button size="sm" variant="primary" disabled={busy} aria-label={`Aceptar corrección de ${label}`} onClick={() => onResolve(correction, true)}>Aceptar</Button>
              <Button size="sm" disabled={busy} aria-label={`Descartar corrección de ${label}`} onClick={() => onResolve(correction, false)}>Descartar</Button>
            </div>}
          </li>;
        })}
      </ul>}
  </section>;
}

const RESOLVE_ERRORS: Record<string, string> = {
  correction_changed: 'El asistente envió un valor más reciente. Revisa la corrección actualizada.',
  correction_not_found: 'Esta corrección ya fue resuelta.',
  forbidden: 'No tienes permiso para resolver correcciones.',
};

/** Key by opportunity ID. Renders `fallback` when the opportunity has no WhatsApp lead link. */
export function LeadRecordSection({ supabase, opportunityId, fallback = null, onApplied }: {
  supabase: ReturnType<typeof createClient>;
  opportunityId: string;
  fallback?: ReactNode;
  onApplied?: () => void;
}) {
  const [panel, setPanel] = useState<LeadPanelData | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error: loadError } = await supabase.rpc('whatsapp_lead_panel', { p_opportunity_id: opportunityId });
      if (!active) return;
      if (loadError) { setError('No se pudo cargar la ficha de WhatsApp.'); setPanel(null); return; }
      setPanel((data as LeadPanelData | null) ?? null);
    })();
    return () => { active = false; };
  }, [supabase, opportunityId, reloadKey]);

  const resolve = async (correction: LeadCorrection, accept: boolean) => {
    setBusy(true);
    setError('');
    const { data, error: resolveError } = await supabase.rpc('whatsapp_resolve_correction', {
      p_opportunity_id: opportunityId, p_entity: correction.entity, p_field: correction.field,
      p_expected_after: correction.after, p_accept: accept,
    });
    if (resolveError) {
      setError(RESOLVE_ERRORS[resolveError.message] ?? 'No se pudo resolver la corrección.');
      setReloadKey((key) => key + 1);
    } else {
      setPanel((data as LeadPanelData | null) ?? null);
      if (accept) onApplied?.();
    }
    setBusy(false);
  };

  if (panel === undefined) return null;
  if (panel === null) return error ? <p role="alert" className="mt-3 text-xs text-danger">{error}</p> : <>{fallback}</>;
  return <LeadRecordPanel panel={panel} busy={busy} error={error} onResolve={(c, accept) => void resolve(c, accept)} />;
}
