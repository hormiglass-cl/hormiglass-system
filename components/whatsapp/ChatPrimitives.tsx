'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { CalendarDays, FileText, IdCard, MoreHorizontal, Receipt, SendHorizontal } from 'lucide-react';
import { ActionMenuItem, CodeStamp, StatusBadge } from '../ui/crm';
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
    <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)} className={headerButton}>
      <MoreHorizontal size={18} aria-hidden /><span className={headerLabel}>Opciones</span>
    </button>
    {open && <div role="menu" onClick={() => setOpen(false)} className="absolute right-0 top-full z-30 mt-1 min-w-48 rounded-panel border border-line bg-surface p-1 text-ink shadow-[var(--hg-shadow-popover)]">
      {children}
    </div>}
  </div>;
}

/** Translucent pill on the accent bar; the dark on-accent text keeps contrast. */
const headerButton = 'inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-accent-line bg-surface px-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-muted aria-pressed:border-accent aria-pressed:bg-accent-line aria-pressed:text-ink';
/** Narrow chats (container query on the workspace) keep header buttons icon-only so the bar stays one row; the name stays for screen readers. */
const headerLabel = 'sr-only @min-[560px]:not-sr-only';
/** Narrow chats show only the key sentence of the status banner; the explanation stays for screen readers. */
const bannerDetail = 'sr-only @min-[520px]:not-sr-only';

/** Soft pastel avatars (L9): tinted background with the initials in the matching ink. */
const avatarTones = ['bg-success-soft text-success', 'bg-info-soft text-info', 'bg-violet-soft text-violet', 'bg-accent-soft text-accent-ink', 'bg-warning-soft text-warning'];
const avatarSizes = { md: 'h-10 w-10 text-sm', lg: 'h-[46px] w-[46px] text-[15px]', xl: 'h-20 w-20 text-2xl' };

/** Decorative initials avatar; the contact name is always rendered as text next to it. */
export function ContactAvatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' | 'xl' }) {
  const hash = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  const initials = name.split(' ').filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase();
  return <span aria-hidden className={clsx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
    avatarSizes[size], avatarTones[hash % avatarTones.length])}>{initials}</span>;
}

const fullFormat = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function ChatHeader({ chat, onAction, onHistory, detailsOpen = false, onToggleDetails }: {
  chat: Conversation;
  onAction: (action: ChatAction) => void;
  onHistory: () => void;
  detailsOpen?: boolean;
  /** Without it the host has no customer card, so no toggle renders. */
  onToggleDetails?: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const focusMenuTrigger = () => menu.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus();
  return <header className="flex min-h-[60px] shrink-0 items-center gap-x-3 rounded-t-[inherit] border-b border-accent-line bg-accent-soft px-3 py-2 text-sm text-ink">
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <ContactAvatar name={chat.contact.name} />
      <div className="min-w-0">
        <h2 className="truncate text-[15px] font-semibold leading-[1.125rem]">{chat.contact.name}</h2>
        <div className="flex items-center gap-x-2 overflow-hidden text-xs font-medium">
          <p className="t-num whitespace-nowrap">{chat.contact.phone}</p>
          <span title={`${chat.opportunity.code} · ${chat.opportunity.title}`} className="inline-flex shrink-0"><span className="sr-only">Oportunidad: </span><CodeStamp>{chat.opportunity.code}</CodeStamp><span className="sr-only"> · {chat.opportunity.title}</span></span>
        </div>
      </div>
    </div>
    <div className="ml-auto flex shrink-0 items-center gap-2">
      {onToggleDetails && <button type="button" aria-pressed={detailsOpen} aria-controls="chat-customer-details" onClick={onToggleDetails} className={headerButton}>
        <IdCard size={16} aria-hidden /><span className={headerLabel}>Ficha del cliente</span>
      </button>}
      <div ref={menu} onKeyDown={event => { if (event.key === 'Escape') focusMenuTrigger(); }} onClick={event => {
        // Keep focus usable when the menu unmounts its active item.
        if ((event.target as HTMLElement).closest('[role="menuitem"]')) focusMenuTrigger();
      }}>
        <ChatActionsMenu label="Opciones del chat">
          {chat.state === 'seller' && <ActionMenuItem onClick={() => onAction('release')}>Devolver al asistente</ActionMenuItem>}
          {chat.state !== 'closed' && <ActionMenuItem onClick={() => onAction('close')}>Cerrar</ActionMenuItem>}
          <ActionMenuItem onClick={onHistory}>Historial</ActionMenuItem>
        </ChatActionsMenu>
      </div>
    </div>
  </header>;
}

const bannerTones = {
  waiting: 'border-warning-line bg-warning-soft text-warning',
  assistant: 'border-info-line bg-info-soft text-info',
  seller: 'border-success-line bg-success-soft text-success',
  closed: 'border-line-subtle bg-surface-muted text-ink-muted',
} as const;

/** Next step for the seller, shown between the chat header and the thread. */
export function ChatStatusBanner({ chat, now, onAction }: {
  chat: Conversation; now: number; onAction: (action: ChatAction) => void;
}) {
  const firstName = chat.contact.name.split(' ')[0];
  const lastCustomerAt = chat.messages.filter(message => message.kind === 'customer').at(-1)?.at ?? now;
  const minutes = Math.max(1, Math.floor((now - lastCustomerAt) / 60000));
  const seconds = Math.max(0, Math.ceil(((chat.pausedUntil ?? now) - now) / 1000));
  const claim = <button type="button" onClick={() => onAction('claim')} className="inline-flex min-h-10 shrink-0 items-center rounded-full bg-accent px-4 text-[13px] font-semibold text-on-accent transition-colors hover:bg-accent-hover">Tomar chat</button>;
  const content = {
    waiting: <><strong className="font-semibold">{firstName} te espera hace {minutes} min.</strong><span className={bannerDetail}> Tómalo para responderle tú: el asistente se pausa 60 minutos.</span></>,
    assistant: <><strong className="font-semibold">{firstName} está con el asistente.</strong><span className={bannerDetail}> Tómalo si quieres responderle tú: el asistente se pausa 60 minutos.</span></>,
    // The countdown changes every second; aria-live="off" keeps the status region from announcing each tick.
    seller: <><strong className="font-semibold">Estás atendiendo a {firstName}.</strong><span className={bannerDetail}> Si no respondes en</span> <span aria-live="off" className="t-num font-semibold">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span><span className={bannerDetail}>, el asistente vuelve a tomar el chat.</span></>,
    closed: <>Conversación cerrada.<span className={bannerDetail}> Si el cliente vuelve a escribir, se reabre con el asistente.</span></>,
  }[chat.state];
  return <div role="status" className={clsx('flex shrink-0 items-center gap-x-3 border-b px-4 py-2', bannerTones[chat.state])}>
    <p className="min-w-0 flex-1 text-[13px] leading-snug">{content}</p>
    {(chat.state === 'waiting' || chat.state === 'assistant') && claim}
    {chat.state === 'seller' && <button type="button" onClick={() => onAction('release')} className="inline-flex min-h-10 shrink-0 items-center rounded-full border-2 border-success bg-surface px-4 text-[13px] font-semibold text-success transition-colors hover:bg-success-soft">Devolver al asistente</button>}
  </div>;
}

const authors: Record<ChatMessage['kind'], string> = {
  customer: 'Cliente', assistant: 'Asistente', seller: 'Tú', phone: 'Tú · desde el teléfono', file: 'Archivo de demostración', event: 'Evento del sistema',
};
const authorTones: Record<ChatMessage['kind'], string> = {
  customer: 'text-success', assistant: 'text-accent-ink', seller: 'text-success', phone: 'text-success', file: 'text-success', event: 'text-ink-muted',
};
const bubbleTones: Record<ChatMessage['kind'], string> = {
  customer: 'rounded-tl-md border border-line bg-surface',
  assistant: 'rounded-tr-md border border-accent-line bg-accent-soft',
  seller: 'rounded-tr-md border-2 border-success bg-surface',
  phone: 'rounded-tr-md border-2 border-success bg-surface',
  file: 'rounded-tr-md border-2 border-success bg-surface',
  event: '',
};
/** Ownership changes (claim, release, expiry, routing) read as info; other events stay neutral. */
const isHandoff = (text: string) => /tom|devolv|deriv|retom/i.test(text);

export function ChatThread({ messages, unreadAt, unreadCount = 0 }: {
  messages: ChatMessage[]; unreadAt?: string; unreadCount?: number;
}) {
  return <ol aria-label="Mensajes de demostración" className="min-h-32 space-y-3 px-4 py-4 text-sm leading-relaxed">
    {messages.map(message => {
      const incoming = message.kind === 'customer';
      return <Fragment key={message.id}>
        {message.id === unreadAt && <li className="flex items-center gap-3 py-1"><span aria-hidden className="h-px flex-1 bg-accent-line" /><span className="t-micro rounded-full border border-accent-line bg-surface px-2.5 py-0.5 text-accent-ink">{unreadCount} {unreadCount === 1 ? 'MENSAJE NUEVO' : 'MENSAJES NUEVOS'}</span><span aria-hidden className="h-px flex-1 bg-accent-line" /></li>}
        {message.kind === 'event'
          ? <li className="mx-auto grid w-fit max-w-[88%] justify-items-center text-center">
            <p className="sr-only">{authors.event}</p>
            <p className={clsx('whitespace-pre-wrap break-words rounded-full border px-3 py-1 text-xs font-medium', isHandoff(message.text) ? 'border-info-line bg-info-soft text-info' : 'border-line-subtle bg-surface text-ink-muted')}>{message.text}</p>
            <p className="t-micro t-num mt-1 font-medium text-ink-muted"><time dateTime={new Date(message.at).toISOString()}>{fullFormat.format(new Date(message.at))}</time></p>
          </li>
          : <li className={clsx('grid w-fit max-w-[85%] text-ink', incoming ? 'mr-auto justify-items-start' : 'ml-auto justify-items-end')}>
            <p className={clsx('t-micro mb-1 px-1', authorTones[message.kind])}>{authors[message.kind]}</p>
            <p className={clsx('w-fit max-w-full whitespace-pre-wrap rounded-2xl px-3 py-2 shadow-xs [overflow-wrap:anywhere]', bubbleTones[message.kind])}>
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

const quickAction = 'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

export function ChatComposer({ locked, onSend, onCreateQuote, onSelectDatasheet }: {
  locked: boolean;
  onSend: (text: string) => boolean;
  onCreateQuote?: () => void;
  onSelectDatasheet?: () => void;
}) {
  const [draft, setDraft] = useState('');
  return <form className="shrink-0 space-y-2 rounded-b-[inherit] border-t border-line-subtle bg-surface px-3 py-2.5 text-sm" onSubmit={event => { event.preventDefault(); if (onSend(draft)) setDraft(''); }}>
    <div className="flex gap-2 overflow-x-auto whitespace-nowrap" role="group" aria-label="Acciones rápidas">
      <button type="button" className={clsx(quickAction, 'border-info-line bg-info-soft text-info hover:border-info')} disabled={!onCreateQuote} onClick={onCreateQuote}><Receipt size={15} aria-hidden /><span>Cotizar</span></button>
      <button type="button" className={clsx(quickAction, 'border-violet-line bg-violet-soft text-violet hover:border-violet')} disabled={!onSelectDatasheet} onClick={onSelectDatasheet}><FileText size={15} aria-hidden /><span>Enviar ficha técnica</span></button>
      <button type="button" className={clsx(quickAction, 'border-success-line bg-success-soft text-success hover:border-success')} disabled={locked} title="Prepara un mensaje para coordinar la visita; no agenda automáticamente." onClick={() => setDraft('Agendar visita a terreno')}><CalendarDays size={15} aria-hidden /><span>Agendar visita</span></button>
    </div>
    <div className="flex items-center gap-2"><label className="block min-w-0 flex-1 text-ink">
      <span className="sr-only">Mensaje de demostración</span>
      <textarea rows={1} className="block h-11 min-h-0 w-full resize-none rounded-full border border-line bg-surface-muted px-4 py-2.5 text-sm leading-5 text-ink placeholder:text-ink-muted focus:border-accent focus:bg-surface focus:outline-none disabled:cursor-not-allowed" disabled={locked} value={draft} onChange={event => setDraft(event.target.value)} placeholder={locked ? 'Toma el chat para escribir' : 'Escribe tu respuesta…'} />
    </label><button type="submit" aria-label="Enviar" title="Enviar" disabled={locked} className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"><SendHorizontal size={18} aria-hidden /></button></div>
    {/* Short screens give the height to the messages; the demo note stays for screen readers. */}
    <details className="t-micro font-medium text-ink-muted [@media(max-height:640px)]:sr-only"><summary className="min-h-6 cursor-pointer py-1">Demo: no se envían mensajes reales.</summary><p>Se envía por WhatsApp desde el número de Hormiglass</p></details>
  </form>;
}
