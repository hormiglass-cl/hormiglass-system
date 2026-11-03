'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createMockRepository } from './repository';
import type { ConversationRepository } from './types';

function useMockStore() {
  const repository = useRef<ConversationRepository | null>(null);
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
    if (!repository.current) return;
    action(repository.current, Date.now());
    refresh();
  }, [refresh]);
  return { ...snapshot, act };
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
