import { useEffect, useRef, useState } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { ChatHeader, ChatStatusBanner, type ChatAction } from '../../components/whatsapp/ChatPrimitives';
import { createMockRepository } from '../../lib/whatsapp/repository';

export function HeaderFixture() {
  const now = 1800000000000;
  const [repo] = useState(() => createMockRepository(now));
  const [chat, setChat] = useState(() => repo.get('demo-1')!);
  const [history, setHistory] = useState(0);
  const ready = useRef<HTMLOutputElement>(null);
  const act = (action: ChatAction) => {
    repo[action](chat.id, now);
    setChat(repo.get(chat.id)!);
  };
  useEffect(() => { ready.current?.setAttribute('data-ready', 'true'); }, []);
  return <>
    <section aria-label="Chat container" className="flex h-60 flex-col overflow-hidden rounded-panel border border-line">
      <ChatHeader chat={chat} onAction={act} onHistory={() => setHistory(value => value + 1)} />
      <ChatStatusBanner chat={chat} now={now + 14000} onAction={act} />
      <div className="min-h-0 flex-1 overflow-y-auto">Mensajes de demostración</div>
    </section>
    <button type="button">Fuera del chat</button>
    <output aria-label="Historial abierto">{history}</output>
    <output ref={ready} aria-label="Demo lista">Demo aislada</output>
  </>;
}

if (typeof document !== 'undefined') hydrateRoot(document.getElementById('root')!, <HeaderFixture />);
