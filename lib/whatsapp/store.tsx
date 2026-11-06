'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createMockRepository } from './repository';
import type { ConversationRepository } from './types';

function useMockStore() {
  const repository = useRef<ConversationRepository | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [threadRequested, setThreadRequested] = useState(false);
  const [selection, setSelection] = useState<{ id: string; unreadAt?: string; unreadCount: number } | null>(null);
  const [snapshot, setSnapshot] = useState(() => ({ chats: [] as ReturnType<ConversationRepository['list']>, notices: [] as ReturnType<ConversationRepository['notices']>, now: 0 }));
  const refresh = useCallback(() => {
    const repo = repository.current;
    if (repo) setSnapshot({ chats: repo.list(), notices: repo.notices(), now: Date.now() });
  }, []);
  useEffect(() => {
    repository.current = createMockRepository();
    refresh();
    const timer = setInterval(() => {
      repository.current?.tick(Date.now());
      refresh();
    }, 1000);
    return () => clearInterval(timer);
  }, [refresh]);
  const act = useCallback((action: (repo: ConversationRepository, now: number) => void) => {
    if (!repository.current) return false;
    try {
      action(repository.current, Date.now());
      setError(null);
      refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar la acción.');
      refresh();
      return false;
    }
  }, [refresh]);
  const openChat = useCallback((id: string) => {
    act(repo => {
      const chat = repo.get(id);
      if (!chat) throw new Error('Conversación no encontrada.');
      const incoming = chat.messages.filter(message => message.kind === 'customer');
      setSelection({ id, unreadAt: chat.unread ? incoming[Math.max(0, incoming.length - chat.unread)]?.id : undefined, unreadCount: chat.unread });
      repo.markRead(id);
    });
  }, [act]);
  // One in-memory navigation intent, shared across the center and inbox. No URL
  // effect can reopen the mobile thread after the user returns to the list.
  const requestThread = (id: string) => {
    if (!repository.current?.get(id)) return false;
    openChat(id);
    setThreadRequested(true);
    return true;
  };
  return { ...snapshot, act, error, selection, openChat, requestThread, threadRequested, setThreadRequested };
}

const ChatContext = createContext<ReturnType<typeof useMockStore> | null>(null);

export function ConversationProvider({ children }: { children: ReactNode }) {
  const store = useMockStore();
  return <ChatContext.Provider value={store}>{children}</ChatContext.Provider>;
}

export function useConversations() {
  const context = useContext(ChatContext);
  if (!context) throw new Error('ConversationProvider is required.');
  return context;
}
