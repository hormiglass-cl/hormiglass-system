'use client';

import React from 'react';
import Image from 'next/image';
import { Cotizacion } from '../lib/types';
import { Printer, X, FileText, CheckCircle } from 'lucide-react';

interface PdfPreviewModalProps {
  cotizacion: Cotizacion | null;
  onClose: () => void;
}

const formatCurrency = (value?: number) =>
  value !== undefined && value !== null ? Number(value).toLocaleString('es-CL') : '0';

const formatDateCL = (value?: string) => {
  if (!value) return new Date().toLocaleDateString('es-CL');
  // Handle YYYY-MM-DD or ISO string
  const clean = value.includes('T') ? value : `${value}T00:00:00`;
  const date = new Date(clean);
  if (isNaN(date.getTime())) return new Date().toLocaleDateString('es-CL');
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
};

const escapeHtml = (value?: string | number) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

function calculateTotals(cotizacion: Cotizacion) {
  const items = cotizacion.items || [];
  const ivaPercent = cotizacion.iva_porcentaje || 19;

  let totalNetoAntesDescuento = 0;
  let subtotalNetoConDescuento = 0;

  items.forEach((it) => {
    const q = Number(it.cantidad) || 0;
    const p = Number(it.precio_unitario) || 0;
    const dto = Number(it.descuento_porcentaje) || 0;
    const bruto = q * p;
    const baseImp = it.total_item !== undefined && it.total_item !== 0
      ? Number(it.total_item)
      : Math.round(bruto * (1 - dto / 100));

    totalNetoAntesDescuento += bruto;
    subtotalNetoConDescuento += baseImp;
  });

  const descuentoTotal = Math.max(0, totalNetoAntesDescuento - subtotalNetoConDescuento);
  const totalSinIva = subtotalNetoConDescuento || Number(cotizacion.subtotal) || 0;
  const montoIva = cotizacion.monto_iva && cotizacion.monto_iva > 0
    ? Number(cotizacion.monto_iva)
    : Math.round(totalSinIva * (ivaPercent / 100));
  const montoTotal = cotizacion.monto_total && cotizacion.monto_total > 0
    ? Number(cotizacion.monto_total)
    : totalSinIva + montoIva;

  return {
    totalNetoAntesDescuento,
    descuentoTotal,
    totalSinIva,
    ivaPercent,
    montoIva,
    montoTotal,
  };
}

export function PdfPreviewModal({ cotizacion, onClose }: PdfPreviewModalProps) {
  if (!cotizacion) return null;

  const totals = calculateTotals(cotizacion);
  const items = cotizacion.items || [];
  const estadoLabel = cotizacion.estado === 'borrador' ? 'Borrador' : cotizacion.estado === 'aprobada' ? 'Aprobada' : 'Emitida';

  // Format dates
  const fechaCotizacion = formatDateCL(cotizacion.created_at);
  const fechaTermino = cotizacion.fecha_validez
    ? formatDateCL(cotizacion.fecha_validez)
    : (() => {
        const d = cotizacion.created_at ? new Date(cotizacion.created_at) : new Date();
        d.setDate(d.getDate() + 30);
        return formatDateCL(d.toISOString());
      })();

  const refCliente = cotizacion.referencia_cliente || cotizacion.cliente?.rut || '-';
  const clienteNombre = cotizacion.cliente?.nombre || 'Cliente Registrado';
  const clienteDireccion = cotizacion.cliente?.direccion || 'Pasaje Chipre 0318';
  const clienteComuna = cotizacion.cliente?.comuna || 'Puente Alto';

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const blankCount = Math.max(0, 6 - items.length);
    const blankRows = Array.from({ length: blankCount })
      .map(
        () => `
        <tr class="blank-row">
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
        </tr>
      `
      )
      .join('');

    const itemRows = items
      .map((it) => {
        const q = Number(it.cantidad) || 0;
        const p = Number(it.precio_unitario) || 0;
        const dto = Number(it.descuento_porcentaje) || 0;
        const baseImp = it.total_item !== undefined && it.total_item !== 0
          ? Number(it.total_item)
          : Math.round(q * p * (1 - dto / 100));

        return `
        <tr>
          <td class="col-desc">${escapeHtml(it.producto)}</td>
          <td class="col-iva">${totals.ivaPercent}%</td>
          <td class="col-pu">${formatCurrency(p)}</td>
          <td class="col-cant">${q}</td>
          <td class="col-dto">${dto > 0 ? `${dto}%` : '-'}</td>
          <td class="col-base">${formatCurrency(baseImp)}</td>
        </tr>
      `;
      })
      .join('');

    const commentText = cotizacion.comentario_publico || cotizacion.observaciones;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Cotización ${escapeHtml(cotizacion.numero_cotizacion)} - Hormiglass</title>
          <style>
            @page { size: Letter; margin: 0.45in; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, Helvetica, sans-serif;
              color: #111827;
              font-size: 11px;
              line-height: 1.35;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .page-container {
              width: 100%;
              max-width: 7.6in;
              margin: 0 auto;
              padding: 10px;
            }
            .top-header {
              display: table;
              width: 100%;
              margin-bottom: 12px;
            }
            .top-left {
              display: table-cell;
              vertical-align: top;
              width: 50%;
            }
            .top-left img {
              width: 195px;
              max-height: 60px;
              object-fit: contain;
              display: block;
            }
            .top-right {
              display: table-cell;
              vertical-align: top;
              width: 50%;
              text-align: right;
              font-size: 10.5px;
            }
            .doc-title {
              font-size: 14px;
              font-weight: bold;
              margin-bottom: 6px;
              color: #111827;
            }
            .meta-line {
              margin-bottom: 2px;
            }
            .meta-label {
              color: #374151;
            }
            .meta-val {
              font-weight: normal;
              margin-left: 4px;
            }
            .entity-row {
              display: table;
              width: 100%;
              margin-top: 10px;
              margin-bottom: 10px;
            }
            .entity-col-de {
              display: table-cell;
              width: 48%;
              vertical-align: top;
            }
            .entity-col-sep {
              display: table-cell;
              width: 4%;
            }
            .entity-col-a {
              display: table-cell;
              width: 48%;
              vertical-align: top;
            }
            .entity-header-label {
              font-size: 10px;
              color: #374151;
              margin-bottom: 3px;
            }
            .box-de {
              background-color: #f3f4f6;
              border: 1px solid #e5e7eb;
              border-radius: 3px;
              padding: 8px 10px;
              font-size: 10.5px;
              line-height: 1.35;
              min-height: 110px;
            }
            .box-de .company-name {
              font-weight: bold;
              margin-bottom: 2px;
            }
            .box-a {
              background-color: #ffffff;
              border: 1px solid #d1d5db;
              border-radius: 3px;
              padding: 8px 10px;
              font-size: 10.5px;
              line-height: 1.35;
              min-height: 110px;
            }
            .box-a .client-name {
              font-weight: bold;
              margin-bottom: 2px;
            }
            .comment-section {
              margin-top: 0px;
              margin-bottom: 8px;
              font-size: 10.5px;
              color: #374151;
              white-space: pre-line;
            }
            .currency-label {
              text-align: right;
              font-size: 9.5px;
              color: #111827;
              margin-bottom: 3px;
              margin-top: 6px;
            }
            table.items-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 0px;
              font-size: 10px;
              border: 1px solid #9ca3af;
            }
            table.items-table th {
              background-color: #ffffff;
              color: #111827;
              border-bottom: 1px solid #9ca3af;
              border-right: 1px solid #9ca3af;
              padding: 5px 6px;
              font-weight: normal;
              font-size: 10px;
            }
            table.items-table th:last-child {
              border-right: none;
            }
            table.items-table td {
              border-right: 1px solid #9ca3af;
              border-bottom: 1px dotted #9ca3af;
              padding: 5px 6px;
              vertical-align: top;
            }
            table.items-table td:last-child {
              border-right: none;
            }
            table.items-table tr.blank-row td {
              border-bottom: none;
              height: 22px;
            }
            .col-desc { text-align: left; width: 44%; white-space: pre-line; }
            .col-iva { text-align: center; width: 8%; }
            .col-pu { text-align: right; width: 14%; }
            .col-cant { text-align: center; width: 10%; }
            .col-dto { text-align: center; width: 10%; }
            .col-base { text-align: right; width: 14%; font-weight: normal; }

            .bottom-section {
              display: table;
              width: 100%;
              margin-top: 10px;
            }
            .bottom-left {
              display: table-cell;
              width: 48%;
              vertical-align: top;
              font-size: 10px;
              line-height: 1.6;
            }
            .bottom-sep {
              display: table-cell;
              width: 4%;
            }
            .bottom-right {
              display: table-cell;
              width: 48%;
              vertical-align: top;
            }
            .totals-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 10px;
            }
            .totals-table td {
              padding: 2.5px 4px;
            }
            .totals-table td.label-col {
              text-align: left;
              color: #111827;
            }
            .totals-table td.val-col {
              text-align: right;
              font-variant-numeric: tabular-nums;
            }
            .total-final-row {
              background-color: #e5e7eb;
              font-weight: bold;
            }
            .total-final-row td {
              padding: 4px 4px;
            }

            .signature-block {
              margin-top: 12px;
              text-align: right;
            }
            .signature-title {
              font-size: 9.5px;
              color: #111827;
              margin-bottom: 4px;
              text-align: center;
              width: 230px;
              margin-left: auto;
            }
            .signature-box {
              width: 230px;
              height: 48px;
              border: 1px solid #9ca3af;
              margin-left: auto;
              background-color: #ffffff;
            }
            .page-footer {
              margin-top: 25px;
              text-align: right;
              font-size: 9px;
              color: #6b7280;
            }
          </style>
        </head>
        <body>
          <div class="page-container">
            <!-- Top Header -->
            <div class="top-header">
              <div class="top-left">
                <img src="${window.location.origin}/logo-completo-hormiglass.webp" alt="Hormiglass" />
              </div>
              <div class="top-right">
                <div class="doc-title">
                  Cotización N° ${escapeHtml(cotizacion.numero_cotizacion)}
                </div>
                <div class="meta-line">
                  <span class="meta-label">Ref. cliente :</span>
                  <span class="meta-val">${escapeHtml(refCliente)}</span>
                </div>
                <div class="meta-line">
                  <span class="meta-label">Fecha cotización :</span>
                  <span class="meta-val">${fechaCotizacion}</span>
                </div>
                <div class="meta-line">
                  <span class="meta-label">Validar fecha de término :</span>
                  <span class="meta-val">${fechaTermino}</span>
                </div>
              </div>
            </div>

            <!-- Entities: De / A -->
            <div class="entity-row">
              <div class="entity-col-de">
                <div class="entity-header-label">De</div>
                <div class="box-de">
                  <div class="company-name">Sociedad Inmobiliaria Hormiglass spa</div>
                  <div>RUT: 77.615.313-3</div>
                  <div>Giro: COMPRA, VENTA Y ALQUILER (EXCEPTO AMOBLADOS) DE INMUEBLES</div>
                  <div style="margin-top: 4px;">Dirección: Portezuelo #1502</div>
                  <div>Comuna: San Bernardo</div>
                  <div>Correo: hormiglass@gmail.com</div>
                </div>
              </div>
              <div class="entity-col-sep"></div>
              <div class="entity-col-a">
                <div class="entity-header-label">A</div>
                <div class="box-a">
                  <div class="client-name">${escapeHtml(clienteNombre)}</div>
                  <div>${escapeHtml(clienteDireccion)}</div>
                  <div>${escapeHtml(clienteComuna)}</div>
                  ${cotizacion.cliente?.rut ? `<div style="margin-top: 6px;">RUT: ${escapeHtml(cotizacion.cliente.rut)}</div>` : ''}
                  ${cotizacion.cliente?.telefono ? `<div>Teléfono: ${escapeHtml(cotizacion.cliente.telefono)}</div>` : ''}
                </div>
              </div>
            </div>

            <!-- Currency Indicator -->
            <div class="currency-label">Monto en Chile Peso</div>

            <!-- Items Table -->
            <table class="items-table">
              <thead>
                <tr>
                  <th class="col-desc">Descripción</th>
                  <th class="col-iva">IVA</th>
                  <th class="col-pu">P.U. (net)</th>
                  <th class="col-cant">Cantidad</th>
                  <th class="col-dto">Dto.</th>
                  <th class="col-base">Base imp.</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows}
                ${blankRows}
              </tbody>
            </table>

            <!-- Bottom Section -->
            <div class="bottom-section">
              <div class="bottom-left">
                ${commentText ? `<div class="comment-section">${escapeHtml(commentText)}</div>` : ''}
                <div><strong>Retraso disponible:</strong> ${escapeHtml(cotizacion.plazo_entrega || 'Inmediato')}</div>
                <div style="margin-top: 4px;"><strong>Términos de pago:</strong> ${escapeHtml(cotizacion.condiciones_pago || 'Acuse de recibo')}</div>

                <div class="transfer-box" style="margin-top: 12px; border: 1px solid #9ca3af; background-color: #f9fafb; border-radius: 3px; padding: 7px 10px; font-size: 9.5px; line-height: 1.35;">
                  <div style="font-weight: bold; color: #111827; text-transform: uppercase; font-size: 9px; margin-bottom: 2px;">Datos para transferencia bancaria:</div>
                  <div style="color: #1f2937; font-weight: bold;">Sociedad Inmobiliaria Hormiglass spa</div>
                  <div style="color: #374151;">RUT: 77.615.313-3</div>
                  <div style="color: #374151;">Cuenta Corriente N° <strong>0-000-8836639-5</strong></div>
                  <div style="color: #374151; font-weight: bold;">Banco Santander</div>
                  <div style="color: #4b5563; margin-top: 2px;">Comprobantes: <strong>comprobantes@hormiglass.cl</strong></div>
                </div>
              </div>
              <div class="bottom-sep"></div>
              <div class="bottom-right">
                <table class="totals-table">
                  <tbody>
                    <tr>
                      <td class="label-col">Total neto antes del descuento</td>
                      <td class="val-col">${formatCurrency(totals.totalNetoAntesDescuento)}</td>
                    </tr>
                    <tr>
                      <td class="label-col">Descuento total</td>
                      <td class="val-col">${formatCurrency(totals.descuentoTotal)}</td>
                    </tr>
                    <tr>
                      <td class="label-col">Total (sin IVA)</td>
                      <td class="val-col">${formatCurrency(totals.totalSinIva)}</td>
                    </tr>
                    <tr>
                      <td class="label-col">Total impuestos ${totals.ivaPercent}%</td>
                      <td class="val-col">${formatCurrency(totals.montoIva)}</td>
                    </tr>
                    <tr class="total-final-row">
                      <td class="label-col">Total (impuesto inc.)</td>
                      <td class="val-col">${formatCurrency(totals.montoTotal)}</td>
                    </tr>
                  </tbody>
                </table>

                <div class="signature-block">
                  <div class="signature-title">Aprobación, timbre, fecha y firma</div>
                  <div class="signature-box"></div>
                </div>
              </div>
            </div>

            <!-- Footer Pagination -->
            <div class="page-footer">1 / 1</div>
          </div>

          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-50 ">
      <div className="bg-white border border-gray-200 rounded-xl max-w-4xl w-full p-4 sm:p-6 space-y-4 shadow-sm text-[#252b2d] max-h-[95vh] flex flex-col">
        {/* Header Modal Bar */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#f97316]/10 text-[#f97316] rounded-md flex items-center justify-center border border-[#f97316]/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-[#f97316] uppercase font-mono">
                  PLANTILLA OFICIAL HORMIGLASS
                </span>
                <span className="text-[10px] font-extrabold uppercase bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md">
                  v{cotizacion.version || 1}
                </span>
                <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md">
                  {estadoLabel}
                </span>
              </div>
              <h3 className="text-lg font-bold text-[#252b2d]">
                Cotización N° {cotizacion.numero_cotizacion}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="bg-[#f97316] hover:bg-[#ea580c] text-white font-bold text-xs px-4 py-2 rounded-md transition flex items-center gap-2 shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Guardar PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-[#252b2d] rounded-md hover:bg-gray-100 transition"
              title="Cerrar Previsualización"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Paper Sheet Preview container */}
        <div className="flex-1 overflow-y-auto pr-1 bg-gray-100 p-3 sm:p-6 rounded-md border border-gray-200 flex justify-center">
          {/* Exact Paper Sheet */}
          <div className="w-full max-w-[760px] bg-white text-gray-900 shadow-sm p-6 sm:p-8 rounded-sm font-sans text-[11px] leading-relaxed select-text">
            {/* Top Header */}
            <div className="flex justify-between items-start mb-4">
              <div className="w-1/2">
                <Image
                  src="/logo-completo-hormiglass.webp"
                  alt="Hormiglass"
                  width={210}
                  height={60}
                  className="w-48 h-auto object-contain"
                  priority
                />
              </div>
              <div className="w-1/2 text-right space-y-0.5 text-[11px]">
                <div className="text-[13px] font-bold mb-1.5 text-gray-900">
                  Cotización N° {cotizacion.numero_cotizacion}
                </div>
                <div>
                  <span className="text-gray-600">Ref. cliente :</span>{' '}
                  <span className="font-normal">{refCliente}</span>
                </div>
                <div>
                  <span className="text-gray-600">Fecha cotización :</span>{' '}
                  <span className="font-normal">{fechaCotizacion}</span>
                </div>
                <div>
                  <span className="text-gray-600">Validar fecha de término :</span>{' '}
                  <span className="font-normal">{fechaTermino}</span>
                </div>
              </div>
            </div>

            {/* Entity boxes (De / A) */}
            <div className="grid grid-cols-2 gap-4 my-3 text-[10.5px]">
              <div>
                <div className="text-[10px] text-gray-600 mb-1">De</div>
                <div className="bg-gray-100/90 border border-gray-200 rounded p-2.5 space-y-0.5 min-h-[110px]">
                  <div className="font-bold text-gray-900">Sociedad Inmobiliaria Hormiglass spa</div>
                  <div className="text-gray-700">RUT: 77.615.313-3</div>
                  <div className="text-gray-700">Giro: COMPRA, VENTA Y ALQUILER (EXCEPTO AMOBLADOS) DE INMUEBLES</div>
                  <div className="text-gray-700 pt-1">Dirección: Portezuelo #1502</div>
                  <div className="text-gray-700">Comuna: San Bernardo</div>
                  <div className="text-gray-700">Correo: hormiglass@gmail.com</div>
                </div>
              </div>

              <div>
                <div className="text-[10px] text-gray-600 mb-1">A</div>
                <div className="bg-white border border-gray-300 rounded p-2.5 space-y-0.5 min-h-[110px]">
                  <div className="font-bold text-gray-900">{clienteNombre}</div>
                  <div className="text-gray-700">{clienteDireccion}</div>
                  <div className="text-gray-700">{clienteComuna}</div>
                  {cotizacion.cliente?.rut && (
                    <div className="text-gray-700 pt-1.5">RUT: {cotizacion.cliente.rut}</div>
                  )}
                  {cotizacion.cliente?.telefono && (
                    <div className="text-gray-700">Teléfono: {cotizacion.cliente.telefono}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Currency Indicator */}
            <div className="text-right text-[9.5px] text-gray-700 mt-2 mb-1">
              Monto en Chile Peso
            </div>

            {/* Items Table */}
            <div className="border border-gray-400 overflow-hidden mb-3">
              <table className="w-full text-left border-collapse text-[10px]">
                <thead>
                  <tr className="border-b border-gray-400 bg-white">
                    <th className="p-2 border-r border-gray-400 font-normal w-[44%]">Descripción</th>
                    <th className="p-2 border-r border-gray-400 font-normal text-center w-[8%]">IVA</th>
                    <th className="p-2 border-r border-gray-400 font-normal text-right w-[14%]">P.U. (net)</th>
                    <th className="p-2 border-r border-gray-400 font-normal text-center w-[10%]">Cantidad</th>
                    <th className="p-2 border-r border-gray-400 font-normal text-center w-[10%]">Dto.</th>
                    <th className="p-2 font-normal text-right w-[14%]">Base imp.</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const q = Number(it.cantidad) || 0;
                    const p = Number(it.precio_unitario) || 0;
                    const dto = Number(it.descuento_porcentaje) || 0;
                    const baseImp = it.total_item !== undefined && it.total_item !== 0
                      ? Number(it.total_item)
                      : Math.round(q * p * (1 - dto / 100));

                    return (
                      <tr key={idx} className="border-b border-dotted border-gray-400">
                        <td className="p-2 border-r border-gray-400 text-gray-900 whitespace-pre-line">{it.producto}</td>
                        <td className="p-2 border-r border-gray-400 text-center">{totals.ivaPercent}%</td>
                        <td className="p-2 border-r border-gray-400 text-right font-mono">{formatCurrency(p)}</td>
                        <td className="p-2 border-r border-gray-400 text-center">{q}</td>
                        <td className="p-2 border-r border-gray-400 text-center">{dto > 0 ? `${dto}%` : '-'}</td>
                        <td className="p-2 text-right font-mono">{formatCurrency(baseImp)}</td>
                      </tr>
                    );
                  })}
                  {/* Spacer rows */}
                  {Array.from({ length: Math.max(0, 4 - items.length) }).map((_, i) => (
                    <tr key={`spacer-${i}`} className="h-6">
                      <td className="p-2 border-r border-gray-400">&nbsp;</td>
                      <td className="p-2 border-r border-gray-400">&nbsp;</td>
                      <td className="p-2 border-r border-gray-400">&nbsp;</td>
                      <td className="p-2 border-r border-gray-400">&nbsp;</td>
                      <td className="p-2 border-r border-gray-400">&nbsp;</td>
                      <td className="p-2">&nbsp;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Conditions & Totals */}
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div className="text-[10px] space-y-1.5 text-gray-800">
                {(cotizacion.comentario_publico || cotizacion.observaciones) && (
                  <div className="mb-2 text-gray-700 text-[10.5px] whitespace-pre-line">
                    {cotizacion.comentario_publico || cotizacion.observaciones}
                  </div>
                )}
                <div>
                  <span className="font-bold">Retraso disponible:</span>{' '}
                  <span>{cotizacion.plazo_entrega || 'Inmediato'}</span>
                </div>
                <div>
                  <span className="font-bold">Términos de pago:</span>{' '}
                  <span>{cotizacion.condiciones_pago || 'Acuse de recibo'}</span>
                </div>

                {/* Recuadro Datos Transferencia Santander */}
                <div className="mt-3 p-2 bg-gray-50 border border-gray-300 rounded text-[9.5px] space-y-0.5">
                  <div className="font-bold text-gray-900 uppercase text-[9px] tracking-wider">Datos para transferencia bancaria:</div>
                  <div className="text-gray-900 font-semibold">Sociedad Inmobiliaria Hormiglass spa</div>
                  <div className="text-gray-700">RUT: <span className="font-mono">77.615.313-3</span></div>
                  <div className="text-gray-700">Cuenta Corriente N° <span className="font-mono font-bold text-gray-900">0-000-8836639-5</span></div>
                  <div className="text-gray-700 font-semibold">Banco Santander</div>
                  <div className="text-gray-600 pt-0.5">Comprobantes: <span className="font-mono font-medium text-gray-800">comprobantes@hormiglass.cl</span></div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-[10px] space-y-1 border-t border-transparent">
                  <div className="flex justify-between py-0.5 text-gray-800">
                    <span>Total neto antes del descuento</span>
                    <span className="font-mono">{formatCurrency(totals.totalNetoAntesDescuento)}</span>
                  </div>
                  <div className="flex justify-between py-0.5 text-gray-800">
                    <span>Descuento total</span>
                    <span className="font-mono">{formatCurrency(totals.descuentoTotal)}</span>
                  </div>
                  <div className="flex justify-between py-0.5 text-gray-800">
                    <span>Total (sin IVA)</span>
                    <span className="font-mono">{formatCurrency(totals.totalSinIva)}</span>
                  </div>
                  <div className="flex justify-between py-0.5 text-gray-800">
                    <span>Total impuestos {totals.ivaPercent}%</span>
                    <span className="font-mono">{formatCurrency(totals.montoIva)}</span>
                  </div>
                  <div className="flex justify-between p-1 bg-gray-200 font-bold text-gray-900 rounded-xs mt-1">
                    <span>Total (impuesto inc.)</span>
                    <span className="font-mono">{formatCurrency(totals.montoTotal)}</span>
                  </div>
                </div>

                <div className="text-right pt-2">
                  <div className="text-[9.5px] text-gray-800 text-center w-56 ml-auto mb-1">
                    Aprobación, timbre, fecha y firma
                  </div>
                  <div className="w-56 h-12 border border-gray-400 rounded-xs ml-auto bg-white" />
                </div>
              </div>
            </div>

            {/* Pagination Footer */}
            <div className="mt-8 text-right text-[9px] text-gray-500">1 / 1</div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-gray-700 pt-3 shrink-0 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>Plantilla oficial Hormiglass lista para exportación</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-md transition text-xs"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
