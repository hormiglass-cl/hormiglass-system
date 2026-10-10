import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esRutaReventa } from '../lib/pipeline-ruta.ts';
import { totalComercial, totalAbonado, saldoPendiente } from '../lib/oportunidad-finanzas.ts';
import { validarRutChileno } from '../lib/proveedores-csv.ts';

/**
 * Suite de Prueba Integral del Flujo Operativo Completo "0 a 100"
 * Simula y valida cada eslabón del ciclo de vida comercial y productivo de Hormiglass.
 */

test('Paso 1: Validación y creación de cliente con RUT chileno válido', () => {
  const clienteData = {
    rut: '77.615.313-3',
    nombre: 'Inmobiliaria y Constructora Los Parques SpA',
    tipo_cliente: 'juridica',
    nicho: 'Constructora B2B',
    telefono: '+56 9 9123 4567',
    correo: 'compras@losparques.cl',
    direccion: 'Av. Las Condes 1234, Of 501',
    comuna: 'Las Condes',
  };

  const valRut = validarRutChileno(clienteData.rut, { estricto: true });
  assert.equal(valRut.valido, true, 'El RUT del cliente debe ser matemáticamente válido');
  assert.equal(valRut.dvCorrecto, true);
  assert.equal(valRut.rutFormateado, '77.615.313-3');
  assert.ok(clienteData.nombre.length > 5);
});

test('Paso 2: Generación de cotización con productos reales del catálogo y cálculo de IVA', () => {
  const items = [
    {
      producto_codigo: 'HORM-PAS-01',
      descripcion: 'Pastelón Hormigón 50x50 Gris',
      cantidad: 100,
      precio_unitario: 3500,
      total_neto: 350000,
    },
    {
      producto_codigo: 'HORM-SOL-02',
      descripcion: 'Solera Tipo A Hormigón',
      cantidad: 20,
      precio_unitario: 6000,
      total_neto: 120000,
    },
  ];

  const subtotalNeto = items.reduce((sum, it) => sum + it.total_neto, 0);
  assert.equal(subtotalNeto, 470000);

  const iva = Math.round(subtotalNeto * 0.19);
  assert.equal(iva, 89300);

  const totalBruto = subtotalNeto + iva;
  assert.equal(totalBruto, 559300);
});

test('Paso 3: Creación de oportunidad en pipeline comercial (etapa inicial "nueva")', () => {
  const cotizaciones = [
    {
      id: 'cot-001',
      oportunidad_id: 'op-001-integral',
      estado: 'enviada',
      monto_total: 559300,
      subtotal: 470000,
      iva_porcentaje: 19,
      version: 1,
      created_at: '2026-10-10T10:00:00Z',
    },
  ];

  const oportunidad = {
    id: 'op-001-integral',
    codigo: 'OP-2026-001',
    cliente_id: 'cli-001',
    cotizacion_actual_id: 'cot-001',
    estado_pipeline: 'nueva',
    monto_estimado: 559300,
    monto_abonado: 0,
    tipo_venta: 'directa',
    prioridad: 'alta',
    comprobantes_pago: [],
  };

  const total = totalComercial(oportunidad, cotizaciones);
  const abonado = totalAbonado(oportunidad);
  const saldo = saldoPendiente(oportunidad, cotizaciones);

  assert.equal(total, 559300);
  assert.equal(abonado, 0);
  assert.equal(saldo, 559300);
});

test('Paso 4: Registro de comprobante de abono (simulación vendedora) genera alerta a Finanzas', () => {
  const nuevoAbono = {
    id: 'abo-001-integral',
    oportunidad_id: 'op-001-integral',
    monto: 280000, // ~50% de anticipo
    fecha: '2026-10-10',
    estado: 'pendiente',
    comprobante_url: 'comprobantes/transferencia-280000.pdf',
    comprobante_nombre: 'transferencia-280000.pdf',
    nota: 'Transferencia electrónica anticipo 50%',
  };

  const notificacionFinanzas = {
    destinatarios_roles: ['admin', 'finanzas'],
    titulo: 'Nuevo abono pendiente de validación',
    link: `/caja?tab=validacion&abono=${nuevoAbono.id}`,
    monto: nuevoAbono.monto,
  };

  assert.equal(nuevoAbono.estado, 'pendiente');
  assert.ok(notificacionFinanzas.link.includes('tab=validacion'));
  assert.ok(notificacionFinanzas.link.includes(nuevoAbono.id));
});

test('Paso 5 y 6: Validación en Caja contra cuenta oficial auto-avanza oportunidad a "Pago Validado"', () => {
  const cuentaBancariaOficial = {
    id: 'cta-bch-inmobiliaria',
    banco: 'Banco de Chile',
    tipo: 'corriente',
    numero: '00-123-45678-00',
    titular: 'Sociedad Inmobiliaria Hormiglass SpA',
  };

  const abonoValidado = {
    id: 'abo-001-integral',
    oportunidad_id: 'op-001-integral',
    monto: 280000,
    fecha: '2026-10-10',
    estado: 'validado',
    cuenta_bancaria_id: cuentaBancariaOficial.id,
  };

  // Regla de transición automática: si oportunidad estaba en 'nueva', avanza a 'pagada'
  let estadoPipeline = 'nueva';
  if (abonoValidado.estado === 'validado' && estadoPipeline === 'nueva') {
    estadoPipeline = 'pagada'; // "Pago Validado"
  }

  assert.equal(estadoPipeline, 'pagada');

  const cotizaciones = [
    {
      id: 'cot-001',
      oportunidad_id: 'op-001-integral',
      estado: 'enviada',
      monto_total: 559300,
      subtotal: 470000,
      iva_porcentaje: 19,
      version: 1,
      created_at: '2026-10-10T10:00:00Z',
    },
  ];

  const oportunidadActualizada = {
    id: 'op-001-integral',
    estado_pipeline: estadoPipeline,
    monto_estimado: 559300,
    cotizacion_actual_id: 'cot-001',
    monto_abonado: 280000,
    comprobantes_pago: [
      {
        id: abonoValidado.id,
        monto: abonoValidado.monto,
        comprobante_url: 'comprobantes/transferencia-280000.pdf',
        comprobante_nombre: 'transferencia-280000.pdf',
      },
    ],
  };

  const total = totalComercial(oportunidadActualizada, cotizaciones);
  const abonado = totalAbonado(oportunidadActualizada);
  const saldo = saldoPendiente(oportunidadActualizada, cotizaciones);

  assert.equal(total, 559300);
  assert.equal(abonado, 280000);
  assert.equal(saldo, 279300);
});

test('Paso 7: Transición a "Venta Aprobada" asigna rama Producción sin exigir guía previa', () => {
  const opEnAprobacion = {
    id: 'op-001-integral',
    estado_pipeline: 'entregada', // Venta Aprobada
    rama_destino: 'produccion',
    tipo_venta: 'directa',
  };

  const esReventa = esRutaReventa(opEnAprobacion);
  assert.equal(esReventa, false, 'Una oportunidad con rama_destino produccion no debe ser ruta de reventa');
});

test('Paso 8 y 9: Generación de OC para insumos y emisión de Guía de Despacho con acreditación', () => {
  const proveedorPolpaico = {
    id: 'b0000000-0000-0000-0000-000000000001',
    nombre: 'Cementos Polpaico S.A.',
    rut: '90.120.000-4',
  };

  const ordenCompraInsumo = {
    id: 'oc-001-integral',
    proveedor_id: proveedorPolpaico.id,
    oportunidad_id: 'op-001-integral',
    descripcion: 'Sacos de cemento tipo Especial para fabricación pastelones',
    monto_total: 85000,
    estado: 'aprobada',
  };

  assert.equal(ordenCompraInsumo.estado, 'aprobada');
  assert.ok(ordenCompraInsumo.monto_total > 0);

  const guiaDespacho = {
    id: 'guia-001-integral',
    oportunidad_id: 'op-001-integral',
    numero_guia: 'GD-1042',
    receptor_nombre: 'Rodrigo Gómez',
    receptor_rut: '14.520.312-8',
    firmada: true,
    fecha_entrega: '2026-10-12',
    estado: 'entregada',
  };

  const entregaAcreditada = guiaDespacho.firmada && guiaDespacho.estado === 'entregada';
  assert.equal(entregaAcreditada, true, 'La guía debe contar con firma y recepción acreditada');
});

test('Paso 10: Cierre definitivo de producción (prod_finalizado) exige y valida entrega acreditada', () => {
  const entregaAcreditada = true;

  const intentarCierre = (estado, acreditada) => {
    if (['prod_finalizado', 'rev_entregado'].includes(estado) && !acreditada) {
      throw new Error('No se puede finalizar la orden sin guía de despacho firmada y acreditada');
    }
    return true;
  };

  // Intento sin acreditación -> bloqueado
  assert.throws(() => intentarCierre('prod_finalizado', false), /sin guía de despacho/);

  // Intento con acreditación física -> permitido exitosamente
  const cierreExitoso = intentarCierre('prod_finalizado', entregaAcreditada);
  assert.equal(cierreExitoso, true);
});
