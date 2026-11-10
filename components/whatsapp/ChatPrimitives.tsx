'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { CalendarDays, Clock3, FileText, MoreHorizontal, Receipt, SendHorizontal } from 'lucide-react';
import { ActionMenuItem, Button, CodeStamp, IconButton, StatusBadge } from '../ui/crm';
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

const avatarTones = [
  'border-accent-line bg-accent-soft text-accent-ink',
  'border-info-line bg-info-soft text-info',
  'border-success-line bg-success-soft text-success',
  'border-warning-line bg-warning-soft text-warning',
];

/** Decorative initials avatar; the contact name is always rendered as text next to it. */
export function ContactAvatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  const hash = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  const initials = name.split(' ').filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase();
  return <span aria-hidden className={clsx('inline-flex shrink-0 items-center justify-center rounded-full border font-semibold select-none',
    size === 'lg' ? 'h-11 w-11 text-sm' : 'h-9 w-9 text-xs', avatarTones[hash % avatarTones.length])}>{initials}</span>;
}

const fullFormat = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function ChatHeader({ chat, now, onAction, onHistory }: {
  chat: Conversation; now: number; onAction: (action: ChatAction) => void; onHistory: () => void;
}) {
  const seconds = Math.max(0, Math.ceil(((chat.pausedUntil ?? now) - now) / 1000));
  const menu = useRef<HTMLDivElement>(null);
  const focusMenuTrigger = () => menu.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus();
  const captions = { assistant: 'Asistente', waiting: 'Esperando', seller: 'Atendiendo tú', closed: 'Cerrada' };
  return <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-t-[inherit] border-b border-line-subtle bg-surface px-3 py-2 text-sm text-ink">
    <div className="flex min-w-[min(220px,100%)] flex-1 items-center gap-2.5">
      <ContactAvatar name={chat.contact.name} />
      <div className="min-w-0">
        <h2 className="truncate text-[15px] font-semibold leading-[1.125rem]">{chat.contact.name}</h2>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="t-caption t-num whitespace-nowrap">{chat.contact.phone}</p>
          <span title={`${chat.opportunity.code} · ${chat.opportunity.title}`} className="inline-flex shrink-0"><span className="sr-only">Oportunidad: </span><CodeStamp>{chat.opportunity.code}</CodeStamp><span className="sr-only"> · {chat.opportunity.title}</span></span>
        </div>
      </div>
    </div>
    <div className="ml-auto flex shrink-0 items-center gap-2">
      <span title={states[chat.state].label}><StatusBadge tone={states[chat.state].tone}><span aria-hidden>{captions[chat.state]}</span><span className="sr-only">{states[chat.state].label}</span></StatusBadge></span>
      {chat.state !== 'seller' && chat.state !== 'closed' && <Button size="sm" variant="primary" aria-label="Tomar conversación" title="Al tomarla, el asistente se pausa por 60 min y respondes tú." onClick={() => onAction('claim')}>Tomar chat</Button>}
      {chat.state === 'seller' ? <p title="Asistente en pausa · Si vence el plazo, el asistente retoma solo." className="t-micro inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-success-line bg-success-soft px-2 py-0.5 text-success"><Clock3 size={12} aria-hidden /><span className="sr-only">Asistente en pausa · </span><span className="t-num">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span><span className="sr-only">. Si vence el plazo, el asistente retoma solo.</span></p>
        : chat.state === 'closed' ? <p className="sr-only">Si el cliente vuelve a escribir, la conversación se reabre con el asistente y queda en la misma ficha.</p>
        : <p className="sr-only">Al tomarla, el asistente se pausa por 60 min y respondes tú.</p>}
      <div ref={menu} onKeyDown={event => { if (event.key === 'Escape') focusMenuTrigger(); }} onClick={event => {
        // Keep focus usable when the menu unmounts its active item.
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
  return <ol aria-label="Mensajes de demostración" className="min-h-32 space-y-3 px-4 py-4 text-sm leading-relaxed">
    {messages.map(message => {
      const incoming = message.kind === 'customer';
      return <Fragment key={message.id}>
        {message.id === unreadAt && <li className="flex items-center gap-3 py-1"><span aria-hidden className="h-px flex-1 bg-accent-line" /><span className="t-micro rounded-full border border-accent-line bg-accent-soft px-2.5 py-0.5 text-accent-ink">{unreadCount} {unreadCount === 1 ? 'MENSAJE NUEVO' : 'MENSAJES NUEVOS'}</span><span aria-hidden className="h-px flex-1 bg-accent-line" /></li>}
        {message.kind === 'event'
          ? <li className="mx-auto grid w-fit max-w-[88%] justify-items-center text-center">
            <p className="sr-only">{authors.event}</p>
            <p className="t-caption whitespace-pre-wrap break-words rounded-full border border-line-subtle bg-surface px-3 py-1">{message.text}</p>
            <p className="t-micro t-num mt-1 font-medium text-ink-muted"><time dateTime={new Date(message.at).toISOString()}>{fullFormat.format(new Date(message.at))}</time></p>
          </li>
          : <li className={clsx('grid w-fit max-w-[85%] text-ink', incoming ? 'mr-auto justify-items-start' : 'ml-auto justify-items-end')}>
            <p className="t-micro mb-1 px-1 text-ink-muted">{authors[message.kind]}</p>
            <p className={clsx('w-fit max-w-full whitespace-pre-wrap border px-3 py-2 shadow-xs [overflow-wrap:anywhere]',
              incoming ? 'rounded-2xl rounded-tl-md border-line bg-surface' : 'rounded-2xl rounded-tr-md border-accent-line bg-accent-soft')}>
              {message.kind === 'file' && <span aria-hidden>▤ </span>}{message.text}
            </p>
            {message.kind === 'file' && <p className="t-caption mt-1 px-1">Vista de ejemplo · archivo no disponible para descargar</p>}
            <p className="t-micro t-num mt-1 flex justify-end gap-1.5 px-1 font-medium text-ink-muted">
              <time dateTime={new Date(message.at).toISOString()}>{fullFormat.format(new Date(message.at))}</time>
              {message.delivery && <span aria-label={message.delivery === 'read' ? 'Leído' : 'Enviado'} className={message.delivery === 'read' ? 'text-info' : undefined}>{message.delivery === 'read' ? '✓✓' : '✓'}</span>}
            </p>
          </li>}
      </Fragment>;
    })}
  </ol>;
}

export function ChatComposer({ locked, onSend, onCreateQuote, onSelectDatasheet }: {
  locked: boolean;
  onSend: (text: string) => boolean;
  onCreateQuote?: () => void;
  onSelectDatasheet?: () => void;
}) {
  const [draft, setDraft] = useState('');
  return <form className="shrink-0 space-y-2 rounded-b-[inherit] border-t border-line-subtle bg-surface px-3 py-2.5 text-sm" onSubmit={event => { event.preventDefault(); if (onSend(draft)) setDraft(''); }}>
    <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap [&>button]:shrink-0" role="group" aria-label="Atajos comerciales">
      <Button size="sm" variant="subtle" icon={Receipt} disabled={!onCreateQuote} onClick={onCreateQuote}>Crear cotización</Button>
      <Button size="sm" variant="subtle" icon={FileText} disabled={!onSelectDatasheet} onClick={onSelectDatasheet}>Enviar ficha técnica</Button>
      <Button size="sm" variant="subtle" icon={CalendarDays} disabled={locked} title="Prepara un mensaje para coordinar la visita; no agenda automáticamente." onClick={() => setDraft('Agendar visita a terreno')}>Agendar visita a terreno</Button>
    </div>
    <div className="flex items-end gap-2"><label className="block min-w-0 flex-1 text-ink">
      <span className="sr-only">Mensaje de demostración</span>
      <textarea rows={2} className="hg-field block h-14 min-h-0 w-full resize-none text-sm" disabled={locked} value={draft} onChange={event => setDraft(event.target.value)} placeholder={locked ? 'Toma la conversación para responder al cliente.' : 'Escribe tu respuesta…'} />
    </label><Button type="submit" variant="primary" icon={SendHorizontal} disabled={locked} className="h-14 shrink-0"><span className="sr-only sm:not-sr-only">Enviar demo</span></Button></div>
    {locked && <p className="sr-only">Toma la conversación para responder al cliente.</p>}
    <details className="t-micro font-medium text-ink-muted"><summary className="min-h-6 cursor-pointer py-1">Demo: no se envían mensajes reales.</summary><p>Se envía por WhatsApp desde el número de Hormiglass</p></details>
  </form>;
}
