import { createRoot } from 'react-dom/client';
import { ConversationProvider } from '../../lib/whatsapp/store';
import { ChatWorkspace } from '../../components/whatsapp/ChatWorkspace';

// A deliberately short chat panel: the actions menu must not be clipped by it.
function ShortChatFixture() {
  return <main className="p-2">
    <div className="flex h-[140px] w-[360px] flex-col"><ChatWorkspace conversationId="demo-3" /></div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<ConversationProvider><ShortChatFixture /></ConversationProvider>);
