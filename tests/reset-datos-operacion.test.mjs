import test from 'node:test';
import assert from 'node:assert/strict';

const PHRASE_CONFIRMACION_REQUERIDA = 'BORRAR OPERACION HORMIGLASS';

const TABLAS_OPERATIVAS_RESET = [
  'cobro_aviso_ciclos',
  'operacion_excepciones',
  'postventa_evidencias',
  'postventa_costos',
  'postventa_casos',
  'evento_reprogramaciones',
  'eventos_produccion_logistica',
  'proyectos_planificacion',
  'produccion_diaria',
  'orden_produccion_items',
  'ordenes_produccion',
  'ordenes_reventa',
  'pedidos_proveedor',
  'guia_despacho_documentos',
  'guia_despacho_items',
  'guias_despacho',
  'orden_compra_asignaciones',
  'orden_compra_items',
  'ordenes_compra',
  'abonos',
  'caja_movimientos',
  'recordatorio_actividades',
  'recordatorios',
  'notas_actividad',
  'actividades_op',
  'visitas_terreno',
  'notificaciones',
  'cotizacion_items',
  'cotizaciones',
  'oportunidad_antecedentes',
  'oportunidades',
  'ventas',
  'clientes',
];

const TABLAS_CATALOGO_PROTEGIDAS = [
  'catalogo_productos',
  'usuarios',
  'empresas',
  'cuentas_bancarias',
  'caja_categorias',
  'caja_subcategorias',
  'trabajadores',
  'trabajador_asistencia',
  'trabajador_documentos',
  'trabajador_liquidaciones_sueldos',
  'trabajador_notas',
  'trabajador_permisos_ausencias',
  'campos_personalizados',
  'logs_sistema',
];

function validarSolicitudReset({ rol, confirmacion, dryRun }) {
  if (rol !== 'admin') {
    return { valido: false, error: 'Acceso denegado: Solo administradores pueden ejecutar el reset de operaciones.' };
  }
  if (dryRun) {
    return { valido: true, accion: 'simulacion' };
  }
  if ((confirmacion || '').trim() !== PHRASE_CONFIRMACION_REQUERIDA) {
    return { valido: false, error: 'Frase de confirmación inválida. Para proceder debe ingresar exactamente: BORRAR OPERACION HORMIGLASS' };
  }
  return { valido: true, accion: 'ejecucion' };
}

test('rechaza ejecucion si el rol no es admin', () => {
  const res = validarSolicitudReset({ rol: 'vendedor', confirmacion: PHRASE_CONFIRMACION_REQUERIDA, dryRun: false });
  assert.equal(res.valido, false);
  assert.match(res.error, /Solo administradores/);
});

test('permite simulacion en modo dry run sin frase de confirmacion para admin', () => {
  const res = validarSolicitudReset({ rol: 'admin', confirmacion: '', dryRun: true });
  assert.equal(res.valido, true);
  assert.equal(res.accion, 'simulacion');
});

test('rechaza ejecucion real si la frase de confirmacion es incorrecta', () => {
  const res = validarSolicitudReset({ rol: 'admin', confirmacion: 'borrar todo', dryRun: false });
  assert.equal(res.valido, false);
  assert.match(res.error, /BORRAR OPERACION HORMIGLASS/);
});

test('acepta ejecucion real con rol admin y frase exacta', () => {
  const res = validarSolicitudReset({ rol: 'admin', confirmacion: 'BORRAR OPERACION HORMIGLASS', dryRun: false });
  assert.equal(res.valido, true);
  assert.equal(res.accion, 'ejecucion');
});

test('garantiza que ninguna tabla de catálogo maestro esté en la lista de borrado', () => {
  for (const tablaProtegida of TABLAS_CATALOGO_PROTEGIDAS) {
    assert.equal(
      TABLAS_OPERATIVAS_RESET.includes(tablaProtegida),
      false,
      `La tabla protegida "${tablaProtegida}" no debe estar en la lista de borrado.`
    );
  }
});
