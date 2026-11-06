import type { ChatNotice, Conversation } from './types';

/** Separate demo view models, never Notificacion records or database IDs. */
export function assignmentItems(notices: ChatNotice[], chats: Conversation[], tab = 'principal', category = 'todas', search = '') {
  if (tab !== 'principal' || !['todas', 'no_leidas', 'recordatorios'].includes(category)) return [];
  const query = search.trim().toLocaleLowerCase('es');
  return notices.filter(notice => notice.kind === 'assigned').flatMap(notice => {
    const chat = chats.find(item => item.id === notice.conversationId);
    return chat && `${notice.text} ${chat.contact.name} Demo WhatsApp`.toLocaleLowerCase('es').includes(query) ? [{ notice, customer: chat.contact.name }] : [];
  });
}
