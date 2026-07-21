'use client';

import React from 'react';
import { Cotizacion } from '../lib/types';
import { Printer, Download, X, FileText, CheckCircle } from 'lucide-react';

interface PdfPreviewModalProps {
  cotizacion: Cotizacion | null;
  onClose: () => void;
}

export function PdfPreviewModal({ cotizacion, onClose }: PdfPreviewModalProps) {
  if (!cotizacion) return null;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const itemsRows = (cotizacion.items || [])
      .map(
        (it) => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${it.producto}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${it.cantidad}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${(it.precio_unitario || 0).toLocaleString('es-CL')}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">$${(it.total_item || 0).toLocaleString('es-CL')}</td>
        </tr>
      `
      )
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cotización ${cotizacion.numero_cotizacion} - Hormiglass Ltda.</title>
          <style>
            body { font-family: Arial, sans-serif; color: #363636; padding: 40px; margin: 0; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #F7931F; padding-bottom: 20px; }
            .logo { font-size: 24px; font-weight: 900; color: #363636; }
            .logo span { color: #F7931F; }
            .cot-number { text-align: right; font-size: 14px; font-weight: bold; color: #F7931F; }
            .section { margin-top: 25px; }
            .client-box { background: #f9fafb; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
            th { background: #363636; color: white; padding: 10px; text-align: left; }
            .totals { margin-top: 20px; margin-left: auto; width: 300px; text-align: right; font-size: 13px; }
            .totals div { padding: 4px 0; }
            .total-final { font-size: 16px; font-weight: 900; color: #F7931F; border-top: 2px solid #F7931F; padding-top: 8px; }
            .footer { margin-top: 50px; font-size: 11px; text-align: center; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 15px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">HORMIGLASS <span>LTDA.</span></div>
            <div class="cot-number">
              COTIZACIÓN N° ${cotizacion.numero_cotizacion}<br/>
              <span style="font-size:11px; color:#6b7280; font-weight:normal;">Versión ${cotizacion.version || 1} · ${new Date(cotizacion.created_at || '').toLocaleDateString('es-CL')}</span>
            </div>
          </div>

          <div class="section client-box">
            <strong>Antecedentes del Cliente:</strong><br/>
            <strong>Cliente:</strong> ${cotizacion.cliente?.nombre || 'Cliente Registrado'}<br/>
            <strong>RUT:</strong> ${cotizacion.cliente?.rut || 'Sin RUT'}<br/>
            <strong>Teléfono / Email:</strong> ${cotizacion.cliente?.telefono || ''} ${cotizacion.cliente?.correo ? `| ${cotizacion.cliente.correo}` : ''}
          </div>

          <table>
            <thead>
              <tr>
                <th>Descripción del Producto</th>
                <th style="text-align: center;">Cantidad</th>
                <th style="text-align: right;">P. Unitario (Neto)</th>
                <th style="text-align: right;">Total (Neto)</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div class="totals">
            <div><span>Subtotal Neto:</span> <span>$${(cotizacion.subtotal || 0).toLocaleString('es-CL')}</span></div>
            <div><span>IVA (19% Legal Chile):</span> <span>$${(cotizacion.monto_iva || 0).toLocaleString('es-CL')}</span></div>
            <div class="total-final"><span>TOTAL COTIZACIÓN:</span> <span>$${(cotizacion.monto_total || 0).toLocaleString('es-CL')}</span></div>
          </div>

          <div style="margin-top: 30px; font-size: 12px; background: #fff7ed; padding: 15px; border-radius: 8px; border: 1px solid #ffedd5;">
            <strong>Condiciones Comerciales:</strong><br/>
            · Plazo de Entrega: ${cotizacion.plazo_entrega || '5 días hábiles'}<br/>
            · Condiciones de Pago: ${cotizacion.condiciones_pago || '50% abono / 50% al despacho'}<br/>
            · Observaciones: ${cotizacion.observaciones || 'Garantía oficial Hormiglass en prefabricados.'}
          </div>

          <div class="footer">
            Hormiglass Ltda. · Prefabricados de Hormigón & Soluciones de Aluminio · Planta San Bernardo
          </div>

          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white border border-gray-200 rounded-3xl max-w-4xl w-full p-6 sm:p-8 space-y-6 shadow-2xl text-[#363636] max-h-[90vh] flex flex-col">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 text-[#F7931F] rounded-2xl flex items-center justify-center border border-orange-200">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#F7931F] font-mono uppercase">
                  DOCUMENTO OFICIAL HORMIGLASS
                </span>
                <span className="text-[10px] font-extrabold uppercase bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                  v{cotizacion.version || 1}
                </span>
              </div>
              <h3 className="text-xl font-black text-[#363636]">
                Cotización N° {cotizacion.numero_cotizacion}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="bg-[#F7931F] hover:bg-[#e08316] text-white font-bold text-xs px-4 py-2 rounded-xl transition flex items-center gap-2 shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Descargar PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition"
              title="Cerrar Previsualización"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Cuerpo / Previsualización PDF Estilizado */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-2 bg-gray-50 p-6 rounded-2xl border border-gray-200 shadow-inner text-xs">
          {/* Header Empresa & Folio */}
          <div className="flex justify-between items-start border-b border-gray-300 pb-4 bg-white p-5 rounded-2xl border">
            <div>
              <h4 className="text-lg font-extrabold text-[#363636]">HORMIGLASS LTDA.</h4>
              <p className="text-gray-500 text-[11px]">Prefabricados de Hormigón & Soluciones de Aluminio</p>
              <p className="text-gray-500 text-[11px]">Planta San Bernardo · Santiago, Chile</p>
            </div>
            <div className="text-right">
              <span className="text-base font-black text-[#F7931F] block font-mono">
                {cotizacion.numero_cotizacion}
              </span>
              <span className="text-[11px] text-gray-500 font-medium">
                Fecha: {new Date(cotizacion.created_at || '').toLocaleDateString('es-CL')}
              </span>
            </div>
          </div>

          {/* Ficha Cliente */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 space-y-1">
            <span className="font-extrabold text-xs text-[#F7931F] uppercase tracking-wider block mb-1">
              Antecedentes del Cliente
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <p><strong className="text-gray-700">Cliente / Empresa:</strong> {cotizacion.cliente?.nombre || 'Cliente Registrado'}</p>
              <p><strong className="text-gray-700">RUT:</strong> <span className="font-mono">{cotizacion.cliente?.rut || 'Sin RUT'}</span></p>
              <p><strong className="text-gray-700">Teléfono:</strong> {cotizacion.cliente?.telefono || 'No registrado'}</p>
              <p><strong className="text-gray-700">Email:</strong> {cotizacion.cliente?.correo || 'No registrado'}</p>
            </div>
          </div>

          {/* Tabla Ítems */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#363636] text-white text-[10px] uppercase font-bold tracking-wider">
                <tr>
                  <th className="p-3">Descripción del Producto / Servicio</th>
                  <th className="p-3 text-center">Cantidad</th>
                  <th className="p-3 text-right">Precio Unit. (Neto)</th>
                  <th className="p-3 text-right">Total Item (Neto)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(cotizacion.items || []).map((it, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="p-3 font-semibold text-[#363636]">{it.producto}</td>
                    <td className="p-3 text-center font-medium">{it.cantidad}</td>
                    <td className="p-3 text-right font-mono">${(it.precio_unitario || 0).toLocaleString('es-CL')}</td>
                    <td className="p-3 text-right font-mono font-bold text-[#363636]">${(it.total_item || 0).toLocaleString('es-CL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totales */}
          <div className="flex flex-col items-end space-y-1.5 pt-2">
            <div className="w-72 bg-white p-4 rounded-2xl border border-gray-200 space-y-1.5 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal Neto:</span>
                <span className="font-mono font-bold">${(cotizacion.subtotal || 0).toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>IVA (19% Legal Chile):</span>
                <span className="font-mono font-bold">${(cotizacion.monto_iva || 0).toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between font-black text-sm text-[#F7931F] pt-2 border-t border-gray-200">
                <span>TOTAL COTIZACIÓN:</span>
                <span className="font-mono">${(cotizacion.monto_total || 0).toLocaleString('es-CL')}</span>
              </div>
            </div>
          </div>

          {/* Condiciones Comerciales */}
          <div className="bg-orange-50/60 p-4 rounded-2xl border border-orange-200 space-y-1 text-xs">
            <span className="font-bold text-[#F7931F] block mb-1">Condiciones Comerciales</span>
            <p className="text-gray-700">· <strong>Plazo de Entrega:</strong> {cotizacion.plazo_entrega || '5 días hábiles'}</p>
            <p className="text-gray-700">· <strong>Condiciones de Pago:</strong> {cotizacion.condiciones_pago || '50% abono / 50% al despacho'}</p>
            <p className="text-gray-700">· <strong>Observaciones:</strong> {cotizacion.observaciones || 'Garantía oficial Hormiglass en prefabricados.'}</p>
          </div>
        </div>

        {/* Footer Modal */}
        <div className="flex items-center justify-between border-t border-gray-200 pt-4 shrink-0 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span>Documento listo para envío oficial a cliente</span>
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition"
          >
            Cerrar Preview
          </button>
        </div>
      </div>
    </div>
  );
}
