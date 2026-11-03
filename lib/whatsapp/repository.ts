import type { ChatMessage, ChatNotice, Conversation, ConversationRepository } from './types.ts';

const HOUR = 60 * 60 * 1000;

/** Every instance owns its data. Nothing is persisted or sent to WhatsApp. */
export function createMockRepository(start = Date.now()): ConversationRepository {
  let sequence = 0;
  const message = (kind: ChatMessage['kind'], text: string, at = start): ChatMessage => ({
    id: `message-${++sequence}`, kind, text, at,
    ...(['assistant', 'seller', 'phone', 'file'].includes(kind) ? { delivery: 'read' as const } : {}),
  });
  const chats: Conversation[] = [
    {
      id: 'demo-1', contact: { name: 'Camila Rojas', phone: '+56 9 5555 0101', company: 'Constructora Los Robles' },
      opportunity: { code: 'DEMO-6056', title: 'Cierre perimetral · 120 m²', captured: ['120 m² de placas de hormigón', 'Entrega en Colina', 'Solicita visita a terreno'] },
      state: 'waiting', unread: 1,
      messages: [message('customer', 'Hola, necesito cotizar un cierre perimetral para una obra en Colina.', start - 600000), message('assistant', '¡Hola, Camila! ¿Cuántos metros cuadrados necesitan?', start - 540000), message('customer', 'Son 120 m². ¿Podemos coordinar una visita?', start - 480000), message('event', 'Derivado a Ventas · asignado a ti por turno', start - 470000)],
    },
    {
      id: 'demo-2', contact: { name: 'Diego Muñoz', phone: '+56 9 5555 0102', company: 'Obras del Valle' },
      opportunity: { code: 'DEMO-6057', title: 'Paneles para bodega', captured: ['Paneles prefabricados', 'Entrega en Lampa'] },
      state: 'assistant', unread: 0,
      messages: [message('customer', '¿Tienen paneles para una bodega?', start - 300000), message('assistant', 'Sí, cuéntame las medidas y la ubicación de la obra.', start - 290000)],
    },
    {
      id: 'demo-3', contact: { name: 'Valentina Soto', phone: '+56 9 5555 0103', company: 'Arquitectura Sur' },
      opportunity: { code: 'DEMO-6058', title: 'Cotización de placas', captured: ['80 placas', 'Retiro en planta'] },
      state: 'seller', pausedUntil: start + HOUR, unread: 0,
      messages: [message('customer', '¿Me enviás la cotización actualizada?', start - 120000), message('event', 'Tomaste la conversación', start - 115000), message('phone', 'Hola, Valentina. Te la comparto enseguida.', start - 110000), message('file', 'Cotización OP-2026-6056.pdf · 340 KB', start - 100000), { ...message('seller', 'Quedo atento a tus comentarios.', start - 90000), delivery: 'sent' }],
    },
    {
      id: 'demo-4', contact: { name: 'Pablo Torres', phone: '+56 9 5555 0104', company: 'Torres Construcciones' },
      opportunity: { code: 'DEMO-6059', title: 'Consulta de disponibilidad', captured: ['Consulta resuelta'] },
      state: 'closed', unread: 0,
      messages: [message('customer', 'Muchas gracias por la información.', start - HOUR), message('event', 'Conversación cerrada', start - HOUR + 1000)],
    },
  ];
  let notifications: ChatNotice[] = [{ id: 'assigned-demo-1', conversationId: 'demo-1', kind: 'assigned', text: 'Nuevo cliente asignado a ti' }];
  const warned = new Set<string>();
  const requireChat = (id: string) => {
    const chat = chats.find(item => item.id === id);
    if (!chat) throw new Error('Conversación no encontrada.');
    return chat;
  };
  const event = (chat: Conversation, text: string, now: number) => chat.messages.push(message('event', text, now));
  const notify = (chat: Conversation, kind: ChatNotice['kind'], text: string) => {
    notifications.push({ id: `notice-${++sequence}`, conversationId: chat.id, kind, text });
  };
  return {
    list: () => structuredClone(chats),
    get: id => structuredClone(chats.find(chat => chat.id === id)),
    claim(id, now) {
      const chat = requireChat(id);
      if (chat.state === 'seller') return;
      if (chat.state === 'closed') throw new Error('La conversación está cerrada.');
      chat.state = 'seller';
      chat.pausedUntil = now + HOUR;
      chat.unread = 0;
      warned.delete(id);
      event(chat, 'Tomaste la conversación', now);
    },
    release(id, now) {
      const chat = requireChat(id);
      if (chat.state !== 'seller') return;
      chat.state = 'assistant';
      delete chat.pausedUntil;
      event(chat, 'Devolviste la conversación al asistente', now);
    },
    close(id, now) {
      const chat = requireChat(id);
      if (chat.state === 'closed') return;
      chat.state = 'closed';
      delete chat.pausedUntil;
      event(chat, 'Conversación cerrada', now);
    },
    send(id, text, now) {
      const chat = requireChat(id);
      if (chat.state !== 'seller' || (chat.pausedUntil ?? 0) <= now) throw new Error('Toma la conversación para responder al cliente.');
      if (!text.trim()) throw new Error('Escribe un mensaje.');
      chat.messages.push({ ...message('seller', text.trim(), now), delivery: 'sent' });
    },
    receive(id, text, now) {
      const chat = requireChat(id);
      if (!text.trim()) throw new Error('Escribe un mensaje.');
      if (chat.state === 'closed') chat.state = 'assistant';
      chat.messages.push(message('customer', text.trim(), now));
      chat.unread++;
    },
    markRead(id) { requireChat(id).unread = 0; },
    tick(now) {
      for (const chat of chats) {
        if (chat.state !== 'seller' || !chat.pausedUntil) continue;
        const remaining = chat.pausedUntil - now;
        if (remaining <= 0) {
          chat.state = 'assistant';
          delete chat.pausedUntil;
          event(chat, 'Plazo vencido · el asistente retomó', now);
          notify(chat, 'resumed', 'El asistente retomó una conversación');
        } else if (remaining <= 5 * 60000 && !warned.has(chat.id)) {
          warned.add(chat.id);
          notify(chat, 'warning', 'Tu plazo vence en 5 min');
        }
      }
    },
    notices: () => structuredClone(notifications),
    dismissNotice(id) { notifications = notifications.filter(notice => notice.id !== id); },
  };
}
