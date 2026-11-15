'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { createClient } from '../../lib/supabase/client';
import { useConversations } from '../../lib/whatsapp/store';
import { Button, EmptyState, Tabs } from '../ui/crm';
import { ChatOwnershipSection } from './ChatOwnershipControl';
import { ChatWorkspace } from './ChatWorkspace';
import { DemoNotice } from './InboxParts';

export function UnlinkedChat({ onDemo }: { onDemo: () => void }) {
  return <EmptyState title="No hay un chat de WhatsApp vinculado" description="Esta venta real no está conectada a WhatsApp. Puedes explorar una conversación ficticia sin vincularla ni modificar la oportunidad." action={<Button onClick={onDemo}>Ver conversación demo sin vincular</Button>} />;
}

export function CapturedDataPending() {
  return <section className="mt-3 rounded-control border border-line bg-surface p-3 text-sm text-ink"><h3 className="font-semibold">Datos capturados por el asistente</h3><p className="mt-1 text-xs text-ink-muted">Integración pendiente: no hay datos del asistente disponibles para esta oportunidad. Los ejemplos de la bandeja demo no pertenecen a esta venta.</p></section>;
}

/**
 * Key this component by opportunity ID: changing records resets tab and demo opt-in.
 * With `supabase` and `opportunityId`, a linked chat shows its ownership control; unlinked keeps the demo.
 */
export function OpportunityActivity({ children, onClose, supabase, opportunityId }: {
  children: ReactNode;
  onClose: () => void;
  supabase?: ReturnType<typeof createClient>;
  opportunityId?: string;
}) {
  const [tab, setTab] = useState('activity');
  const [demo, setDemo] = useState(false);
  const { chats, openChat } = useConversations();
  const demoChat = chats.find(chat => chat.id === 'demo-1');
  const unlinked = demo ? <>
    <DemoNotice />
    <p className="text-xs font-semibold text-ink-muted">Conversación ficticia de Camila · sin vínculo con esta venta</p>
    <Button size="sm" onClick={() => setDemo(false)}>Salir de la demo</Button>
    <div className="flex h-[clamp(360px,60dvh,640px)] shrink-0 flex-col"><ChatWorkspace conversationId="demo-1" /></div>
  </> : <UnlinkedChat onDemo={() => { openChat('demo-1'); setDemo(true); }} />;
  return <>
    <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
      <Tabs label="Actividad de la oportunidad" active={tab} onChange={setTab} items={[{ id: 'activity', label: 'Actividad' }, { id: 'whatsapp', label: demo ? 'WhatsApp · demo' : 'WhatsApp', count: demo ? demoChat?.unread ?? 0 : 0 }]} />
      {tab === 'whatsapp' && <Button size="sm" onClick={onClose} aria-label="Cerrar oportunidad">Cerrar</Button>}
    </div>
    {tab === 'activity' ? children : <div role="tabpanel" aria-label="WhatsApp" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      {supabase && opportunityId ? <ChatOwnershipSection supabase={supabase} opportunityId={opportunityId} fallback={unlinked} /> : unlinked}
    </div>}
  </>;
}
