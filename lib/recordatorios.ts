import type { SupabaseClient } from '@supabase/supabase-js';
import type { Recordatorio, RecurrenciaRecordatorio } from './types';

function toISODate(date: Date) {
  return date.toISOString().split('T')[0];
}

function parseDateOnly(fechaISO: string) {
  const [year, month, day] = fechaISO.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function lastDayOfMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function computeNextFechaVencimiento(
  fechaActualISO: string,
  recurrencia: RecurrenciaRecordatorio,
  diaMes?: number | null,
  diaSemana?: number | null
) {
  const current = parseDateOnly(fechaActualISO);

  if (recurrencia === 'diaria') {
    current.setUTCDate(current.getUTCDate() + 1);
    return toISODate(current);
  }

  if (recurrencia === 'semanal') {
    const next = new Date(current);
    next.setUTCDate(next.getUTCDate() + 7);

    if (typeof diaSemana === 'number') {
      const delta = (diaSemana - next.getUTCDay() + 7) % 7;
      next.setUTCDate(next.getUTCDate() + delta);
    }

    return toISODate(next);
  }

  if (recurrencia === 'mensual') {
    const targetDay = Math.max(1, Math.min(31, diaMes || current.getUTCDate()));
    const nextYear = current.getUTCFullYear() + (current.getUTCMonth() === 11 ? 1 : 0);
    const nextMonth = (current.getUTCMonth() + 1) % 12;
    const safeDay = Math.min(targetDay, lastDayOfMonth(nextYear, nextMonth));
    return toISODate(new Date(Date.UTC(nextYear, nextMonth, safeDay)));
  }

  return fechaActualISO;
}

export async function completeRecordatorio(
  supabase: SupabaseClient,
  recordatorio: Recordatorio
) {
  const now = new Date().toISOString();
  const vecesCompletado = Number(recordatorio.veces_completado || 0) + 1;

  if (recordatorio.recurrencia === 'ninguna') {
    return supabase
      .from('recordatorios')
      .update({
        estado: 'completada',
        completado: true,
        completado_en: now,
        ultimo_completado_en: now,
        veces_completado: vecesCompletado,
      })
      .eq('id', recordatorio.id)
      .select()
      .single();
  }

  const nextFecha = computeNextFechaVencimiento(
    recordatorio.fecha_vencimiento,
    recordatorio.recurrencia,
    recordatorio.recurrencia_dia_mes,
    recordatorio.recurrencia_dia_semana
  );

  return supabase
    .from('recordatorios')
    .update({
      fecha_vencimiento: nextFecha,
      estado: 'por_hacer',
      completado: false,
      completado_en: null,
      ultimo_completado_en: now,
      veces_completado: vecesCompletado,
    })
    .eq('id', recordatorio.id)
    .select()
    .single();
}
