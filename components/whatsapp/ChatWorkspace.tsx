'use client';

import { useState } from 'react';
import styles from './Scrollbars.module.css';
import { useConversations } from '../../lib/whatsapp/store';
import { Button } from '../ui/crm';
import { ChatComposer, ChatHeader, ChatThread } from './ChatPrimitives';
import { MockQuoteDialog } from './MockQuoteDialog';
import { MockDatasheetDialog } from './MockDatasheetDialog';

export function ChatWorkspace({ conversationId }: { conversationId: string }) {
  // Reset local drafts/dialogs on navigation, including hosts without an outer key.
  return <ConversationWorkspace key={conversationId} conversationId={conversationId} />;
}

function ConversationWorkspace({ conversationId }: { conversationId: string }) {
  const { chats, now, selection, act, error } = useConversations();
  const [history, setHistory] = useState(false);
  const [shortcut, setShortcut] = useState<'quote' | 'datasheet' | null>(null);
  const chat = chats.find(item => item.id === conversationId);
  if (!chat) return <p className="p-4 text-sm text-ink-muted">Cargando conversación demo…</p>;
  return <section aria-label={`Chat demo con ${chat.contact.name}`} className={`${styles.scope} flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-line bg-surface`}>
    <ChatHeader chat={chat} now={now} onAction={action => act((repo, time) => repo[action](chat.id, time))} onHistory={() => setHistory(value => !value)} />
    {error && <p role="alert" className="border-b border-danger-line bg-danger-soft p-3 text-sm text-danger">{error}</p>}
    {history ? <section className="min-h-0 flex-1 overflow-y-auto bg-surface-muted" aria-label="Historial del sistema"><div className="flex items-center justify-between p-3 text-sm text-ink"><h3 className="font-semibold">Historial de eventos</h3><Button size="sm" onClick={() => setHistory(false)}>Volver al chat</Button></div>{chat.messages.some(message => message.kind === 'event') ? <ChatThread messages={chat.messages.filter(message => message.kind === 'event')} /> : <p className="p-4 text-sm text-ink-muted">Aún no hay eventos en esta conversación.</p>}</section>
      : <div className="min-h-0 flex-1 overflow-y-auto bg-surface-muted"><ChatThread messages={chat.messages} unreadAt={selection?.id === chat.id ? selection.unreadAt : undefined} unreadCount={selection?.id === chat.id ? selection.unreadCount : 0} /></div>}
    <ChatComposer locked={chat.state !== 'seller' || (chat.pausedUntil ?? 0) <= now}
      onSend={text => act((repo, time) => repo.send(chat.id, text, time))}
      onCreateQuote={() => setShortcut('quote')} onSelectDatasheet={() => setShortcut('datasheet')} />
    <MockQuoteDialog chat={chat} open={shortcut === 'quote'} onClose={() => setShortcut(null)} />
    <MockDatasheetDialog chat={chat} open={shortcut === 'datasheet'} onClose={() => setShortcut(null)}
      canSend={chat.state === 'seller' && (chat.pausedUntil ?? 0) > now}
      onConfirm={documentId => act((repo, time) => repo.sendDocument(chat.id, documentId, time))} />
  </section>;
}
