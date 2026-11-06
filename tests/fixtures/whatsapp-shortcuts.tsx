import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConversationProvider, useConversations } from '../../lib/whatsapp/store';
import { ChatWorkspace } from '../../components/whatsapp/ChatWorkspace';
import { OpportunityActivity } from '../../components/whatsapp/OpportunityActivity';

function ShortcutsFixture() {
  const [id, setId] = useState('demo-1');
  const [opportunity, setOpportunity] = useState(false);
  const { chats } = useConversations();
  const chat = chats.find(item => item.id === id);
  return <main className="flex h-[700px] flex-col p-2">
    <div className="flex shrink-0 flex-wrap gap-2">
      <button type="button" onClick={() => setTimeout(() => setId('demo-2'), 2000)}>Cambiar conversación en 2s</button>
      <button type="button" onClick={() => setOpportunity(true)}>Ver oportunidad</button>
    </div>
    {opportunity ? <OpportunityActivity onClose={() => setOpportunity(false)}><button type="button">Actividad existente</button></OpportunityActivity>
      : <ChatWorkspace conversationId={id} />}
    <output aria-label="Cantidad de mensajes">{chat?.messages.length ?? 0}</output>
    <output aria-label="Cantidad de archivos">{chat?.messages.filter(message => message.kind === 'file').length ?? 0}</output>
  </main>;
}

createRoot(document.getElementById('root')!).render(<ConversationProvider><ShortcutsFixture /></ConversationProvider>);
