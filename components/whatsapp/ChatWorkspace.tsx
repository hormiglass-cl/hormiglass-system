'use client';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
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
  return <section aria-label={`Chat demo con ${chat.contact.name}`} className={`${styles.scope} hg-panel flex min-h-0 min-w-0 flex-1 flex-col`}>
    {/* No overflow-hidden here: the chat actions menu must be able to extend past the panel. */}
    <ChatHeader chat={chat} now={now} onAction={action => act((repo, time) => repo[action](chat.id, time))} onHistory={() => setHistory(value => !value)} />
    {error && <p role="alert" className="border-b border-danger-line bg-danger-soft px-4 py-2.5 text-sm text-danger">{error}</p>}
    {history ? <section className="min-h-0 flex-1 overflow-y-auto bg-surface-muted" aria-label="Historial del sistema"><div className="flex items-center justify-between gap-2 border-b border-line-subtle bg-surface px-4 py-2.5"><h3 className="t-section">Historial de eventos</h3><Button size="sm" icon={ArrowLeft} onClick={() => setHistory(false)}>Volver al chat</Button></div>{chat.messages.some(message => message.kind === 'event') ? <ChatThread messages={chat.messages.filter(message => message.kind === 'event')} /> : <p className="t-caption p-4">Aún no hay eventos en esta conversación.</p>}</section>
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
