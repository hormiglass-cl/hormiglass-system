import type { SupabaseClient } from '@supabase/supabase-js';
import type { OportunidadVenta } from './types';

export function seguimientosParaUsuario(
  oportunidades: Pick<OportunidadVenta, 'id' | 'titulo' | 'asignado_a' | 'seguimiento_responsable_id' | 'proxima_accion' | 'proxima_accion_fecha' | 'estado_pipeline'>[],
  userId: string,
  now = new Date(),
) {
  const horizon = now.getTime() + 24 * 60 * 60 * 1000;
  return oportunidades.filter((op) => {
    const due = op.proxima_accion_fecha ? new Date(op.proxima_accion_fecha).getTime() : NaN;
    return (op.seguimiento_responsable_id || op.asignado_a) === userId &&
      !['entregada', 'prod_finalizado', 'rev_entregado'].includes(op.estado_pipeline) &&
      Number.isFinite(due) && due <= horizon;
  });
}

const syncingUsers = new Set<string>();

/** Materializa los seguimientos próximos del usuario al abrir el CRM. */
export async function syncSeguimientoNotificaciones(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  if (syncingUsers.has(userId)) return;
  syncingUsers.add(userId);
  try {
    const [opsResult, noticesResult] = await Promise.all([
      supabase.from('oportunidades')
        .select('id, titulo, estado_pipeline, asignado_a, seguimiento_responsable_id, proxima_accion, proxima_accion_fecha')
        .not('proxima_accion_fecha', 'is', null),
      supabase.from('notificaciones')
        .select('id, mensaje, entidad_relacionada')
        .eq('usuario_id', userId)
        .eq('tipo', 'seguimiento'),
    ]);
    if (opsResult.error || noticesResult.error) return;

  const notices = noticesResult.data || [];
  const candidates = seguimientosParaUsuario((opsResult.data || []) as OportunidadVenta[], userId);

  for (const previous of notices) {
    if (!candidates.some((op) => op.id === previous.entidad_relacionada)) {
      await supabase.from('notificaciones').delete().eq('id', previous.id);
    }
  }

  for (const op of candidates) {
    const due = new Date(op.proxima_accion_fecha!);
    const timing = due.getTime() < Date.now() ? 'vencido' : 'próximo';
    const message = `Seguimiento ${timing}: ${op.titulo}. ${op.proxima_accion || 'Contactar al cliente'} (${due.toLocaleString('es-CL')}).`;
    const previous = notices.find((notice) => notice.entidad_relacionada === op.id);
    if (previous?.mensaje === message) continue;
    if (previous) {
      await supabase.from('notificaciones').update({ mensaje: message, leido: false }).eq('id', previous.id);
    } else {
      await supabase.from('notificaciones').insert({
        usuario_id: userId,
        mensaje: message,
        tipo: 'seguimiento',
        entidad_relacionada: op.id,
        link_url: `/ventas?oportunidad=${op.id}`,
      });
    }
  }
  } finally {
    syncingUsers.delete(userId);
  }
}
