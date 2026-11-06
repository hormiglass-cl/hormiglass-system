'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useConversations } from '../../lib/whatsapp/store';
import { assignmentItems } from '../../lib/whatsapp/notifications';
import { Button } from '../ui/crm';

export function useAssignments(tab = 'principal', category = 'todas', search = '') {
  const { notices, chats } = useConversations();
  return assignmentItems(notices, chats, tab, category, search);
}

/** The real bell destination and unread subscription remain owned by Navbar. */
export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  const count = unreadCount + useAssignments().length;
  return <Link href="/notificaciones" prefetch={true} aria-label="Notificaciones" title="Notificaciones" className="relative grid h-9 w-9 place-items-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink">
    <Bell size={19} aria-hidden />
    {count > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 t-micro t-num font-bold text-on-accent">{count > 99 ? '99+' : count}</span>}
  </Link>;
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
