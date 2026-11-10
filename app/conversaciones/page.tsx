'use client';

import { useState } from 'react';
import styles from '../../components/whatsapp/Scrollbars.module.css';
import { useConversations } from '../../lib/whatsapp/store';
import { ArrowLeft, UserRound } from 'lucide-react';
import { Button, EmptyState, StatusBadge } from '../../components/ui/crm';
import { ChatWorkspace } from '../../components/whatsapp/ChatWorkspace';
import { ConversationDetails, ConversationList, DEMO_NOTICE_TEXT, DemoNotice, NoticeBanners } from '../../components/whatsapp/InboxParts';

export default function ConversacionesPage() {
  const { chats, now, notices, selection, openChat, act, threadRequested, setThreadRequested } = useConversations();
  const [mobileChat, setMobileChat] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const chat = chats.find(item => item.id === selection?.id);
  const viewingChat = (mobileChat || threadRequested) && !!chat;

  function selectChat(id: string) {
    openChat(id);
    setMobileChat(true);
    setShowDetails(false);
  }

  const detailsToggle = <Button size="sm" icon={UserRound} aria-expanded={showDetails} aria-controls="chat-customer-details" onClick={() => setShowDetails(value => !value)}>{showDetails ? 'Ocultar datos del cliente' : 'Datos del cliente'}</Button>;

  return <div className={`${styles.scope} @container flex h-[calc(100dvh-96px)] min-h-0 flex-col gap-3 xl:-mt-2 xl:h-[calc(100dvh-88px)]`}>
    <div className={viewingChat && !showDetails ? 'hidden shrink-0 space-y-2 lg:block' : 'shrink-0 space-y-2'}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1"><h1 className="t-page">Conversaciones</h1><span title={DEMO_NOTICE_TEXT} className="inline-flex"><StatusBadge tone="info">WhatsApp · demo</StatusBadge></span>
        {chat && <span className="ml-auto hidden lg:inline-flex @min-[1120px]:hidden">{detailsToggle}</span>}
      </header>
      {/* Short laptop screens (13"): give the height to the chat; the notice stays for screen readers and as the badge tooltip. */}
      <div className="[@media(max-height:900px)]:sr-only"><DemoNotice /></div>
      <NoticeBanners notices={notices} onOpen={selectChat} onDismiss={id => act(repo => repo.dismissNotice(id))} />
    </div>
    {/* Phones: one pane at a time. Laptops: list or customer card beside the chat. All three when the page itself is ≥1120px wide (container query), so collapsing the sidebar also reveals the card. */}
    {viewingChat && <div className="flex shrink-0 items-center justify-between gap-2 lg:hidden">
      <Button size="sm" icon={ArrowLeft} onClick={() => { setMobileChat(false); setThreadRequested(false); setShowDetails(false); }}>Volver a la lista</Button>
      {detailsToggle}
    </div>}
    <div className={`grid min-h-0 ${showDetails ? 'flex-none lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]' : 'flex-1 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]'} items-stretch gap-4 @min-[1120px]:grid-cols-[288px_minmax(0,1fr)_300px]`}>
      <div className={`${viewingChat ? 'hidden' : 'block overflow-y-auto'} ${showDetails ? 'lg:hidden' : 'lg:block'} min-h-0 min-w-0 @min-[1120px]:block`}>
        <ConversationList chats={chats} now={now} selectedId={chat?.id} onSelect={selectChat} />
      </div>
      {chat ? <>
        <div className={`${viewingChat ? 'flex' : 'hidden'} ${showDetails ? 'h-[calc(100dvh-136px)] lg:h-auto' : ''} min-h-0 min-w-0 lg:flex`}>
          <ChatWorkspace key={chat.id} conversationId={chat.id} />
        </div>
        <div id="chat-customer-details" className={`${viewingChat && showDetails ? 'block' : 'hidden'} ${showDetails ? 'lg:block' : 'lg:hidden'} min-w-0 lg:overflow-y-auto @min-[1120px]:block`}>
          <ConversationDetails key={chat.id} chat={chat} />
        </div>
      </> : <EmptyState title="Selecciona un chat de demostración" description="Explora estados y respuestas sin enviar mensajes ni modificar el CRM." action={<Button onClick={() => selectChat('demo-1')} disabled={!chats.length}>Ver chat demo</Button>} />}
    </div>
  </div>;
}
