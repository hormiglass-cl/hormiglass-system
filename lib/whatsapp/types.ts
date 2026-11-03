export type ConversationState = 'assistant' | 'waiting' | 'seller' | 'closed';
export type MessageKind = 'customer' | 'assistant' | 'seller' | 'phone' | 'file' | 'event';

export interface ChatMessage {
  id: string;
  kind: MessageKind;
  text: string;
  at: number;
  delivery?: 'sent' | 'read';
}

export interface Conversation {
  id: string;
  contact: { name: string; phone: string; company: string };
  opportunity: { code: string; title: string; captured: string[] };
  state: ConversationState;
  pausedUntil?: number;
  unread: number;
  messages: ChatMessage[];
}

export interface ChatNotice {
  id: string;
  conversationId: string;
  kind: 'assigned' | 'warning' | 'resumed';
  text: string;
}

/** Frontend port. The demo adapter never reads or writes CRM records. */
export interface ConversationRepository {
  list(): Conversation[];
  get(id: string): Conversation | undefined;
  claim(id: string, now: number): void;
  release(id: string, now: number): void;
  close(id: string, now: number): void;
  send(id: string, text: string, now: number): void;
  receive(id: string, text: string, now: number): void;
  markRead(id: string): void;
  tick(now: number): void;
  notices(): ChatNotice[];
  dismissNotice(id: string): void;
}
