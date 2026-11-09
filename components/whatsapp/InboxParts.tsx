'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { BellRing, Check, Info, Sparkles } from 'lucide-react';
import { Button, EmptyState, Panel, SearchField } from '../ui/crm';
import type { ChatNotice, Conversation } from '../../lib/whatsapp/types';
import { ChatStateBadge, ContactAvatar } from './ChatPrimitives';
import { formatListTimestamp } from '../../lib/whatsapp/format';

export function DemoNotice() {
  return <p className="t-caption flex items-start gap-1.5"><Info size={14} aria-hidden className="mt-px shrink-0 text-info" />Datos ficticios · sin conexión a WhatsApp ni a oportunidades reales. No se envían mensajes reales. Los cambios se pierden al recargar.</p>;
}

const filters = [
  { id: 'all', label: 'Todos' },
  { id: 'mine', label: 'Mis chats' },
  { id: 'waiting', label: 'Esperando' },
  { id: 'assistant', label: 'Con asistente' },
  { id: 'closed', label: 'Cerrados' },
];

/** Single-row pill filters (soft orange when active) that scroll horizontally in the narrow column. */
function FilterPills({ active, onChange }: { active: string; onChange: (id: string) => void }) {
  return <div role="tablist" aria-label="Filtrar conversaciones" className="flex flex-nowrap items-center gap-1 overflow-x-auto">
    {filters.map(item => {
      const selected = item.id === active;
      return <button key={item.id} type="button" role="tab" aria-selected={selected} onClick={() => onChange(item.id)}
        className={clsx('h-7 shrink-0 cursor-pointer whitespace-nowrap rounded-full border border-transparent px-3 text-xs font-semibold transition-colors',
          selected ? 'bg-accent-soft text-accent-ink' : 'text-ink-muted hover:bg-surface-muted hover:text-ink')}>
        {item.label}
      </button>;
    })}
  </div>;
}

export function ConversationList({ chats, selectedId, onSelect, now }: { chats: Conversation[]; selectedId?: string; onSelect: (id: string) => void; now?: number }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const query = search.trim().toLocaleLowerCase('es');
  const filtered = chats.filter(chat => (filter === 'all' || (filter === 'mine' ? chat.state === 'seller' || chat.state === 'waiting' : chat.state === filter)) && `${chat.contact.name} ${chat.contact.phone} ${chat.contact.company} ${chat.opportunity.code}`.toLocaleLowerCase('es').includes(query));
  return <Panel title="Chats de demostración" actions={<span className="hg-list-count">{filtered.length}</span>} className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
    <div data-conversation-filters className="shrink-0 space-y-2.5 border-b border-line-subtle p-3">
      <SearchField label="Buscar conversaciones" placeholder="Nombre, teléfono o empresa" value={search} onChange={event => setSearch(event.target.value)} />
      <FilterPills active={filter} onChange={setFilter} />
    </div>
    <ul data-conversation-list className="min-h-0 flex-1 overflow-y-auto">
      {filtered.map(chat => {
        const selected = chat.id === selectedId;
        const last = chat.messages.at(-1);
        return <li key={chat.id} className="border-b border-line-subtle last:border-b-0"><button type="button" aria-pressed={selected} onClick={() => onSelect(chat.id)}
          className={clsx('relative flex w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors',
            selected ? 'bg-accent-soft before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-accent' : 'bg-surface hover:bg-surface-muted')}>
          <ContactAvatar name={chat.contact.name} />
          <span className="min-w-0 flex-1 space-y-1">
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-ink">{chat.contact.name}</span>
              {last && <time dateTime={new Date(last.at).toISOString()} className="t-micro t-num shrink-0 text-ink-muted">{formatListTimestamp(last.at, now ?? last.at)}</time>}
            </span>
            <span className="flex items-center justify-between gap-2">
              <span className="t-caption block truncate">{last?.text}</span>
              {chat.unread > 0 && <span className="t-micro t-num shrink-0 rounded-full bg-accent px-1.5 py-px text-on-accent">{chat.unread}<span className="sr-only"> sin leer · demo</span></span>}
            </span>
            <span className="block pt-0.5"><ChatStateBadge state={chat.state} /></span>
          </span>
        </button></li>;
      })}
    </ul>
    {!filtered.length && <EmptyState title="Sin conversaciones" description="Prueba otro filtro o búsqueda. Los chats de demo aparecerán al cargar." />}
  </Panel>;
}

export function ConversationDetails({ chat }: { chat: Conversation }) {
  const [showSummary, setShowSummary] = useState(false);
  return <Panel title="Ficha del cliente" className="flex h-full min-h-0 min-w-0 flex-col [&>div:first-child]:shrink-0">
    <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-3 text-sm leading-5 text-ink [overflow-wrap:anywhere]">
      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-2"><h3 className="hg-overline">Cliente</h3><span className="t-micro rounded-full border border-line bg-surface-muted px-2 py-0.5 text-ink-muted">Demo · ficha sin vínculo real</span></div>
        <div className="flex items-center gap-3">
          <ContactAvatar name={chat.contact.name} size="lg" />
          <div className="min-w-0"><p className="t-section">{chat.contact.name}</p><p className="t-caption">{chat.contact.company}</p><p className="t-caption t-num">{chat.contact.phone}</p></div>
        </div>
      </section>
      <section className="space-y-1.5 rounded-control border border-accent-line bg-accent-soft p-3">
        <h3 className="t-micro text-accent-ink">Oportunidad</h3>
        <p className="font-mono text-xs font-semibold tracking-wide text-accent-ink">{chat.opportunity.code}</p>
        <p className="font-semibold">{chat.opportunity.title}</p>
      </section>
      <section className="space-y-2.5 rounded-control border border-info-line bg-info-soft p-3">
        <div className="flex items-center gap-1.5"><span aria-hidden className="t-micro shrink-0 rounded-full border border-info-line bg-surface px-1.5 text-info">IA</span><h3 className="t-micro min-w-0 text-info">Capturado por el asistente</h3><Sparkles size={14} aria-hidden className="ml-auto shrink-0 text-info" /></div>
        <ul className="space-y-1.5">{chat.opportunity.captured.map(value => <li key={value} className="flex items-start gap-2 rounded-control bg-surface/70 px-2.5 py-1.5 text-[13px]"><Check size={14} aria-hidden className="mt-0.5 shrink-0 text-info" /><span className="min-w-0">{value}</span></li>)}</ul>
      </section>
      <Button variant="primary" className="w-full" onClick={() => setShowSummary(value => !value)} aria-expanded={showSummary}>Abrir oportunidad</Button>
      {showSummary && <section className="hg-panel-muted space-y-2 p-3" aria-label="Resumen de oportunidad demo"><h3 className="t-section">Demo · {chat.opportunity.code}</h3><p>{chat.opportunity.title}</p><p className="t-caption">Origen: WhatsApp</p><h4 className="hg-overline pt-1">Datos capturados por el asistente</h4><ul className="list-disc space-y-1 pl-4">{chat.opportunity.captured.map(value => <li key={value}>{value}</li>)}</ul><p className="t-caption">Resumen en memoria. No corresponde a una venta del CRM.</p></section>}
    </div>
  </Panel>;
}

export function NoticeBanners({ notices, onOpen, onDismiss }: { notices: ChatNotice[]; onOpen: (id: string) => void; onDismiss: (id: string) => void }) {
  return <div className="space-y-2" aria-live="polite">{notices.filter(notice => notice.kind !== 'assigned').map(notice => <div key={notice.id} className="flex flex-wrap items-center justify-between gap-2 rounded-panel border border-info-line bg-info-soft px-3 py-2 text-[13px] text-ink shadow-xs">
    <p className="flex min-w-0 items-center gap-2"><BellRing size={15} aria-hidden className="shrink-0 text-info" /><span className="font-semibold">{notice.text}</span><span className="t-micro rounded-full border border-info-line bg-surface px-1.5 text-info">Demo</span></p>
    <div className="flex gap-2"><Button size="sm" onClick={() => onOpen(notice.conversationId)}>Ver chat</Button><Button size="sm" variant="subtle" onClick={() => onDismiss(notice.id)}>Más tarde</Button></div>
  </div>)}</div>;
}
