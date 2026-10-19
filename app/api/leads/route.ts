import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'Hormiglass Leads Ingestion API',
    version: '1.0.0',
    documentation: {
      method: 'POST',
      endpoint: '/api/leads',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        nombre: 'string (obligatorio)',
        telefono: 'string (opcional, ej: +56912345678)',
        correo: 'string (opcional, ej: cliente@ejemplo.cl)',
        rut: 'string (opcional, ej: 12.345.678-9)',
        direccion: 'string (opcional, ej: Av. Siempre Viva 123)',
        comuna: 'string (opcional, ej: San Bernardo)',
        region: 'string (opcional, por defecto: Región Metropolitana)',
        origen: 'string (opcional, ej: WhatsApp Bot, ClickUp, Web, Instagram)',
        tipo_venta: 'string (opcional: Instalación | Suministro | Reventa)',
        modalidad_requerimiento: 'string (opcional: instalacion | suministro)',
        titulo: 'string (opcional)',
        notas: 'string (opcional, observaciones o requerimiento del cliente)',
        ejecutivo_id: 'uuid (opcional, id del usuario comercial asignado)',
      },
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      nombre,
      telefono,
      correo,
      rut,
      direccion,
      comuna,
      region,
      origen = 'WhatsApp Bot',
      tipo_venta = 'Instalación',
      modalidad_requerimiento = 'instalacion',
      titulo,
      notas,
      ejecutivo_id,
    } = body;

    if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
      return NextResponse.json(
        { error: 'El campo "nombre" es obligatorio y debe ser un texto válido.' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc('registrar_lead_externo', {
      p_nombre: nombre.trim(),
      p_telefono: telefono ? String(telefono).trim() : null,
      p_correo: correo ? String(correo).trim().toLowerCase() : null,
      p_rut: rut ? String(rut).trim() : null,
      p_direccion: direccion ? String(direccion).trim() : null,
      p_comuna: comuna ? String(comuna).trim() : null,
      p_region: region ? String(region).trim() : null,
      p_origen: origen ? String(origen).trim() : 'WhatsApp Bot',
      p_tipo_venta: tipo_venta ? String(tipo_venta).trim() : 'Instalación',
      p_modalidad_requerimiento: modalidad_requerimiento ? String(modalidad_requerimiento).trim() : 'instalacion',
      p_titulo: titulo ? String(titulo).trim() : null,
      p_notas: notas ? String(notas).trim() : null,
      p_ejecutivo_id: ejecutivo_id || null,
    });

    if (error) {
      console.error('Error invoking registrar_lead_externo:', error);
      return NextResponse.json(
        { error: error.message || 'Error al registrar el prospecto en la base de datos.' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Exception in /api/leads route handler:', err);
    return NextResponse.json(
      { error: err?.message || 'Error interno procesando la solicitud de lead.' },
      { status: 500 }
    );
  }
}
