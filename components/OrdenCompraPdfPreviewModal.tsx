'use client';

import React from 'react';
import Image from 'next/image';
import { OrdenCompra } from '../lib/types';
import { CheckCircle, FileText, Printer, X } from 'lucide-react';

interface OrdenCompraPdfPreviewModalProps {
  orden: OrdenCompra | null;
  onClose: () => void;
}

const formatCurrency = (value?: number) =>
  value && value !== 0 ? Number(value).toLocaleString('es-CL') : '-';

const formatNumber = (value?: number) =>
  Number(value || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 });

const formatOcDate = (value?: string) => {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  return `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
};

const escapeHtml = (value?: string | number) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

function buildPrintHtml(orden: OrdenCompra) {
  const items = orden.items || [];
  const blankRows = Array.from({ length: Math.max(0, 8 - items.length) });
  const fecha = formatOcDate(orden.fecha_emision);

  const itemRows = items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.articulo_codigo)}</td>
          <td class="desc">${escapeHtml(item.descripcion)}</td>
          <td class="num">${formatNumber(item.cantidad)}</td>
          <td class="num">${formatCurrency(item.precio_unitario)}</td>
          <td class="num">${formatCurrency(item.total_item)}</td>
        </tr>`
    )
    .join('');

  const emptyRows = blankRows
    .map(
      () => `
        <tr class="blank">
          <td>&nbsp;</td>
          <td></td>
          <td></td>
          <td></td>
          <td class="num">-</td>
        </tr>`
    )
    .join('');

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>OC ${escapeHtml(orden.numero_oc)} - Hormiglass</title>
        <style>
          @page { size: Letter; margin: 0.42in; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
          .page { width: 100%; min-height: 9.9in; display: flex; flex-direction: column; }
          .top { display: grid; grid-template-columns: 1fr 190px; align-items: start; gap: 18px; margin-bottom: 12px; }
          .company { line-height: 1.45; color: #1f2937; }
          .company img { width: 198px; max-height: 58px; object-fit: contain; object-position: left center; margin-bottom: 5px; }
          h1 { margin: 0 0 8px; text-align: right; font-size: 18px; letter-spacing: 0; font-weight: 800; color: #363636; }
          .folio table { width: 100%; border-collapse: collapse; font-size: 11px; }
          .folio th { background: #f7931f; color: white; text-align: left; padding: 5px 8px; width: 74px; }
          .folio td { border: 1px solid #d1d5db; padding: 5px 8px; font-weight: 700; }
          .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 8px; }
          .bar { background: #f7931f; color: white; font-weight: 800; padding: 5px 8px; text-transform: uppercase; }
          .box { min-height: 132px; border: 1px solid #d1d5db; border-top: 0; padding: 10px 9px; line-height: 1.6; }
          .name { font-weight: 800; margin-bottom: 6px; }
          .payment { margin-top: 12px; border-collapse: collapse; width: 100%; }
          .payment th { background: #f7931f; color: white; padding: 5px 8px; text-align: left; font-weight: 800; }
          .payment td { border: 1px solid #d1d5db; padding: 7px 8px; min-height: 24px; }
          .items { margin-top: 14px; width: 100%; border-collapse: collapse; table-layout: fixed; }
          .items th { background: #f7931f; color: white; padding: 6px 7px; font-weight: 800; text-align: center; }
          .items td { border-bottom: 1px solid #e5e7eb; padding: 7px; height: 28px; vertical-align: top; }
          .items .desc { font-weight: 700; }
          .items .num { text-align: right; font-variant-numeric: tabular-nums; }
          .items .blank td { color: #6b7280; }
          .bottom { display: grid; grid-template-columns: 1fr 235px; gap: 18px; margin-top: 14px; align-items: start; }
          .comments { border: 1px solid #d1d5db; min-height: 94px; }
          .comments .body { padding: 14px 10px; line-height: 1.5; }
          .totals { width: 100%; border-collapse: collapse; font-size: 11px; }
          .totals td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
          .totals .label { color: #4b5563; font-weight: 800; text-align: left; }
          .totals .amount { text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; }
          .total-row td { background: #f7931f; color: white; font-size: 13px; border: 0; padding: 8px; }
          .footer { margin-top: auto; padding-top: 24px; text-align: center; font-size: 11px; color: #4b5563; line-height: 1.45; }
          @media print { .page { min-height: auto; } }
        </style>
      </head>
      <body>
        <main class="page">
          <section class="top">
            <div class="company">
              <img src="${location.origin}/logo-completo-hormiglass.webp" alt="Hormiglass" />
              <div><strong>Sociedad Inmobiliaria Hormiglass Spa</strong></div>
              <div>Portezuelo 1502</div>
              <div>San Bernardo, Santiago</div>
              <div>Telefono: 227253725</div>
              <div>Email: hormiglass@gmail.com</div>
              <div>Sitio Web: www.hormiglass.cl</div>
            </div>
            <div class="folio">
              <h1>ORDEN DE COMPRA</h1>
              <table>
                <tbody>
                  <tr><th>FECHA</th><td>${escapeHtml(fecha)}</td></tr>
                  <tr><th>OC #</th><td>${escapeHtml(orden.numero_oc)}</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="party-grid">
            <div>
              <div class="bar">Vendedor</div>
              <div class="box">
                <div class="name">${escapeHtml(orden.proveedor?.nombre || 'Proveedor')}</div>
                <div>RUT: ${escapeHtml(orden.proveedor?.rut || '')}</div>
                <br />
                <div>${escapeHtml(orden.proveedor?.contacto || '')}</div>
                <br />
                <div>${escapeHtml(orden.proveedor?.direccion || '')}${orden.proveedor?.comuna ? `, ${escapeHtml(orden.proveedor.comuna)}` : ''}</div>
                <div>${escapeHtml(orden.proveedor?.telefono || '')}</div>
                <div>${escapeHtml(orden.proveedor?.correo || '')}</div>
              </div>
            </div>
            <div>
              <div class="bar">Envie A</div>
              <div class="box">
                <div class="name">${escapeHtml(orden.envie_a_nombre)}</div>
                <div>RUT: ${escapeHtml(orden.envie_a_rut)}</div>
                <br />
                <div>Contacto: ${escapeHtml(orden.envie_a_contacto)}</div>
                <br />
                <div>${escapeHtml(orden.envie_a_direccion)}</div>
                <div>${escapeHtml(orden.envie_a_telefono)}</div>
                <div>${escapeHtml(orden.envie_a_email)}</div>
              </div>
            </div>
          </section>

          <table class="payment">
            <thead>
              <tr><th>Contacto Pago</th><th>Nombre</th><th>Telefono</th><th>Email</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Pago: ${escapeHtml(orden.condicion_pago)}</td>
                <td>${escapeHtml(orden.contacto_pago_nombre)}</td>
                <td>${escapeHtml(orden.contacto_pago_telefono)}</td>
                <td>${escapeHtml(orden.contacto_pago_email)}</td>
              </tr>
            </tbody>
          </table>

          <table class="items">
            <thead>
              <tr>
                <th style="width: 18%;">ARTICULO #</th>
                <th>DESCRIPCIÓN</th>
                <th style="width: 10%;">CANT</th>
                <th style="width: 14%;">p/u</th>
                <th style="width: 16%;">TOTAL</th>
              </tr>
            </thead>
            <tbody>${itemRows}${emptyRows}</tbody>
          </table>

          <section class="bottom">
            <div class="comments">
              <div class="bar">Comentarios o instrucciones especiales</div>
              <div class="body">${escapeHtml(orden.instrucciones_especiales || '')}</div>
            </div>
            <table class="totals">
              <tbody>
                <tr><td class="label">SUBTOTAL</td><td class="amount">${formatCurrency(orden.subtotal)}</td></tr>
                <tr><td class="label">IMPUESTO</td><td class="amount">${formatCurrency(orden.monto_iva)}</td></tr>
                <tr><td class="label">ENVÍO</td><td class="amount">${formatCurrency(orden.costo_envio)}</td></tr>
                <tr><td class="label">OTRO</td><td class="amount">${formatCurrency(orden.otros_cargos)}</td></tr>
                <tr class="total-row"><td class="label">TOTAL</td><td class="amount">${formatCurrency(orden.monto_total)}</td></tr>
              </tbody>
            </table>
          </section>

          <footer class="footer">
            Si usted tiene alguna pregunta sobre esta orden de compra, por favor, póngase en contacto con<br />
            <strong>${escapeHtml(orden.envie_a_contacto)}, ${escapeHtml(orden.envie_a_email)}</strong>
          </footer>
        </main>
        <script>window.onload = function() { window.print(); }</script>
      </body>
    </html>`;
}

export function OrdenCompraPdfPreviewModal({ orden, onClose }: OrdenCompraPdfPreviewModalProps) {
  if (!orden) return null;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(buildPrintHtml(orden));
    printWindow.document.close();
  };

  const displayItems = orden.items || [];
  const blanks = Array.from({ length: Math.max(0, 8 - displayItems.length) });

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 ">
      <div className="bg-white border border-gray-200 rounded-lg max-w-5xl w-full p-6 space-y-5 shadow-sm text-[#213343] max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 text-[#f97316] rounded-lg flex items-center justify-center border border-orange-200">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-[#f97316] font-mono uppercase">Documento oficial Hormiglass</span>
              <h3 className="text-xl font-black">Orden de Compra {orden.numero_oc}</h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="bg-[#f97316] hover:bg-[#ea580c] text-white font-bold text-xs px-4 py-2 rounded-md transition flex items-center gap-2 shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Descargar PDF</span>
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 rounded-md hover:bg-gray-100 transition" title="Cerrar">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-100 p-4 rounded-lg border border-gray-200">
          <div className="mx-auto bg-white text-[11px] text-gray-900 shadow-sm border border-gray-200 p-8 w-full max-w-[816px] min-h-[1056px]">
            <div className="grid grid-cols-[1fr_190px] gap-5 items-start">
              <div className="leading-relaxed">
                <Image src="/logo-completo-hormiglass.webp" alt="Hormiglass" width={192} height={48} className="w-48 h-auto object-contain mb-2" />
                <p className="font-bold">Sociedad Inmobiliaria Hormiglass Spa</p>
                <p>Portezuelo 1502</p>
                <p>San Bernardo, Santiago</p>
                <p>Telefono: 227253725</p>
                <p>Email: hormiglass@gmail.com</p>
                <p>Sitio Web: www.hormiglass.cl</p>
              </div>
              <div>
                <h2 className="text-right text-lg font-black mb-2">ORDEN DE COMPRA</h2>
                <div className="grid grid-cols-[74px_1fr] border border-gray-300">
                  <div className="bg-[#f97316] text-white font-black p-1.5">FECHA</div>
                  <div className="p-1.5 font-bold">{formatOcDate(orden.fecha_emision)}</div>
                  <div className="bg-[#f97316] text-white font-black p-1.5 border-t border-orange-300">OC #</div>
                  <div className="p-1.5 font-bold border-t border-gray-300">{orden.numero_oc}</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-5 mt-4">
              <div>
                <div className="bg-[#f97316] text-white font-black uppercase px-2 py-1">Vendedor</div>
                <div className="border border-gray-300 border-t-0 p-3 min-h-36 leading-relaxed">
                  <p className="font-black">{orden.proveedor?.nombre || 'Proveedor'}</p>
                  <p>RUT: {orden.proveedor?.rut || ''}</p>
                  <br />
                  <p>{orden.proveedor?.contacto || ''}</p>
                  <br />
                  <p>{orden.proveedor?.direccion || ''}{orden.proveedor?.comuna ? `, ${orden.proveedor.comuna}` : ''}</p>
                  <p>{orden.proveedor?.telefono || ''}</p>
                  <p>{orden.proveedor?.correo || ''}</p>
                </div>
              </div>
              <div>
                <div className="bg-[#f97316] text-white font-black uppercase px-2 py-1">Envie A</div>
                <div className="border border-gray-300 border-t-0 p-3 min-h-36 leading-relaxed">
                  <p className="font-black">{orden.envie_a_nombre}</p>
                  <p>RUT: {orden.envie_a_rut}</p>
                  <br />
                  <p>Contacto: {orden.envie_a_contacto}</p>
                  <br />
                  <p>{orden.envie_a_direccion}</p>
                  <p>{orden.envie_a_telefono}</p>
                  <p>{orden.envie_a_email}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 mt-4 border border-gray-300">
              {['Contacto Pago', 'Nombre', 'Telefono', 'Email'].map((label) => (
                <div key={label} className="bg-[#f97316] text-white font-black px-2 py-1">{label}</div>
              ))}
              <div className="px-2 py-2 border-t border-gray-300">Pago: {orden.condicion_pago}</div>
              <div className="px-2 py-2 border-t border-gray-300">{orden.contacto_pago_nombre}</div>
              <div className="px-2 py-2 border-t border-gray-300">{orden.contacto_pago_telefono}</div>
              <div className="px-2 py-2 border-t border-gray-300">{orden.contacto_pago_email}</div>
            </div>

            <table className="w-full mt-4 table-fixed border-collapse">
              <thead className="bg-[#f97316] text-white">
                <tr>
                  <th className="p-1.5 w-[18%]">ARTICULO #</th>
                  <th className="p-1.5">DESCRIPCIÓN</th>
                  <th className="p-1.5 w-[10%]">CANT</th>
                  <th className="p-1.5 w-[14%] text-right">p/u</th>
                  <th className="p-1.5 w-[16%] text-right">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map((item, index) => (
                  <tr key={index} className="border-b border-gray-200 h-8">
                    <td className="p-1.5">{item.articulo_codigo}</td>
                    <td className="p-1.5 font-bold">{item.descripcion}</td>
                    <td className="p-1.5 text-right">{formatNumber(item.cantidad)}</td>
                    <td className="p-1.5 text-right">{formatCurrency(item.precio_unitario)}</td>
                    <td className="p-1.5 text-right font-bold">{formatCurrency(item.total_item)}</td>
                  </tr>
                ))}
                {blanks.map((_, index) => (
                  <tr key={`blank-${index}`} className="border-b border-gray-200 h-8 text-gray-500">
                    <td className="p-1.5">&nbsp;</td>
                    <td className="p-1.5"></td>
                    <td className="p-1.5"></td>
                    <td className="p-1.5"></td>
                    <td className="p-1.5 text-right">-</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="grid grid-cols-[1fr_235px] gap-5 mt-4">
              <div className="border border-gray-300 min-h-24">
                <div className="bg-[#f97316] text-white font-black px-2 py-1">Comentarios o instrucciones especiales</div>
                <p className="p-3">{orden.instrucciones_especiales}</p>
              </div>
              <div className="text-[11px]">
                {[
                  ['SUBTOTAL', formatCurrency(orden.subtotal)],
                  ['IMPUESTO', formatCurrency(orden.monto_iva)],
                  ['ENVÍO', formatCurrency(orden.costo_envio)],
                  ['OTRO', formatCurrency(orden.otros_cargos)],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between border-b border-gray-200 px-2 py-1.5">
                    <span className="font-black">{label}</span>
                    <span className="font-black">{value}</span>
                  </div>
                ))}
                <div className="flex justify-between bg-[#f97316] text-white font-black px-2 py-2 text-sm">
                  <span>TOTAL</span>
                  <span>{formatCurrency(orden.monto_total)}</span>
                </div>
              </div>
            </div>

            <div className="mt-20 text-center text-[11px] text-gray-600">
              <p>Si usted tiene alguna pregunta sobre esta orden de compra, por favor, póngase en contacto con</p>
              <p className="font-bold">{orden.envie_a_contacto}, {orden.envie_a_email}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 pt-4 shrink-0 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <CheckCircle className="w-4 h-4 text-[#f97316]" />
            <span>Preview listo para impresión en tamaño carta</span>
          </span>
          <button onClick={onClose} className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-md transition">
            Cerrar Preview
          </button>
        </div>
      </div>
    </div>
  );
}
