'use client';

import { Fragment, useState } from 'react';
import { Button, StatusBadge } from '../ui/crm';
import type { ChatMessage, Conversation, ConversationState } from '../../lib/whatsapp/types';

const states = {
  assistant: { label: '1 · Con asistente', tone: 'info' },
  waiting: { label: '2 · Esperando vendedor', tone: 'warning' },
  seller: { label: '3 · Atendiendo tú', tone: 'success' },
  closed: { label: '4 · Cerrada', tone: 'neutral' },
} as const;

export function ChatStateBadge({ state }: { state: ConversationState }) {
  return <StatusBadge tone={states[state].tone}>{states[state].label}</StatusBadge>;
}

export type ChatAction = 'claim' | 'release' | 'close';

export function ChatHeader({ chat, now, onAction, onHistory }: {
  chat: Conversation; now: number; onAction: (action: ChatAction) => void; onHistory: () => void;
}) {
  const seconds = Math.max(0, Math.ceil(((chat.pausedUntil ?? now) - now) / 1000));
  return <header className="shrink-0 space-y-2 border-b border-line p-3 text-sm text-ink">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h2 className="font-semibold">{chat.contact.name}</h2><p className="text-ink-muted">{chat.contact.phone}</p></div>
      <ChatStateBadge state={chat.state} />
    </div>
    {chat.state === 'seller' ? <p className="text-success">Asistente en pausa · <span className="font-mono">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>. Si vence el plazo, el asistente retoma solo.</p>
      : chat.state === 'closed' ? <p className="text-ink-muted">Si el cliente vuelve a escribir, la conversación se reabre con el asistente y queda en la misma ficha.</p>
      : <p className="text-ink-muted">Al tomarla, el asistente se pausa por 60 min y respondes tú.</p>}
    <div className="flex flex-wrap gap-2">
      {chat.state !== 'closed' && (chat.state === 'seller'
        ? <Button size="sm" onClick={() => onAction('release')}>Devolver al asistente</Button>
        : <Button size="sm" variant="primary" onClick={() => onAction('claim')}>Tomar conversación</Button>)}
      {chat.state !== 'closed' && <Button size="sm" onClick={() => onAction('close')}>Cerrar</Button>}
      <Button size="sm" onClick={onHistory}>Ver historial</Button>
    </div>
  </header>;
}

const authors: Record<ChatMessage['kind'], string> = {
  customer: 'Cliente', assistant: 'Asistente', seller: 'Vendedor desde el CRM', phone: 'Enviado desde el teléfono', file: 'Archivo de demostración', event: 'Evento del sistema',
};

export function ChatThread({ messages, unreadAt, unreadCount = 0 }: {
  messages: ChatMessage[]; unreadAt?: string; unreadCount?: number;
}) {
  return <ol aria-label="Mensajes de demostración" className="min-h-32 space-y-3 p-4 text-sm">
    {messages.map(message => <Fragment key={message.id}>
      {message.id === unreadAt && <li className="border-y border-accent-line bg-accent-soft py-2 text-center text-xs font-semibold text-accent-ink">{unreadCount} {unreadCount === 1 ? 'MENSAJE NUEVO' : 'MENSAJES NUEVOS'}</li>}
      <li className={message.kind === 'event' ? 'px-2 py-1 text-center text-xs text-ink-muted' : `max-w-[92%] rounded-panel border border-line p-3 ${message.kind === 'customer' ? 'mr-auto bg-surface text-ink' : 'ml-auto bg-accent-soft text-ink'}`}>
        <p className="mb-1 text-[11px] font-semibold">{authors[message.kind]}</p>
        <p className="whitespace-pre-wrap break-words">{message.kind === 'file' && <span aria-hidden>▤ </span>}{message.text}</p>
        {message.kind === 'file' && <p className="mt-1 text-xs text-ink-muted">Vista de ejemplo · archivo no disponible para descargar</p>}
        <p className="mt-1 flex justify-end gap-2 text-[11px] text-ink-muted">
          <time dateTime={new Date(message.at).toISOString()}>{new Date(message.at).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
          {message.delivery && <span aria-label={message.delivery === 'read' ? 'Leído' : 'Enviado'}>{message.delivery === 'read' ? '✓✓' : '✓'}</span>}
        </p>
      </li>
    </Fragment>)}
  </ol>;
}

export function ChatComposer({ locked, onSend }: { locked: boolean; onSend: (text: string) => boolean }) {
  const [draft, setDraft] = useState('');
  return <form className="shrink-0 space-y-2 border-t border-line bg-surface p-3 text-sm" onSubmit={event => { event.preventDefault(); if (onSend(draft)) setDraft(''); }}>
    <div className="flex gap-2 overflow-x-auto whitespace-nowrap pb-1 [&>button]:shrink-0" role="group" aria-label="Respuestas rápidas">
      {['Agendar visita a terreno', 'Enviar ficha técnica', 'Cotización en preparación'].map(reply => <Button key={reply} size="sm" disabled={locked} onClick={() => setDraft(reply)}>{reply}</Button>)}
    </div>
    <label className="block text-ink">
      <span className="mb-1 block font-semibold">Mensaje de demostración</span>
      <textarea rows={2} className="hg-field h-14 min-h-0 w-full resize-none" disabled={locked} value={draft} onChange={event => setDraft(event.target.value)} placeholder={locked ? 'Toma la conversación para responder al cliente.' : 'Escribe tu respuesta…'} />
    </label>
    {locked && <p className="text-xs text-ink-muted">Toma la conversación para responder al cliente.</p>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[11px] text-ink-muted">Se envía por WhatsApp desde el número de Hormiglass<br /><strong>Demo: no se envían mensajes reales.</strong></p>
      <Button size="sm" type="submit" variant="primary" disabled={locked}>Enviar demo</Button>
    </div>
  </form>;
}
