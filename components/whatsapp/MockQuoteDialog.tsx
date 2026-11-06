'use client';

import { useState } from 'react';
import { Button, Dialog, Field, TextInput } from '../ui/crm';
import type { Conversation } from '../../lib/whatsapp/types';
import { calculateQuote, createQuoteItem, type QuoteDraftItem } from '../../lib/whatsapp/quote-draft';

const clp = (amount: number) => `$${new Intl.NumberFormat('es-CL').format(amount)}`;

/** Keep mounted and key by chat in the parent: closing preserves this local-only draft. */
export function MockQuoteDialog({ chat, open, onClose }: {
  chat: Conversation;
  open: boolean;
  onClose: () => void;
}) {
  const [items, setItems] = useState<QuoteDraftItem[]>(() => [createQuoteItem()]);
  const [attempted, setAttempted] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const calculation = calculateQuote(items);

  function changeItems(next: QuoteDraftItem[]) {
    setItems(next);
    setAttempted(false);
    setPrepared(false);
  }
  function update(index: number, field: keyof QuoteDraftItem, value: string) {
    changeItems(items.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }
  function prepare() {
    setAttempted(true);
    setPrepared(calculation.ok);
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Crear cotización demo"
      description="Demo · borrador local no persistente. Se pierde al salir de esta pantalla; no se envía al cliente.">
      <div className="space-y-5 text-sm text-ink">
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <Field label="Cliente">{props => <TextInput {...props} readOnly value={chat.contact.company} />}</Field>
          <Field label="Contacto">{props => <TextInput {...props} readOnly value={chat.contact.name} />}</Field>
          <div className="min-w-0 sm:col-span-2">
            <Field label="Oportunidad">{props => <TextInput {...props} readOnly value={chat.opportunity.title} />}</Field>
          </div>
        </div>
        <p className="text-ink-muted">Ingresa los ítems y precios acordados. No se sugieren productos ni valores desde el chat. Puedes preparar este borrador sin tomar la conversación.</p>
        <div className="space-y-3">
          {items.map((item, index) => (
            <fieldset key={index} className="min-w-0 space-y-3 rounded-control border border-line p-3">
              <legend className="px-1 font-semibold">Ítem {index + 1}</legend>
              <Field label="Descripción" required>{props => <TextInput {...props} required value={item.description}
                onChange={event => update(index, 'description', event.target.value)} />}</Field>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <Field label="Cantidad" required>{props => <TextInput {...props} type="number" step="any" min="0" required
                  value={item.quantity} onChange={event => update(index, 'quantity', event.target.value)} />}</Field>
                <Field label="Precio unitario (CLP)" required>{props => <TextInput {...props} type="number" step="any" min="0" required
                  value={item.unitPrice} onChange={event => update(index, 'unitPrice', event.target.value)} />}</Field>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 break-words text-ink-muted">Subtotal: {calculation.ok ? clp(calculation.lines[index]) : '—'}</p>
                <Button size="sm" variant="subtle" aria-label={`Quitar ítem ${index + 1}`} disabled={items.length === 1}
                  onClick={() => changeItems(items.filter((_, i) => i !== index))}>Quitar ítem</Button>
              </div>
            </fieldset>
          ))}
          <Button onClick={() => changeItems([...items, createQuoteItem()])}>Agregar ítem</Button>
        </div>
        <dl className="space-y-2 rounded-control border border-line bg-surface-muted p-3">
          {([
            ['Neto', 'Neto CLP', calculation.ok ? calculation.net : null],
            ['IVA 19%', 'IVA 19% CLP', calculation.ok ? calculation.iva : null],
            ['Total CLP', 'Total CLP', calculation.ok ? calculation.total : null],
          ] as const).map(([label, accessible, value]) => (
            <div key={label} className="flex flex-wrap justify-between gap-2">
              <dt>{label}</dt><dd aria-label={accessible} className="min-w-0 break-all font-semibold">{value === null ? '—' : clp(value)}</dd>
            </div>
          ))}
        </dl>
        {!calculation.ok && (attempted || calculation.error.includes('rango seguro')) && (
          <p role="alert" className="text-danger">{calculation.error}</p>
        )}
        {prepared && calculation.ok && (
          <div role="status" className="space-y-1 rounded-control border border-success-line bg-success-soft p-3 text-success">
            <p className="font-semibold">Cotización demo preparada · {clp(calculation.total)} CLP</p>
            <p>No se creó un registro CRM, no tiene número oficial y no se envió al cliente. Solo permanece en esta pantalla.</p>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" className="max-w-full whitespace-normal" onClick={prepare}>Guardar cotización demo</Button>
        </div>
      </div>
    </Dialog>
  );
}
