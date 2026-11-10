import { useEffect, useRef, useState } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { ConversationDetails, ConversationList } from '../../components/whatsapp/InboxParts';
import { createMockRepository } from '../../lib/whatsapp/repository';

export const INBOX_NOW = 1800000000000;

/** Chat list and customer card side by side in equal panes, sized by the `--panes-height` variable. */
export function InboxFixture() {
  const [chats] = useState(() => createMockRepository(INBOX_NOW).list());
  const [selectedId, setSelectedId] = useState('demo-1');
  const [closes, setCloses] = useState(0);
  const ready = useRef<HTMLOutputElement>(null);
  useEffect(() => { ready.current?.setAttribute('data-ready', 'true'); }, []);
  const chat = chats.find(item => item.id === selectedId) ?? chats[0];
  return <>
    <div data-panes style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', height: 'var(--panes-height, 500px)' }}>
      <div data-pane="list" style={{ minHeight: 0 }}><ConversationList chats={chats} selectedId={selectedId} onSelect={setSelectedId} now={INBOX_NOW} /></div>
      <div data-pane="details" style={{ minHeight: 0 }}><ConversationDetails key={chat.id} chat={chat} onClose={() => setCloses(value => value + 1)} /></div>
    </div>
    <output aria-label="Fichas cerradas">{closes}</output>
    <output ref={ready} aria-label="Demo lista">Demo aislada</output>
  </>;
}

if (typeof document !== 'undefined') hydrateRoot(document.getElementById('root')!, <InboxFixture />);
