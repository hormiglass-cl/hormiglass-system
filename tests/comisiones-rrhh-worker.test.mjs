import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Comisiones en Perfil de Trabajador RRHH: estructura e integración en app/rrhh/[id]/page.tsx', () => {
  const filePath = path.resolve('app/rrhh/[id]/page.tsx');
  assert.ok(fs.existsSync(filePath), 'app/rrhh/[id]/page.tsx debe existir');
  const code = fs.readFileSync(filePath, 'utf8');

  // Pestaña y estado registrados
  assert.ok(
    code.includes("'comisiones'"),
    'activeTab debe incluir el tipo "comisiones"'
  );
  assert.ok(
    code.includes("id: 'comisiones'"),
    'Tabs items debe incluir la pestaña con id: "comisiones"'
  );
  assert.ok(
    code.includes("label: 'Comisiones'"),
    'Tabs items debe incluir la etiqueta "Comisiones"'
  );

  // Consulta de oportunidades vinculadas y cálculo
  assert.ok(
    code.includes("from('oportunidades')"),
    'Debe consultar la tabla public.oportunidades para asociar comisiones al colaborador'
  );
  assert.ok(
    code.includes('statsComisiones'),
    'Debe calcular las métricas estadísticas de comisiones (statsComisiones)'
  );
  assert.ok(
    code.includes('comisionTotal') &&
      code.includes('comisionListaPago') &&
      code.includes('comisionPagada') &&
      code.includes('comisionPendiente'),
    'statsComisiones debe contemplar total, lista para pago, pagada y pendiente'
  );

  // Liquidación segura via RPC
  assert.ok(
    code.includes('marcar_comision_pagada'),
    'Debe invocar la función RPC marcar_comision_pagada para liquidar comisiones'
  );
  assert.ok(
    code.includes('handleLiquidarComisionEnPerfil'),
    'Debe contar con el manejador handleLiquidarComisionEnPerfil'
  );

  // Control de permisos
  assert.ok(
    code.includes('canManageComisiones'),
    'Debe restringir la acción de liquidar a usuarios autorizados (admin o finanzas)'
  );
});

test('Navegación lateral Sidebar: colapsada por defecto y persistencia', () => {
  const sidebarPath = path.resolve('components/Sidebar.tsx');
  assert.ok(fs.existsSync(sidebarPath), 'components/Sidebar.tsx debe existir');
  const code = fs.readFileSync(sidebarPath, 'utf8');

  assert.ok(
    code.includes("['inicio', 'comercial', 'compras', 'calendarios', 'finanzas', 'administracion', 'sistema']"),
    'Sidebar debe inicializar todos los grupos de navegación colapsados/cerrados por defecto'
  );
  assert.ok(
    code.includes('localStorage.setItem(STORAGE_KEY'),
    'Sidebar debe persistir las preferencias del usuario al alternar grupos'
  );
  assert.ok(
    code.includes('hg-accordion-enter'),
    'Sidebar debe aplicar animaciones fluidas al expandir secciones'
  );
});

test('Transiciones fluidas y micro-interacciones en globals.css y AppShell.tsx', () => {
  const cssPath = path.resolve('app/globals.css');
  const cssCode = fs.readFileSync(cssPath, 'utf8');
  assert.ok(
    cssCode.includes('.hg-page-transition'),
    'app/globals.css debe definir la clase de transición de página fluida .hg-page-transition'
  );
  assert.ok(
    cssCode.includes('.hg-accordion-enter'),
    'app/globals.css debe definir la animación .hg-accordion-enter'
  );

  const shellPath = path.resolve('components/AppShell.tsx');
  const shellCode = fs.readFileSync(shellPath, 'utf8');
  assert.ok(
    shellCode.includes('hg-page-transition'),
    'components/AppShell.tsx debe aplicar la transición en el contenedor principal'
  );
});
