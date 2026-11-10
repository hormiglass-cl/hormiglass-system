'use client';

import { useId, useState } from 'react';
import clsx from 'clsx';
import { BellRing, ChevronDown, Info, Search, Sparkles, X } from 'lucide-react';
import { Button, EmptyState } from '../ui/crm';
import type { ChatNotice, Conversation, ConversationState, MessageKind } from '../../lib/whatsapp/types';
import { ContactAvatar } from './ChatPrimitives';
import { formatListTimestamp } from '../../lib/whatsapp/format';

export const DEMO_NOTICE_TEXT = 'Datos ficticios · sin conexión a WhatsApp ni a oportunidades reales. No se envían mensajes reales. Los cambios se pierden al recargar.';

export function DemoNotice() {
  return <p className="t-caption flex items-start gap-1.5"><Info size={14} aria-hidden className="mt-px shrink-0 text-info" />{DEMO_NOTICE_TEXT}</p>;
}

const MINUTE_MS = 60_000;

type Tone = 'warning' | 'success' | 'info';

/** List groups in the order the seller must act, each with its own status color. */
const sections: { state: Exclude<ConversationState, 'closed'>; title: string; tone: Tone }[] = [
  { state: 'waiting', title: 'Te esperan', tone: 'warning' },
  { state: 'seller', title: 'Atendiendo tú', tone: 'success' },
  { state: 'assistant', title: 'Con el asistente', tone: 'info' },
];

const toneClasses: Record<Tone, { pill: string; badge: string }> = {
  warning: { pill: 'border-warning-line bg-warning-soft text-warning', badge: 'bg-warning' },
  success: { pill: 'border-success-line bg-success-soft text-success', badge: 'bg-success' },
  info: { pill: 'border-info-line bg-info-soft text-info', badge: 'bg-info' },
};

const previewPrefix: Partial<Record<MessageKind, string>> = { seller: 'Tú: ', phone: 'Tú: ', assistant: 'Asistente: ' };

/** Whole minutes since the customer's last message, at least one. */
function waitingSince(chat: Conversation, now: number) {
  const lastCustomer = chat.messages.filter(message => message.kind === 'customer').at(-1);
  const at = lastCustomer?.at ?? now;
  return { at, minutes: Math.max(1, Math.floor((now - at) / MINUTE_MS)) };
}

function ConversationRow({ chat, selected, onSelect, now }: { chat: Conversation; selected: boolean; onSelect: (id: string) => void; now?: number }) {
  const last = chat.messages.at(-1);
  const reference = now ?? last?.at ?? 0;
  const waiting = chat.state === 'waiting' ? waitingSince(chat, reference) : undefined;
  const timeAt = waiting?.at ?? last?.at;
  return <li><button type="button" aria-pressed={selected} onClick={() => onSelect(chat.id)}
    className={clsx('relative flex min-h-[72px] w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
      selected ? ['bg-accent-soft before:absolute before:inset-y-0 before:left-0 before:w-1', chat.state === 'seller' ? 'before:bg-success' : 'before:bg-accent'] : 'bg-surface hover:bg-surface-muted')}>
    {/* ContactAvatar only offers md/lg; the list row uses a 46px avatar. */}
    <span className="inline-flex shrink-0 [&>span]:size-[46px] [&>span]:text-sm"><ContactAvatar name={chat.contact.name} /></span>
    <span className="min-w-0 flex-1 space-y-0.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[15px] font-semibold text-ink">{chat.contact.name}</span>
        {timeAt !== undefined && <time dateTime={new Date(timeAt).toISOString()} className={clsx('t-micro t-num shrink-0', waiting ? 'text-accent-ink' : 'font-medium text-ink-muted')}>
          {waiting ? `hace ${waiting.minutes} min` : formatListTimestamp(timeAt, reference)}
        </time>}
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className="t-caption block truncate">{last && previewPrefix[last.kind]}{last?.text}</span>
        {chat.unread > 0 && <span className="t-micro t-num min-w-5 shrink-0 rounded-full bg-accent px-1.5 py-px text-center text-on-accent">{chat.unread}<span className="sr-only"> sin leer · demo</span></span>}
      </span>
    </span>
  </button></li>;
}

export function ConversationList({ chats, selectedId, onSelect, now }: { chats: Conversation[]; selectedId?: string; onSelect: (id: string) => void; now?: number }) {
  const [search, setSearch] = useState('');
  // A selected closed chat opens its group so the selection stays visible.
  const [showClosed, setShowClosed] = useState(() => chats.some(chat => chat.id === selectedId && chat.state === 'closed'));
  const id = useId();
  const query = search.trim().toLocaleLowerCase('es');
  const filtered = chats.filter(chat => `${chat.contact.name} ${chat.contact.phone} ${chat.contact.company} ${chat.opportunity.code}`.toLocaleLowerCase('es').includes(query));
  const closed = filtered.filter(chat => chat.state === 'closed');
  const row = (chat: Conversation) => <ConversationRow key={chat.id} chat={chat} selected={chat.id === selectedId} onSelect={onSelect} now={now} />;
  return <section aria-labelledby={`${id}-title`} className="flex h-full min-h-0 min-w-0 flex-col border-r border-line bg-surface">
    <div className="flex h-15 shrink-0 items-center gap-2 border-b border-line-subtle px-4">
      <h2 id={`${id}-title`} className="text-lg font-semibold text-ink">Chats</h2>
      <span className="t-micro rounded-full border border-info-line bg-info-soft px-2 py-0.5 text-info">Demo</span>
    </div>
    <div className="relative shrink-0 border-b border-line-subtle px-3 py-2.5">
      <Search size={16} aria-hidden className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-ink-muted" />
      <input type="search" aria-label="Buscar conversaciones" placeholder="Buscar nombre, teléfono o empresa" value={search} onChange={event => setSearch(event.target.value)}
        className="h-10 w-full rounded-full border border-line bg-surface-muted pl-9 pr-4 text-sm text-ink placeholder:text-ink-muted focus-visible:border-accent focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-accent-line" />
    </div>
    <div data-conversation-list className="min-h-0 flex-1 overflow-y-auto pb-2">
      {sections.map(section => {
        const items = filtered.filter(chat => chat.state === section.state);
        if (!items.length) return null;
        const tone = toneClasses[section.tone];
        return <section key={section.state} aria-labelledby={`${id}-${section.state}`} className="pt-3">
          <h3 id={`${id}-${section.state}`} className="px-4 pb-1.5">
            <span className={clsx('t-micro inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-2.5 pr-1', tone.pill)}>
              {section.title}{' '}<span className={clsx('t-num min-w-5 rounded-full px-1.5 text-center text-surface', tone.badge)}>{items.length}</span>
            </span>
          </h3>
          <ul>{items.map(row)}</ul>
        </section>;
      })}
      {closed.length > 0 && <div className="pt-3">
        <div className="px-4">
          <button type="button" aria-expanded={showClosed} aria-controls={`${id}-closed`} onClick={() => setShowClosed(value => !value)}
            className="flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-full border border-line px-4 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
            Ver chats cerrados ({closed.length})<ChevronDown size={16} aria-hidden className={clsx('shrink-0 transition-transform', showClosed && 'rotate-180')} />
          </button>
        </div>
        <ul id={`${id}-closed`} hidden={!showClosed} className="pt-1.5">{closed.map(row)}</ul>
      </div>}
      {!filtered.length && <EmptyState title="Sin conversaciones" description="Prueba otra búsqueda. Los chats de demo aparecerán al cargar." />}
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
