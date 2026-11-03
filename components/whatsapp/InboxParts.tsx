'use client';

import { useState } from 'react';
import { Button, EmptyState, Panel, SearchField, Tabs } from '../ui/crm';
import type { ChatNotice, Conversation } from '../../lib/whatsapp/types';
import { ChatStateBadge } from './ChatPrimitives';

export function DemoNotice() {
  return <p className="text-xs leading-4 text-ink-muted">Datos ficticios · sin conexión a WhatsApp ni a oportunidades reales. No se envían mensajes reales. Los cambios se pierden al recargar.</p>;
}

export function ConversationList({ chats, selectedId, onSelect }: { chats: Conversation[]; selectedId?: string; onSelect: (id: string) => void }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const query = search.trim().toLocaleLowerCase('es');
  const filtered = chats.filter(chat => (filter === 'all' || (filter === 'mine' ? chat.state === 'seller' || chat.state === 'waiting' : chat.state === filter)) && `${chat.contact.name} ${chat.contact.phone} ${chat.contact.company} ${chat.opportunity.code}`.toLocaleLowerCase('es').includes(query));
  return <Panel title="Chats de demostración" className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden [&>div:first-child]:px-3 [&>div:first-child]:py-2">
    <div className="shrink-0 space-y-2 p-3 [&>div:first-child]:min-w-0 [&_[role=tablist]]:flex-nowrap [&_[role=tablist]]:overflow-x-auto [&_[role=tab]]:shrink-0 [&_[role=tab]]:whitespace-nowrap [&_[role=tab]]:px-2 [&_[role=tab]]:text-xs">
      <SearchField label="Buscar conversaciones" placeholder="Nombre, teléfono o empresa" value={search} onChange={event => setSearch(event.target.value)} />
      <Tabs label="Filtrar conversaciones" active={filter} onChange={setFilter} items={[{ id: 'all', label: 'Todos' }, { id: 'mine', label: 'Mis chats' }, { id: 'waiting', label: 'Esperando' }, { id: 'assistant', label: 'Con asistente' }, { id: 'closed', label: 'Cerrados' }]} />
    </div>
    <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
      {filtered.map(chat => <li key={chat.id}><button type="button" aria-pressed={chat.id === selectedId} onClick={() => onSelect(chat.id)} className={`w-full space-y-1.5 border-l-2 border-transparent px-3 py-3 text-left text-sm hover:bg-surface-muted ${chat.id === selectedId ? 'bg-accent-soft !border-accent' : 'bg-surface'}`}>
        <span className="flex justify-between gap-2 font-semibold text-ink"><span>{chat.contact.name}</span>{chat.unread > 0 && <span className="rounded-full bg-accent px-2 text-xs text-on-accent">{chat.unread}<span className="sr-only"> sin leer · demo</span></span>}</span>
        <span className="block truncate text-xs text-ink-muted">{chat.messages.at(-1)?.text}</span>
        <ChatStateBadge state={chat.state} />
      </button></li>)}
    </ul>
    {!filtered.length && <EmptyState title="Sin conversaciones" description="Prueba otro filtro o búsqueda. Los chats de demo aparecerán al cargar." />}
  </Panel>;
}

export function ConversationDetails({ chat }: { chat: Conversation }) {
  const [showSummary, setShowSummary] = useState(false);
  return <Panel title={<><span className="sr-only">Demo · ficha sin vínculo real</span><span aria-hidden>Ficha del cliente</span></>} className="min-w-0 [&>div:first-child]:px-3 [&>div:first-child]:py-2">
    <div className="space-y-4 p-3 text-sm leading-5 text-ink">
      <p className="text-xs text-ink-muted">Demo · ficha sin vínculo real</p>
      <section><h3 className="mb-1 font-semibold">Cliente</h3><p>{chat.contact.name}</p><p className="text-ink-muted">{chat.contact.company}</p><p>{chat.contact.phone}</p></section>
      <section><h3 className="mb-1 font-semibold">Oportunidad</h3><p>{chat.opportunity.code}</p><p>{chat.opportunity.title}</p></section>
      <section><h3 className="mb-2 font-semibold">Capturado por el asistente</h3><ul className="list-inside list-disc space-y-1 text-ink-muted">{chat.opportunity.captured.map(value => <li key={value}>{value}</li>)}</ul></section>
      <Button size="sm" onClick={() => setShowSummary(value => !value)} aria-expanded={showSummary}>Abrir oportunidad</Button>
      {showSummary && <section className="space-y-2 rounded-control border border-line bg-surface-muted p-3" aria-label="Resumen de oportunidad demo"><h3 className="font-semibold">Demo · {chat.opportunity.code}</h3><p>{chat.opportunity.title}</p><p>Origen: WhatsApp</p><h4 className="font-semibold">Datos capturados por el asistente</h4><ul>{chat.opportunity.captured.map(value => <li key={value}>{value}</li>)}</ul><p className="text-xs text-ink-muted">Resumen en memoria. No corresponde a una venta del CRM.</p></section>}
    </div>
  </Panel>;
}

export function NoticeBanners({ notices, onOpen, onDismiss }: { notices: ChatNotice[]; onOpen: (id: string) => void; onDismiss: (id: string) => void }) {
  return <div className="space-y-2" aria-live="polite">{notices.map(notice => <div key={notice.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-info-line bg-info-soft px-3 py-1.5 text-[13px] text-ink">
    <p><span className="font-semibold">{notice.text}</span><span className="ml-2 text-xs text-ink-muted">Demo</span></p>
    <div className="flex gap-2"><Button size="sm" onClick={() => onOpen(notice.conversationId)}>Ver chat</Button><Button size="sm" variant="subtle" onClick={() => onDismiss(notice.id)}>Más tarde</Button></div>
  </div>)}</div>;
}
