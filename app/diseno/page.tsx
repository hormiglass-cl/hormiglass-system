'use client';

import { useState } from 'react';
import { FileText, Plus, Trash2, Truck, Upload } from 'lucide-react';
import {
  ActionMenu, ActionMenuItem, Button, CodeStamp, DataTable, Dialog, EmptyState, Field, FilterBar,
  FilterSelect, IconButton, PageHeader, Pagination, Panel, SearchField, Select, Sheet, StageRail,
  StatusBadge, SummaryLine, Tabs, TextInput, useConfirm, useToast,
} from '../../components/ui';

/* Catálogo vivo del sistema de diseño (plans/plan-rediseno-hig.md). No aparece en la navegación. */

const swatches = [
  ['Fondo', 'bg-app', 'F6F5F2'], ['Panel', 'bg-surface', 'FFFFFF'], ['Panel suave', 'bg-surface-muted', 'EEEDE8'],
  ['Texto', 'bg-ink', '363636'], ['Texto secundario', 'bg-ink-muted', '5C5A55'], ['Naranja marca', 'bg-accent', 'F7931F'],
  ['Naranja texto', 'bg-accent-ink', 'A14A06'], ['Éxito', 'bg-success', '1E6B45'], ['Alerta', 'bg-warning', '8A5300'],
  ['Peligro', 'bg-danger', 'A8261F'], ['Info', 'bg-info', '2C5A94'],
] as const;

export default function DisenoPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const [tab, setTab] = useState('componentes');
  const [stage, setStage] = useState(2);
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sistema de diseño"
        description="Catálogo de tokens y componentes base. Fase 0 del rediseño."
        actions={<>
          <Button icon={Upload}>Importar</Button>
          <Button variant="primary" icon={Plus}>Nueva oportunidad</Button>
        </>}
      />

      <Tabs active={tab} onChange={setTab} items={[{ id: 'componentes', label: 'Componentes' }, { id: 'tokens', label: 'Tokens', count: swatches.length }]} />

      {tab === 'tokens' ? (
        <div className="space-y-6">
          <Panel title="Colores">
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
              {swatches.map(([name, cls, hex]) => (
                <div key={name}>
                  <div className={`h-14 rounded-control border border-line ${cls}`} />
                  <p className="mt-1.5 text-[13px] font-semibold">{name}</p>
                  <p className="t-caption font-mono">#{hex}</p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Tipografía">
            <div className="space-y-3 p-4">
              <p className="t-page">Título de página · 22/28 · 700</p>
              <p className="t-section">Título de sección · 16/22 · 600</p>
              <p className="t-body">Texto general · 14/20 · 400. La guía de despacho se emite al confirmar la carga.</p>
              <p className="t-table">Celda de tabla · 13/18 · 400</p>
              <p className="t-caption">Metadato · 12/16 · 500</p>
              <p className="t-micro">Badge · 11/14 · 600 (mínimo absoluto)</p>
              <p className="t-figure">$3.867.500</p>
              <p>Códigos: <CodeStamp>OP-2026-6056</CodeStamp> <CodeStamp>PV-2026-0003</CodeStamp> <CodeStamp>BOT-300303155</CodeStamp></p>
            </div>
          </Panel>
        </div>
      ) : (
        <div className="space-y-6">
          <Panel title="Riel de obra (firma)" actions={<>
            <Button size="sm" onClick={() => setStage((s) => Math.max(0, s - 1))}>Retroceder</Button>
            <Button size="sm" onClick={() => setStage((s) => Math.min(6, s + 1))}>Avanzar etapa</Button>
          </>}>
            <div className="space-y-5 p-4">
              <StageRail current={stage} />
              <div className="flex items-center gap-3">
                <CodeStamp>OP-2026-6056</CodeStamp>
                <span className="text-sm font-semibold">Liceo las Condes</span>
                <StageRail current={stage} size="mini" />
              </div>
            </div>
          </Panel>

          <Panel title="Botones">
            <div className="flex flex-wrap items-center gap-2 p-4">
              <Button variant="primary" icon={Plus}>Registrar abono</Button>
              <Button icon={FileText}>Ver cotización</Button>
              <Button variant="subtle">Cancelar</Button>
              <Button variant="destructive" icon={Trash2}>Eliminar</Button>
              <Button variant="primary" disabled>Guardando…</Button>
              <IconButton icon={Truck} label="Programar despacho" />
              <ActionMenu>
                <ActionMenuItem icon={FileText}>Duplicar</ActionMenuItem>
                <ActionMenuItem icon={Trash2} destructive>Eliminar</ActionMenuItem>
              </ActionMenu>
            </div>
          </Panel>

          <Panel title="Estados">
            <div className="flex flex-wrap gap-2 p-4">
              <StatusBadge tone="success">Pagado</StatusBadge>
              <StatusBadge tone="warning">Pendiente de validación</StatusBadge>
              <StatusBadge tone="danger">Rechazado</StatusBadge>
              <StatusBadge tone="info">Programado</StatusBadge>
              <StatusBadge tone="accent" icon={false}>Fabricación propia</StatusBadge>
              <StatusBadge>Borrador</StatusBadge>
            </div>
          </Panel>

          <Panel title="Lista con resumen accionable">
            <div className="space-y-3 p-4">
              <FilterBar>
                <SearchField placeholder="Buscar por folio, cliente u obra" />
                <FilterSelect label="Estado"><option>Todos</option><option>En curso</option></FilterSelect>
                <FilterSelect label="Vendedor"><option>Todos</option><option>Jesus</option></FilterSelect>
              </FilterBar>
              <SummaryLine items={[
                { label: 'en curso', value: 12, onClick: () => setFiltro('curso'), active: filtro === 'curso' },
                { label: 'por validar', value: 3, tone: 'warning', onClick: () => setFiltro('validar'), active: filtro === 'validar' },
                { label: 'despachos atrasados', value: 1, tone: 'danger', onClick: () => setFiltro('atrasados'), active: filtro === 'atrasados' },
                { label: 'por cobrar', value: '$3.567.500' },
              ]} />
              <DataTable columns={<tr><th>Folio</th><th>Obra</th><th>Etapa</th><th>Estado</th><th className="text-right">Monto</th></tr>}>
                {[['OP-2026-6056', 'Liceo las Condes', 2, 'warning', 'Pendiente de validación', '$3.867.500'],
                  ['OP-2026-6041', 'Condominio Los Robles', 4, 'success', 'Pagado', '$1.240.000'],
                  ['OP-2026-6032', 'Municipalidad de Maipú', 0, 'neutral', 'Borrador', '$860.900']].map(([folio, obra, etapa, tone, estado, monto]) => (
                  <tr key={folio as string}>
                    <td><CodeStamp>{folio}</CodeStamp></td>
                    <td className="font-semibold">{obra}</td>
                    <td><StageRail current={etapa as number} size="mini" /></td>
                    <td><StatusBadge tone={tone as 'success'}>{estado}</StatusBadge></td>
                    <td className="t-num text-right font-semibold">{monto}</td>
                  </tr>
                ))}
              </DataTable>
              <div className="hg-panel"><Pagination currentPage={page} totalItems={248} itemsPerPage={perPage} onPageChange={setPage} onItemsPerPageChange={setPerPage} /></div>
            </div>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Formulario">
              <div className="grid gap-4 p-4">
                <Field label="Cliente" required hint="Razón social como aparece en la factura.">
                  {(props) => <TextInput {...props} placeholder="Sociedad Constructora SpA" />}
                </Field>
                <Field label="RUT" error="Revisa el dígito verificador: debería ser 7.">
                  {(props) => <TextInput {...props} defaultValue="76.123.456-K" />}
                </Field>
                <Field label="Condición de pago">
                  {(props) => <Select {...props}><option>Pago total</option><option>50% anticipo</option></Select>}
                </Field>
              </div>
            </Panel>
            <Panel title="Diálogos y avisos">
              <div className="flex flex-wrap gap-2 p-4">
                <Button onClick={() => setDialog(true)}>Abrir diálogo</Button>
                <Button onClick={() => setSheet(true)}>Abrir hoja lateral</Button>
                <Button variant="destructive" onClick={async () => {
                  const ok = await confirm({ title: '¿Eliminar la oportunidad OP-2026-6056?', message: 'Se eliminarán sus cotizaciones y abonos. No se puede deshacer.', confirmLabel: 'Eliminar', destructive: true });
                  toast(ok ? { message: 'Oportunidad eliminada', tone: 'danger' } : { message: 'Se canceló la eliminación', tone: 'info' });
                }}>Confirmar eliminación</Button>
                <Button onClick={() => toast({ message: 'Abono registrado. Queda pendiente de validación en Caja.', action: { label: 'Deshacer', onClick: () => toast({ message: 'Abono descartado', tone: 'info' }) } })}>Mostrar aviso</Button>
              </div>
              <EmptyState icon={Truck} title="Sin despachos esta semana" description="Cuando programes un despacho desde una oportunidad aparecerá aquí." action={<Button variant="primary" icon={Plus}>Programar despacho</Button>} />
            </Panel>
          </div>
        </div>
      )}

      <Dialog open={dialog} onClose={() => setDialog(false)} title="Registrar abono" description="OP-2026-6056 · Liceo las Condes"
        footer={<><Button variant="subtle" onClick={() => setDialog(false)}>Cancelar</Button><Button variant="primary" onClick={() => { setDialog(false); toast('Abono registrado'); }}>Registrar abono</Button></>}>
        <Field label="Monto">{(props) => <TextInput {...props} inputMode="numeric" placeholder="$0" />}</Field>
      </Dialog>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Caso PV-2026-0003"
        footer={<Button variant="primary" onClick={() => setSheet(false)}>Guardar cambios</Button>}>
        <div className="space-y-4">
          <StatusBadge tone="info">Programado</StatusBadge>
          <p className="t-body">Fisura en esquinas de pastelones. Visita técnica programada para el jueves.</p>
        </div>
      </Sheet>
    </div>
  );
}
