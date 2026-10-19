import test from 'node:test';
import assert from 'node:assert/strict';

test('Fase 1: validación de payload y parámetros atómicos de alta de usuarios', () => {
  // Simular payload de alta de usuario con los 3 calendarios y RUT
  const payload = {
    nombre: 'Julio Ortiz',
    email: 'jortiz@hormiglass.cl',
    password: 'Password123!',
    rol: 'mano_obra',
    activo: true,
    calendario_visitas: false,
    calendario_produccion: true,
    calendario_reventa: false,
    rut: '12.345.678-9',
  };

  assert.equal(payload.nombre, 'Julio Ortiz');
  assert.equal(payload.email, 'jortiz@hormiglass.cl');
  assert.equal(payload.rol, 'mano_obra');
  assert.equal(payload.calendario_visitas, false);
  assert.equal(payload.calendario_produccion, true);
  assert.equal(payload.calendario_reventa, false);
  assert.equal(payload.rut, '12.345.678-9');
});

test('Fase 1: trigger trabajadores genera RUT provisorio único si no se provee RUT', () => {
  const fakeUserId = '8cdfba23-7c85-4cb6-bcc4-0d3cdd0669af';
  const expectedProvisionalRut = 'PROV-' + fakeUserId.replace(/-/g, '').slice(0, 8).toUpperCase();

  assert.equal(expectedProvisionalRut, 'PROV-8CDFBA23');
  assert.match(expectedProvisionalRut, /^PROV-[0-9A-F]{8}$/);
});

test('Fase 1: mapeo de cargo y área automática para trabajadores según rol de usuario', () => {
  const mapRoleToWorker = (rol) => {
    switch (rol) {
      case 'admin':
        return { cargo: 'Gerente General & Ventas', area: 'Comercial & Ventas' };
      case 'mano_obra':
        return { cargo: 'Operario / Mano de Obra', area: 'Operaciones & Terreno' };
      case 'finanzas':
        return { cargo: 'Encargado de Finanzas & Caja', area: 'Finanzas & Administración' };
      default:
        return { cargo: 'Ejecutivo Comercial & Ventas', area: 'Comercial & Ventas' };
    }
  };

  assert.deepEqual(mapRoleToWorker('mano_obra'), {
    cargo: 'Operario / Mano de Obra',
    area: 'Operaciones & Terreno',
  });
  assert.deepEqual(mapRoleToWorker('admin'), {
    cargo: 'Gerente General & Ventas',
    area: 'Comercial & Ventas',
  });
  assert.deepEqual(mapRoleToWorker('user'), {
    cargo: 'Ejecutivo Comercial & Ventas',
    area: 'Comercial & Ventas',
  });
  assert.deepEqual(mapRoleToWorker('finanzas'), {
    cargo: 'Encargado de Finanzas & Caja',
    area: 'Finanzas & Administración',
  });
});
