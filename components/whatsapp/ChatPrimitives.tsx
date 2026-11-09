'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { ActionMenuItem, Button, IconButton, StatusBadge } from '../ui/crm';
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

/**
 * Inline menu for the chat header. The shared ActionMenu portals to <body>, which
 * breaks Tab order from its trigger; rendering in place keeps keyboard access.
 */
function ChatActionsMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);

  return <div ref={ref} className="relative inline-flex">
    <IconButton icon={MoreHorizontal} label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)} />
    {open && <div role="menu" onClick={() => setOpen(false)} className="absolute right-0 top-full z-30 mt-1 min-w-48 rounded-panel border border-line bg-surface p-1 shadow-[var(--hg-shadow-popover)]">
      {children}
    </div>}
  </div>;
}

export function ChatHeader({ chat, now, onAction, onHistory }: {
  chat: Conversation; now: number; onAction: (action: ChatAction) => void; onHistory: () => void;
}) {
  const seconds = Math.max(0, Math.ceil(((chat.pausedUntil ?? now) - now) / 1000));
  const menu = useRef<HTMLDivElement>(null);
  const focusMenuTrigger = () => menu.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus();
  const captions = { assistant: 'Asistente', waiting: 'Esperando', seller: 'Atendiendo tú', closed: 'Cerrada' };
  return <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line bg-surface px-3 py-2 text-sm text-ink">
    <div className="flex min-w-[220px] flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <h2 className="font-semibold leading-5">{chat.contact.name}</h2>
      <p className="whitespace-nowrap text-[11px] leading-4 text-ink-muted">{chat.contact.phone}</p>
      <span title={`${chat.opportunity.code} · ${chat.opportunity.title}`} className="inline-flex shrink-0 items-center rounded-control bg-accent-soft px-1.5 py-0.5 text-[11px] leading-4 text-accent-ink"><span className="sr-only">Oportunidad: </span><span>{chat.opportunity.code}</span><span className="sr-only"> · {chat.opportunity.title}</span></span>
    </div>
    <div className="ml-auto flex shrink-0 items-center gap-1.5 [&>button]:min-h-7 [&>button]:px-2 [&>button]:text-xs">
      <span title={states[chat.state].label}><StatusBadge tone={states[chat.state].tone}><span aria-hidden>{captions[chat.state]}</span><span className="sr-only">{states[chat.state].label}</span></StatusBadge></span>
      {chat.state !== 'seller' && chat.state !== 'closed' && <Button size="sm" variant="primary" aria-label="Tomar conversación" title="Al tomarla, el asistente se pausa por 60 min y respondes tú." onClick={() => onAction('claim')}>Tomar chat</Button>}
      {chat.state === 'seller' ? <p title="Asistente en pausa · Si vence el plazo, el asistente retoma solo." className="whitespace-nowrap text-[11px] leading-4 text-success"><span className="sr-only">Asistente en pausa · </span><span className="font-mono">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span><span className="sr-only">. Si vence el plazo, el asistente retoma solo.</span></p>
        : chat.state === 'closed' ? <p className="sr-only">Si el cliente vuelve a escribir, la conversación se reabre con el asistente y queda en la misma ficha.</p>
        : <p className="sr-only">Al tomarla, el asistente se pausa por 60 min y respondes tú.</p>}
      <div ref={menu} onKeyDown={event => { if (event.key === 'Escape') focusMenuTrigger(); }} onClick={event => {
        // Keep focus usable when the shared menu unmounts its active item.
        if ((event.target as HTMLElement).closest('[role="menuitem"]')) focusMenuTrigger();
      }}>
        <ChatActionsMenu label="Acciones del chat">
          {chat.state === 'seller' && <ActionMenuItem onClick={() => onAction('release')}>Devolver al asistente</ActionMenuItem>}
          {chat.state !== 'closed' && <ActionMenuItem onClick={() => onAction('close')}>Cerrar</ActionMenuItem>}
          <ActionMenuItem onClick={onHistory}>Historial</ActionMenuItem>
        </ChatActionsMenu>
      </div>
    </div>
  </header>;
}

const authors: Record<ChatMessage['kind'], string> = {
  customer: 'Cliente', assistant: 'Asistente', seller: 'Vendedor desde el CRM', phone: 'Enviado desde el teléfono', file: 'Archivo de demostración', event: 'Evento del sistema',
};

export function ChatThread({ messages, unreadAt, unreadCount = 0 }: {
  messages: ChatMessage[]; unreadAt?: string; unreadCount?: number;
}) {
  return <ol aria-label="Mensajes de demostración" className="min-h-32 space-y-2.5 p-3 text-sm leading-relaxed">
    {messages.map(message => <Fragment key={message.id}>
      {message.id === unreadAt && <li className="border-y border-accent-line bg-accent-soft py-1 text-center text-xs font-semibold text-accent-ink">{unreadCount} {unreadCount === 1 ? 'MENSAJE NUEVO' : 'MENSAJES NUEVOS'}</li>}
      <li className={message.kind === 'event' ? 'px-2 py-1 text-center text-xs text-ink-muted' : `grid w-fit max-w-[88%] text-ink ${message.kind === 'customer' ? 'mr-auto justify-items-start' : 'ml-auto justify-items-end'}`}>
        <p className={message.kind === 'event' ? 'sr-only' : 'mb-0.5 text-[11px] font-semibold'}>{authors[message.kind]}</p>
        <p className={message.kind === 'event' ? 'whitespace-pre-wrap break-words' : `w-fit max-w-full whitespace-pre-wrap [overflow-wrap:anywhere] rounded-panel border border-line px-2.5 py-1.5 ${message.kind === 'customer' ? 'bg-surface' : 'bg-accent-soft'}`}>{message.kind === 'file' && <span aria-hidden>▤ </span>}{message.text}</p>
        {message.kind === 'file' && <p className="mt-1 text-xs text-ink-muted">Vista de ejemplo · archivo no disponible para descargar</p>}
        <p className="mt-1 flex justify-end gap-2 text-[11px] text-ink-muted">
          <time dateTime={new Date(message.at).toISOString()}>{new Date(message.at).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
          {message.delivery && <span aria-label={message.delivery === 'read' ? 'Leído' : 'Enviado'}>{message.delivery === 'read' ? '✓✓' : '✓'}</span>}
        </p>
      </li>
    </Fragment>)}
  </ol>;
}

export function ChatComposer({ locked, onSend, onCreateQuote, onSelectDatasheet }: {
  locked: boolean;
  onSend: (text: string) => boolean;
  onCreateQuote?: () => void;
  onSelectDatasheet?: () => void;
}) {
  const [draft, setDraft] = useState('');
  return <form className="shrink-0 space-y-1 border-t border-line bg-surface p-2 text-sm" onSubmit={event => { event.preventDefault(); if (onSend(draft)) setDraft(''); }}>
    <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap [&>button]:shrink-0 [&>button]:text-xs" role="group" aria-label="Atajos comerciales">
      <Button size="sm" disabled={!onCreateQuote} onClick={onCreateQuote}>Crear cotización</Button>
      <Button size="sm" disabled={!onSelectDatasheet} onClick={onSelectDatasheet}>Enviar ficha técnica</Button>
      <Button size="sm" disabled={locked} title="Prepara un mensaje para coordinar la visita; no agenda automáticamente." onClick={() => setDraft('Agendar visita a terreno')}>Agendar visita a terreno</Button>
    </div>
    <div className="flex items-end gap-2"><label className="block min-w-0 flex-1 text-ink">
      <span className="sr-only">Mensaje de demostración</span>
      <textarea rows={2} className="hg-field block h-14 min-h-0 w-full resize-none text-sm" disabled={locked} value={draft} onChange={event => setDraft(event.target.value)} placeholder={locked ? 'Toma la conversación para responder al cliente.' : 'Escribe tu respuesta…'} />
    </label><Button size="sm" type="submit" variant="primary" disabled={locked}>Enviar demo</Button></div>
    {locked && <p className="sr-only">Toma la conversación para responder al cliente.</p>}
    <details className="text-[11px] leading-4 text-ink-muted"><summary className="min-h-6 cursor-pointer py-1">Demo: no se envían mensajes reales.</summary><p>Se envía por WhatsApp desde el número de Hormiglass</p></details>
  </form>;
}
