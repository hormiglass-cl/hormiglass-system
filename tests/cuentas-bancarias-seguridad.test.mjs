import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Lógica pura de validación defensiva antes de eliminar una cuenta bancaria,
 * equivalente a la implementada en app/caja/configuracion/page.tsx y en el trigger
 * PostgreSQL trg_proteger_eliminacion_cuenta_bancaria.
 */
function validarEliminacionCuentaBancaria({ cuenta, movimientosCount, abonosCount }) {
  const total = (movimientosCount || 0) + (abonosCount || 0);
  if (total > 0) {
    return {
      permitido: false,
      motivo: `No se puede eliminar la cuenta "${cuenta.alias}" porque tiene ${total} registro(s) contables asociados (${movimientosCount || 0} movimientos, ${abonosCount || 0} abonos). Desactívela en su lugar para mantener la integridad histórica.`,
    };
  }
  return {
    permitido: true,
  };
}

test('permite eliminar cuentas bancarias sin movimientos ni abonos', () => {
  const cuentaTest = {
    id: 'ad786d5a-8cf2-4333-9908-e45b732e2122',
    alias: 'Banco Estado Operaciones Test',
    banco: 'Banco Estado',
  };

  const resultado = validarEliminacionCuentaBancaria({
    cuenta: cuentaTest,
    movimientosCount: 0,
    abonosCount: 0,
  });

  assert.equal(resultado.permitido, true);
  assert.equal(resultado.motivo, undefined);
});

test('bloquea la eliminación de una cuenta bancaria con movimientos contables registrados', () => {
  const cuentaReal = {
    id: '7654aea1-6493-4387-89a2-7eabf9c68390',
    alias: 'Banco Chile Inmobiliaria',
    banco: 'Banco de Chile',
  };

  const resultado = validarEliminacionCuentaBancaria({
    cuenta: cuentaReal,
    movimientosCount: 4,
    abonosCount: 1,
  });

  assert.equal(resultado.permitido, false);
  assert.match(resultado.motivo, /No se puede eliminar la cuenta "Banco Chile Inmobiliaria"/);
  assert.match(resultado.motivo, /Desactívela en su lugar/);
  assert.match(resultado.motivo, /4 movimientos, 1 abonos/);
});

test('bloquea la eliminación si solo tiene abonos asociados', () => {
  const cuentaConAbonos = {
    id: '57d71008-828a-4b52-a82c-1867ae949f95',
    alias: 'Santander Comercial',
    banco: 'Banco Santander',
  };

  const resultado = validarEliminacionCuentaBancaria({
    cuenta: cuentaConAbonos,
    movimientosCount: 0,
    abonosCount: 2,
  });

  assert.equal(resultado.permitido, false);
  assert.match(resultado.motivo, /2 registro\(s\) contables asociados/);
  assert.match(resultado.motivo, /Desactívela en su lugar/);
});
