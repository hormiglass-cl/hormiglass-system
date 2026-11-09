'use client';

import { useState } from 'react';
import styles from '../../components/whatsapp/Scrollbars.module.css';
import { useConversations } from '../../lib/whatsapp/store';
import { ArrowLeft, UserRound } from 'lucide-react';
import { Button, EmptyState, StatusBadge } from '../../components/ui/crm';
import { ChatWorkspace } from '../../components/whatsapp/ChatWorkspace';
import { ConversationDetails, ConversationList, DemoNotice, NoticeBanners } from '../../components/whatsapp/InboxParts';

export default function ConversacionesPage() {
  const { chats, notices, selection, openChat, act, threadRequested, setThreadRequested } = useConversations();
  const [mobileChat, setMobileChat] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const chat = chats.find(item => item.id === selection?.id);
  const viewingChat = (mobileChat || threadRequested) && !!chat;

  function selectChat(id: string) {
    openChat(id);
    setMobileChat(true);
    setShowDetails(false);
  }

  return <div className={`${styles.scope} flex h-[calc(100dvh-96px)] min-h-0 flex-col gap-3 xl:-mt-2 xl:h-[calc(100dvh-88px)]`}>
    <div className={viewingChat && !showDetails ? 'hidden shrink-0 space-y-2 xl:block' : 'shrink-0 space-y-2'}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1"><h1 className="t-page">Conversaciones</h1><StatusBadge tone="info">WhatsApp · demo</StatusBadge></header>
      <DemoNotice />
      <NoticeBanners notices={notices} onOpen={selectChat} onDismiss={id => act(repo => repo.dismissNotice(id))} />
    </div>
    {viewingChat && <div className="flex shrink-0 items-center justify-between gap-2 xl:hidden">
      <Button size="sm" icon={ArrowLeft} onClick={() => { setMobileChat(false); setThreadRequested(false); setShowDetails(false); }}>Volver a la lista</Button>
      <Button size="sm" icon={UserRound} aria-expanded={showDetails} aria-controls="chat-customer-details" onClick={() => setShowDetails(value => !value)}>Datos del cliente</Button>
    </div>}
    <div className={`grid min-h-0 ${showDetails ? 'flex-none xl:flex-1' : 'flex-1'} items-stretch gap-4 xl:grid-cols-[288px_minmax(0,1fr)_280px]`}>
      <div className={viewingChat ? 'hidden min-h-0 min-w-0 xl:block' : 'min-h-0 min-w-0 overflow-y-auto'}>
        <ConversationList chats={chats} selectedId={chat?.id} onSelect={selectChat} />
      </div>
      {chat ? <>
        <div className={`${viewingChat ? 'flex' : 'hidden'} ${showDetails ? 'h-[calc(100dvh-136px)] xl:h-auto' : ''} min-h-0 min-w-0 xl:flex`}>
          <ChatWorkspace key={chat.id} conversationId={chat.id} />
        </div>
        <div id="chat-customer-details" className={`${viewingChat && showDetails ? 'block' : 'hidden'} min-w-0 xl:block xl:overflow-y-auto`}>
          <ConversationDetails key={chat.id} chat={chat} />
        </div>
      </> : <EmptyState title="Selecciona un chat de demostración" description="Explora estados y respuestas sin enviar mensajes ni modificar el CRM." action={<Button onClick={() => selectChat('demo-1')} disabled={!chats.length}>Ver chat demo</Button>} />}
    </div>
  </div>;
}
