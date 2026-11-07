'use client';

import { useConversations } from '../../lib/whatsapp/store';
import { assignmentItems } from '../../lib/whatsapp/notifications';
import { Button } from '../ui/crm';

export function useAssignments(tab = 'principal', category = 'todas', search = '') {
  const { notices, chats } = useConversations();
  return assignmentItems(notices, chats, tab, category, search);
}

export function AssignmentNotifications({ tab, category, search, navigate }: { tab: string; category: string; search: string; navigate: (href: string) => void }) {
  const items = useAssignments(tab, category, search);
  const { act, requestThread } = useConversations();
  return <ul aria-label="Asignaciones WhatsApp de demostración" className="divide-y divide-line">
    {items.map(({ notice, customer }) => <li key={notice.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-accent-soft px-5 py-3 text-sm text-ink">
      <div><p className="font-semibold">{notice.text}</p><p>{customer}</p><p className="text-xs text-ink-muted">Demo · WhatsApp ficticio · solo en memoria</p></div>
      <div className="flex gap-2"><Button size="sm" onClick={() => {
        if (!requestThread(notice.conversationId)) return;
        act(repo => repo.dismissNotice(notice.id));
        navigate('/conversaciones');
      }}>Ver chat</Button><Button size="sm" variant="subtle" aria-label={`Descartar asignación demo de ${customer}`} onClick={() => act(repo => repo.dismissNotice(notice.id))}>Descartar demo</Button></div>
    </li>)}
  </ul>;
}
