'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import styles from '../../components/whatsapp/Scrollbars.module.css';
import { useConversations } from '../../lib/whatsapp/store';
import { ArrowLeft } from 'lucide-react';
import { Button, EmptyState } from '../../components/ui/crm';
import { ChatWorkspace } from '../../components/whatsapp/ChatWorkspace';
import { ConversationDetails, ConversationList, DemoNotice, NoticeBanners } from '../../components/whatsapp/InboxParts';

/** Page width (not viewport) from which list, chat and customer card fit side by side. */
const THREE_PANES_MIN_WIDTH = 1120;

/** Tracks whether the page itself is wide enough for three panes, so collapsing the sidebar also counts. */
function useWideLayout() {
  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= THREE_PANES_MIN_WIDTH));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, wide };
}

export default function ConversacionesPage() {
  const { chats, now, notices, selection, openChat, act, threadRequested, setThreadRequested } = useConversations();
  const { ref, wide } = useWideLayout();
  const [mobileChat, setMobileChat] = useState(false);
  // null = follow the layout default: card open when three panes fit, closed otherwise.
  const [detailsChoice, setDetailsChoice] = useState<boolean | null>(null);
  const chat = chats.find(item => item.id === selection?.id);
  const viewingChat = (mobileChat || threadRequested) && !!chat;
  const detailsOpen = !!chat && (detailsChoice ?? wide);
  const listBesideChat = wide || !detailsOpen;
  const visibleNotices = notices.some(notice => notice.kind !== 'assigned');

  function selectChat(id: string) {
    openChat(id);
    setMobileChat(true);
    if (!wide) setDetailsChoice(null);
  }

  const toggleDetails = () => setDetailsChoice(!detailsOpen);
  const columns = wide
    ? (detailsOpen ? 'lg:grid-cols-[320px_minmax(0,1fr)_320px]' : 'lg:grid-cols-[320px_minmax(0,1fr)]')
    : (detailsOpen ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : 'lg:grid-cols-[300px_minmax(0,1fr)]');

  // Edge-to-edge: cancel the shell padding and fill the height under the navbar, like a messaging app.
  return <div ref={ref} className={`${styles.scope} -mx-4 -my-5 flex h-[calc(100dvh-56px)] min-h-0 flex-col overflow-hidden border-t border-line bg-surface sm:-mx-6 lg:-mx-8`}>
    <h1 className="sr-only">Conversaciones</h1>
    <div className="sr-only"><DemoNotice /></div>
    {visibleNotices && <div className="shrink-0 border-b border-line bg-surface-muted px-4 py-2">
      <NoticeBanners notices={notices} onOpen={selectChat} onDismiss={id => act(repo => repo.dismissNotice(id))} />
    </div>}
    {viewingChat && <div className="flex shrink-0 items-center border-b border-line px-3 py-2 lg:hidden">
      <Button size="sm" icon={ArrowLeft} onClick={() => { setMobileChat(false); setThreadRequested(false); setDetailsChoice(null); }}>Volver a la lista</Button>
    </div>}
    <div className={clsx('grid min-h-0 flex-1', columns)}>
      <div className={clsx('min-h-0 min-w-0', viewingChat ? 'hidden' : 'block', listBesideChat ? 'lg:block' : 'lg:hidden')}>
        <ConversationList chats={chats} now={now} selectedId={chat?.id} onSelect={selectChat} />
      </div>
      {chat ? <>
        {/* The workspace keeps its card frame for the Ventas tab; here it sits flush between the panes. */}
        <div className={clsx('min-h-0 min-w-0 lg:flex [&>section]:rounded-none [&>section]:border-0 [&>section]:shadow-none', viewingChat && !detailsOpen ? 'flex' : 'hidden')}>
          <ChatWorkspace key={chat.id} conversationId={chat.id} detailsOpen={detailsOpen} onToggleDetails={toggleDetails} />
        </div>
        {detailsOpen && <div id="chat-customer-details" className={clsx('min-h-0 min-w-0 border-l border-line', viewingChat ? 'block' : 'hidden lg:block')}>
          <ConversationDetails key={chat.id} chat={chat} onClose={() => setDetailsChoice(false)} />
        </div>}
      </> : <div className="hidden place-items-center bg-accent-soft p-6 lg:grid">
        <EmptyState title="Selecciona un chat de demostración" description="Explora estados y respuestas sin enviar mensajes ni modificar el CRM." action={<Button onClick={() => selectChat('demo-1')} disabled={!chats.length}>Ver chat demo</Button>} />
      </div>}
    </div>
  </div>;
}
