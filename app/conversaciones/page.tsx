'use client';

import { useState } from 'react';
import { useConversations } from '../../lib/whatsapp/store';
import { Button, EmptyState, PageHeader } from '../../components/ui/crm';
import { ChatWorkspace } from '../../components/whatsapp/ChatWorkspace';
import { ConversationDetails, ConversationList, DemoNotice, NoticeBanners } from '../../components/whatsapp/InboxParts';

export default function ConversacionesPage() {
  const { chats, notices, selection, openChat, act } = useConversations();
  const [mobileChat, setMobileChat] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const chat = chats.find(item => item.id === selection?.id);
  const viewingChat = mobileChat && !!chat;

  function selectChat(id: string) {
    openChat(id);
    setMobileChat(true);
    setShowDetails(false);
  }

  return <div className="space-y-3">
    <div className={viewingChat ? 'hidden space-y-3 lg:block' : 'space-y-3'}>
      <PageHeader title="Conversaciones" description="Bandeja de WhatsApp · demostración frontend" />
      <DemoNotice />
      <NoticeBanners notices={notices} onOpen={selectChat} onDismiss={id => act(repo => repo.dismissNotice(id))} />
    </div>
    {viewingChat && <div className="flex items-center justify-between gap-2 lg:hidden">
      <Button size="sm" onClick={() => { setMobileChat(false); setShowDetails(false); }}>Volver a la lista</Button>
      <Button size="sm" aria-expanded={showDetails} aria-controls="chat-customer-details" onClick={() => setShowDetails(value => !value)}>Datos del cliente</Button>
    </div>}
    <div className="grid items-start gap-3 lg:grid-cols-[248px_minmax(0,1fr)_220px]">
      <div className={viewingChat ? 'hidden min-w-0 lg:block' : 'min-w-0'}>
        <ConversationList chats={chats} selectedId={chat?.id} onSelect={selectChat} />
      </div>
      {chat ? <>
        <div className={`${viewingChat ? 'flex' : 'hidden'} h-[calc(100dvh-112px)] min-h-0 min-w-0 lg:flex lg:h-[calc(100dvh-250px)]`}>
          <ChatWorkspace key={chat.id} conversationId={chat.id} />
        </div>
        <div id="chat-customer-details" className={`${viewingChat && showDetails ? 'block' : 'hidden'} min-w-0 lg:block lg:max-h-[calc(100dvh-250px)] lg:overflow-y-auto`}>
          <ConversationDetails key={chat.id} chat={chat} />
        </div>
      </> : <EmptyState title="Selecciona un chat de demostración" description="Explora estados y respuestas sin enviar mensajes ni modificar el CRM." action={<Button onClick={() => selectChat('demo-1')} disabled={!chats.length}>Ver chat demo</Button>} />}
    </div>
  </div>;
}
