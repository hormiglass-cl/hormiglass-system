import { createClient } from './supabase/client';

export type TipoAccionLog = 'creacion' | 'actualizacion' | 'eliminacion' | 'comentario' | 'estado_cambiado';

interface LogSistemaParams {
  tipo_accion: TipoAccionLog;
  entidad:
    | 'clientes'
    | 'cotizaciones'
    | 'ordenes_compra'
    | 'oportunidades'
    | 'actividades'
    | 'notificaciones'
    | 'eventos_produccion_logistica'
    | 'administracion_documentos'
    | 'recordatorios'
    | 'usuarios'
    | 'trabajadores'
    | 'cuentas_bancarias'
    | 'empresas'
    | 'caja_movimientos'
    | 'sistema';
  entidad_id?: string;
  descripcion: string;
  usuario_id?: string | null;
  datos_anteriores?: unknown;
  datos_nuevos?: unknown;
}

export async function logSistema({
  tipo_accion,
  entidad,
  entidad_id,
  descripcion,
  usuario_id,
  datos_anteriores,
  datos_nuevos,
}: LogSistemaParams) {
  try {
    const supabase = createClient();
    const isValidUuid = (id?: string | null) =>
      id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    let finalUserId = isValidUuid(usuario_id) ? usuario_id : null;
    if (!finalUserId) {
      const { data: authUser } = await supabase.auth.getUser();
      if (authUser?.user) {
        const { data: usr } = await supabase.from('usuarios').select('id').eq('auth_id', authUser.user.id).maybeSingle();
        if (usr?.id) finalUserId = usr.id;
      }
    }

    await supabase.from('logs_sistema').insert([{
      tipo_accion,
      entidad,
      entidad_id: entidad_id || null,
      descripcion,
      usuario_id: finalUserId,
      datos_anteriores: datos_anteriores ? JSON.parse(JSON.stringify(datos_anteriores)) : null,
      datos_nuevos: datos_nuevos ? JSON.parse(JSON.stringify(datos_nuevos)) : null,
    }]);
  } catch (err) {
    console.error('Error logging to logs_sistema:', err);
  }
}
