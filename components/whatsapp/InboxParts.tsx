'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { BellRing, Clock3, Info, Lock, Search, Sparkles, UserRound, X, type LucideIcon } from 'lucide-react';
import { Button, EmptyState } from '../ui/crm';
import type { ChatNotice, Conversation, ConversationState, MessageKind } from '../../lib/whatsapp/types';
import { ContactAvatar } from './ChatPrimitives';
import { formatListTimestamp } from '../../lib/whatsapp/format';

export const DEMO_NOTICE_TEXT = 'Datos ficticios · sin conexión a WhatsApp ni a oportunidades reales. No se envían mensajes reales. Los cambios se pierden al recargar.';

export function DemoNotice() {
  return <p className="t-caption flex items-start gap-1.5"><Info size={14} aria-hidden className="mt-px shrink-0 text-info" />{DEMO_NOTICE_TEXT}</p>;
}

const MINUTE_MS = 60_000;

/** Flat list order: who must act first. Closed chats sink to the end. */
const stateOrder: Record<ConversationState, number> = { waiting: 0, seller: 1, assistant: 2, closed: 3 };

type Filter = 'all' | 'unread' | 'waiting' | 'mine';

const filters: { id: Filter; label: string; matches: (chat: Conversation) => boolean }[] = [
  { id: 'all', label: 'Todos', matches: () => true },
  { id: 'unread', label: 'No leídos', matches: chat => chat.unread > 0 },
  { id: 'waiting', label: 'Esperando', matches: chat => chat.state === 'waiting' },
  { id: 'mine', label: 'Míos', matches: chat => chat.state === 'seller' },
];

const previewPrefix: Partial<Record<MessageKind, string>> = { seller: 'Tú: ', phone: 'Tú: ', assistant: 'Asistente: ' };

/** Whole minutes since the customer's last message, at least one. */
function waitingSince(chat: Conversation, now: number) {
  const lastCustomer = chat.messages.filter(message => message.kind === 'customer').at(-1);
  const at = lastCustomer?.at ?? now;
  return { at, minutes: Math.max(1, Math.floor((now - at) / MINUTE_MS)) };
}

/** State at a glance on the avatar: tone ring plus icon (never color alone), and a spoken label. */
const stateIndicators: Record<ConversationState, { label: string; icon: LucideIcon; ring: string; badge: string }> = {
  waiting: { label: 'Esperando vendedor', icon: Clock3, ring: 'ring-warning', badge: 'bg-warning' },
  seller: { label: 'Atendiendo tú', icon: UserRound, ring: 'ring-success', badge: 'bg-success' },
  assistant: { label: 'Con el asistente', icon: Sparkles, ring: 'ring-info', badge: 'bg-info' },
  closed: { label: 'Cerrada', icon: Lock, ring: 'ring-ink-muted', badge: 'bg-ink-muted' },
};

function ConversationRow({ chat, selected, onSelect, now }: { chat: Conversation; selected: boolean; onSelect: (id: string) => void; now?: number }) {
  const last = chat.messages.at(-1);
  const reference = now ?? last?.at ?? 0;
  const waiting = chat.state === 'waiting' ? waitingSince(chat, reference) : undefined;
  const timeAt = waiting?.at ?? last?.at;
  const indicator = stateIndicators[chat.state];
  const StateIcon = indicator.icon;
  return <li><button type="button" aria-pressed={selected} onClick={() => onSelect(chat.id)}
    className={clsx('relative flex min-h-[72px] w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
      selected ? ['bg-accent-soft before:absolute before:inset-y-0 before:left-0 before:w-1', chat.state === 'seller' ? 'before:bg-success' : 'before:bg-accent'] : 'bg-surface hover:bg-surface-muted')}>
    {/* ContactAvatar only offers md/lg; the list row uses a 46px avatar. */}
    <span className={clsx('relative inline-flex shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-transparent [&>span:first-child]:size-[46px] [&>span:first-child]:text-sm', indicator.ring)}>
      <ContactAvatar name={chat.contact.name} />
      <span aria-hidden data-chat-state={chat.state} title={indicator.label}
        className={clsx('absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-surface text-surface', indicator.badge)}><StateIcon size={11} strokeWidth={2.5} /></span>
      <span className="sr-only">Estado: {indicator.label}. </span>
    </span>
    <span className="min-w-0 flex-1 space-y-0.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[15px] font-semibold text-ink">{chat.contact.name}</span>
        {timeAt !== undefined && <time dateTime={new Date(timeAt).toISOString()} className={clsx('t-micro t-num shrink-0', waiting ? 'text-accent-ink' : 'font-medium text-ink-muted')}>
          {waiting ? `hace ${waiting.minutes} min` : formatListTimestamp(timeAt, reference)}
        </time>}
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className="t-caption block truncate">
          {chat.state === 'waiting' ? <span className="font-semibold text-warning">Esperando vendedor · </span> : chat.state === 'closed' ? 'Cerrada · ' : last && previewPrefix[last.kind]}{last?.text}
        </span>
        {chat.unread > 0 && <span className="t-micro t-num min-w-5 shrink-0 rounded-full bg-accent px-1.5 py-px text-center text-on-accent">{chat.unread}<span className="sr-only"> sin leer · demo</span></span>}
      </span>
    </span>
  </button></li>;
}

export function ConversationList({ chats, selectedId, onSelect, now }: { chats: Conversation[]; selectedId?: string; onSelect: (id: string) => void; now?: number }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const tabs = useRef<HTMLDivElement>(null);
  const id = useId();
  const query = search.trim().toLocaleLowerCase('es');
  const active = filters.find(item => item.id === filter) ?? filters[0];
  const waitingCount = chats.filter(chat => chat.state === 'waiting').length;
  // Array.prototype.sort is stable, so chats keep their order within a state.
  const shown = chats
    .filter(chat => active.matches(chat) && `${chat.contact.name} ${chat.contact.phone} ${chat.contact.company} ${chat.opportunity.code}`.toLocaleLowerCase('es').includes(query))
    .sort((a, b) => stateOrder[a.state] - stateOrder[b.state]);
  // Arrow keys move the selection between filter tabs (roving tabindex).
  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = filters.findIndex(item => item.id === filter);
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: filters.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = (next + filters.length) % filters.length;
    setFilter(filters[target].id);
    tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target]?.focus();
  };
  return <section aria-labelledby={`${id}-title`} className="flex h-full min-h-0 min-w-0 flex-col border-r border-line bg-surface">
    <div className="flex h-15 shrink-0 items-center gap-2 border-b border-line-subtle px-4">
      <h2 id={`${id}-title`} className="text-lg font-semibold text-ink">Chats</h2>
      <span className="t-micro rounded-full border border-info-line bg-info-soft px-2 py-0.5 text-info">Demo</span>
    </div>
    <div className="shrink-0 space-y-2 border-b border-line-subtle py-2.5">
      <div className="relative px-3">
        <Search size={16} aria-hidden className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input type="search" aria-label="Buscar conversaciones" placeholder="Buscar nombre, teléfono o empresa" value={search} onChange={event => setSearch(event.target.value)}
          className="h-10 w-full rounded-full border border-line bg-surface-muted pl-9 pr-4 text-sm text-ink placeholder:text-ink-muted focus-visible:border-accent focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-accent-line" />
      </div>
      <div ref={tabs} role="tablist" aria-label="Filtrar chats" onKeyDown={onTabKey} className="flex gap-1.5 overflow-x-auto overflow-y-hidden px-3 py-0.5 [scrollbar-width:none]">
        {filters.map(item => {
          const selected = item.id === filter;
          return <button key={item.id} type="button" role="tab" aria-selected={selected} aria-controls={`${id}-list`} tabIndex={selected ? 0 : -1} onClick={() => setFilter(item.id)}
            className={clsx('inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
              selected ? 'border-accent-line bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink-muted hover:bg-surface-muted hover:text-ink')}>
            {item.label}{item.id === 'waiting' && waitingCount > 0 && <>{' '}<span className="t-num">{waitingCount}</span></>}
          </button>;
        })}
      </div>
    </div>
    <div id={`${id}-list`} data-conversation-list className="min-h-0 flex-1 overflow-y-auto pb-2">
      {shown.length > 0 && <ul>{shown.map(chat => <ConversationRow key={chat.id} chat={chat} selected={chat.id === selectedId} onSelect={onSelect} now={now} />)}</ul>}
      {!shown.length && <EmptyState title="Sin conversaciones" description="Prueba otra búsqueda u otro filtro. Los chats de demo aparecerán al cargar." />}
    </div>
  </section>;
}

export function ConversationDetails({ chat, onClose }: { chat: Conversation; onClose?: () => void }) {
  const [showSummary, setShowSummary] = useState(false);
  const id = useId();
  return <section aria-labelledby={`${id}-title`} className="flex h-full min-h-0 min-w-0 flex-col bg-surface">
    <div className="flex h-15 shrink-0 items-center justify-between gap-2 bg-night pl-4 pr-2 text-night-ink">
      <h2 id={`${id}-title`} className="truncate text-base font-semibold">Ficha del cliente</h2>
      {onClose && <button type="button" aria-label="Cerrar ficha del cliente" onClick={onClose}
        className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full text-night-ink transition-colors hover:bg-night-top focus-visible:outline-2 focus-visible:outline-night-link">
        <X size={18} aria-hidden />
      </button>}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto text-sm leading-5 text-ink [overflow-wrap:anywhere]">
      <div className="flex flex-col items-center gap-1 bg-success-soft px-4 py-5 text-center">
        {/* ContactAvatar only offers md/lg; the card uses an 80px avatar. */}
        <span className="mb-1.5 inline-flex [&>span]:size-20 [&>span]:text-2xl"><ContactAvatar name={chat.contact.name} size="lg" /></span>
        <p className="t-section">{chat.contact.name}</p>
        <p className="t-caption">{chat.contact.company}</p>
      </div>
      <div className="space-y-4 p-4">
        <dl className="divide-y divide-line-subtle rounded-control border border-line">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2.5"><dt className="t-caption">Teléfono</dt><dd className="t-num font-semibold">{chat.contact.phone}</dd></div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2.5"><dt className="t-caption">Oportunidad</dt><dd className="font-mono text-xs font-semibold tracking-wide text-accent-ink">{chat.opportunity.code}</dd></div>
        </dl>
        <section aria-labelledby={`${id}-captured`} className="space-y-2">
          <h3 id={`${id}-captured`} className="t-micro flex items-center gap-1.5 text-info"><Sparkles size={14} aria-hidden className="shrink-0" />El asistente capturó</h3>
          <ul className="flex flex-wrap gap-1.5">{chat.opportunity.captured.map(value => <li key={value} className="rounded-full border border-info-line bg-info-soft px-2.5 py-1 text-[13px] leading-[1.125rem] text-info">{value}</li>)}</ul>
        </section>
        <button type="button" aria-expanded={showSummary} onClick={() => setShowSummary(value => !value)}
          className="h-10 w-full cursor-pointer rounded-full bg-accent px-4 font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Abrir oportunidad</button>
        {showSummary && <section className="hg-panel-muted space-y-2 p-3" aria-label="Resumen de oportunidad demo"><h3 className="t-section">Demo · {chat.opportunity.code}</h3><p>{chat.opportunity.title}</p><p className="t-caption">Origen: WhatsApp</p><h4 className="hg-overline pt-1">Datos capturados por el asistente</h4><ul className="list-disc space-y-1 pl-4">{chat.opportunity.captured.map(value => <li key={value}>{value}</li>)}</ul><p className="t-caption">Resumen en memoria. No corresponde a una venta del CRM.</p></section>}
        <p className="t-micro text-center text-ink-muted">Demo · ficha sin vínculo real</p>
      </div>
    </div>
  </section>;
}

export function NoticeBanners({ notices, onOpen, onDismiss }: { notices: ChatNotice[]; onOpen: (id: string) => void; onDismiss: (id: string) => void }) {
  return <div className="space-y-2" aria-live="polite">{notices.filter(notice => notice.kind !== 'assigned').map(notice => <div key={notice.id} className="flex flex-wrap items-center justify-between gap-2 rounded-panel border border-info-line bg-info-soft px-3 py-2 text-[13px] text-ink shadow-xs">
    <p className="flex min-w-0 items-center gap-2"><BellRing size={15} aria-hidden className="shrink-0 text-info" /><span className="font-semibold">{notice.text}</span><span className="t-micro rounded-full border border-info-line bg-surface px-1.5 text-info">Demo</span></p>
    <div className="flex gap-2"><Button size="sm" onClick={() => onOpen(notice.conversationId)}>Ver chat</Button><Button size="sm" variant="subtle" onClick={() => onDismiss(notice.id)}>Más tarde</Button></div>
  </div>)}</div>;
}
