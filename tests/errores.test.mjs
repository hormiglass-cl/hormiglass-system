import assert from 'node:assert/strict';
import test from 'node:test';
import { mensajeError } from '../lib/errores.ts';

test('oculta errores técnicos del backend', () => {
  assert.equal(mensajeError({ message: 'new row violates row-level security policy for table "clientes"' }), 'No tienes permisos para realizar esta acción.');
  assert.equal(mensajeError({ message: 'duplicate key value violates unique constraint "clientes_rut_key"' }), 'Ya existe un registro con esos datos.');
  assert.equal(mensajeError(new TypeError('Failed to fetch')), 'No se pudo conectar con el servidor. Revisa tu conexión e intenta nuevamente.');
  assert.equal(mensajeError({ message: 'relation "public.x" does not exist' }, 'No se pudo guardar.'), 'No se pudo guardar.');
  assert.equal(mensajeError(new Error('Supabase Storage no confirmó la subida.'), 'Falló la subida.'), 'Falló la subida.');
});

test('mantiene mensajes de negocio en español', () => {
  assert.equal(mensajeError({ message: 'La venta solo puede cerrarse cuando la entrega está acreditada' }), 'La venta solo puede cerrarse cuando la entrega está acreditada');
});

test('usa el mensaje por defecto cuando no hay error legible', () => {
  assert.equal(mensajeError(null, 'Fallback'), 'Fallback');
  assert.equal(mensajeError({}, 'Fallback'), 'Fallback');
});
