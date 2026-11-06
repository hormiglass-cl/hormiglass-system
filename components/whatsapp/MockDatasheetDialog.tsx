'use client';

import { useState } from 'react';
import { Button, Dialog, Field, Select } from '../ui/crm';
import { datasheetMessage, findMockDatasheet, mockDatasheets } from '../../lib/whatsapp/mock-documents';
import type { Conversation } from '../../lib/whatsapp/types';

/** Preview only. The caller owns permission/deadline revalidation and mock sending. */
export function MockDatasheetDialog({ chat, open, onClose, canSend, onConfirm }: {
  chat: Conversation;
  open: boolean;
  onClose: () => void;
  canSend: boolean;
  onConfirm: (documentId: string) => boolean;
}) {
  const [documentId, setDocumentId] = useState('');
  const [error, setError] = useState('');
  const selected = findMockDatasheet(documentId);
  const unavailable = !canSend || chat.state !== 'seller';
  const reason = chat.state === 'closed'
    ? 'La conversación está cerrada. Solo puedes revisar la vista previa.'
    : chat.state !== 'seller'
      ? 'Toma la conversación para confirmar el envío demo.'
      : 'Tu plazo para responder venció. Toma la conversación nuevamente para confirmar el envío demo.';

  function close() {
    setDocumentId('');
    setError('');
    onClose();
  }

  function confirm() {
    if (!selected || unavailable) return;
    if (onConfirm(selected.id)) close();
    else setError('No se confirmó el envío demo. Revisa el estado de la conversación e inténtalo de nuevo.');
  }

  return <Dialog open={open} onClose={close} title="Enviar ficha técnica"
    description="Demo local: no envía a WhatsApp ni genera un PDF oficial."
    footer={<div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
      <Button onClick={close}>Cancelar</Button>
      <Button variant="primary" disabled={!selected || unavailable} onClick={confirm}
        aria-describedby={unavailable ? 'datasheet-send-reason' : undefined}
        className="disabled:cursor-not-allowed disabled:opacity-50">Confirmar envío demo</Button>
    </div>}>
    <div className="space-y-4 break-words text-sm text-ink">
      <p>Para: <strong className="font-semibold">{chat.contact.name}</strong> · {chat.opportunity.code}</p>
      <Field label="Producto y documento" hint="Elige una muestra para revisarla. Seleccionar no envía nada.">
        {props => <Select {...props} value={documentId} onChange={event => {
          setDocumentId(event.target.value);
          setError('');
        }}>
          <option value="">Selecciona un producto demo</option>
          {mockDatasheets.map(document => <option key={document.id} value={document.id}>{document.product}</option>)}
        </Select>}
      </Field>
      {selected ? <>
        <section aria-label="Vista previa ficticia" className="space-y-2 rounded-panel border border-line bg-surface-muted p-3">
          <h3 className="font-semibold">{selected.name}</h3>
          <p className="text-ink-muted">{selected.description}</p>
          <ul className="list-disc space-y-2 pl-4">
            {selected.preview.map(line => <li key={line}>{line}</li>)}
          </ul>
          <p className="text-ink-muted">Vista previa de texto; no hay archivo PDF para abrir o descargar.</p>
        </section>
        <section aria-label="Mensaje previo al envío" className="space-y-2 rounded-panel border border-line p-3">
          <h3 className="font-semibold">Mensaje previo al envío</h3>
          <p>{datasheetMessage(selected)}</p>
        </section>
      </> : <p className="text-ink-muted">Selecciona un documento para ver su contenido y el mensaje antes de confirmar.</p>}
      {unavailable && <p id="datasheet-send-reason" className="text-ink-muted">{reason}</p>}
      {error && <p role="alert" className="rounded-control border border-danger-line bg-danger-soft p-3 text-danger">{error}</p>}
    </div>
  </Dialog>;
}
