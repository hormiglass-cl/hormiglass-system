'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { createClient } from '../../lib/supabase/client';
import { watchChatState } from '../../lib/whatsapp/chat-refresh';
import { Button } from '../ui/crm';

export type ChatAction = 'take' | 'release';
export type CommandStatus = 'sending' | 'retryable' | 'applied' | 'ignored_stale' | 'rejected' | 'abandoned';

export type ChatLastCommand = {
  type: 'chat.take' | 'chat.release';
  status: CommandStatus;
  http_status: number | null;
  error_code: string | null;
  holder_crm_seller_id: string | null;
  holder_name: string | null;
  updated_at: string;
};

/** Shape returned by the `whatsapp_chat_state` RPC (null when the opportunity has no lead link). */
export type ChatState = {
  ownership_version: number;
  owner: 'bot' | 'human';
  source: string | null;
  holder_crm_seller_id: string | null;
  holder_name: string | null;
  can_take: boolean;
  can_release: boolean;
  last_command: ChatLastCommand | null;
};

/** Result of the last click: the route's recorded outcome (`status`) or its refusal (`error`). */
export type ChatFeedback =
  | { kind: 'outcome'; action: ChatAction; status: CommandStatus; error_code: string | null }
  | { kind: 'refusal'; action: ChatAction; error: string };

type Message = { text: string; tone: 'status' | 'alert'; code?: string; retry?: ChatAction };

const REFUSALS: Record<string, string> = {
  forbidden: 'No tienes permiso para tomar o liberar este chat.',
  not_holder: 'Solo quien atiende el chat (o un administrador) puede liberarlo.',
  chat_not_taken: 'El chat ya está con el asistente.',
  already_holder: 'Ya estás atendiendo este chat.',
  command_in_progress: 'Hay otra solicitud en curso para este chat. Espera unos segundos.',
  chat_not_linked: 'Esta oportunidad ya no tiene un chat de WhatsApp vinculado.',
  chat_commands_unavailable: 'La conexión con el asistente aún no está activa.',
  result_unrecorded: 'No se pudo confirmar el resultado; revisa el estado en unos segundos.',
  network: 'No se pudo enviar la solicitud. Revisa tu conexión e inténtalo de nuevo.',
};

function conflictHolder(state: ChatState): string {
  const command = state.last_command;
  return command?.error_code === 'ownership_conflict' && command.holder_name ? command.holder_name : 'sin cuenta en el CRM';
}

function outcomeMessage(state: ChatState, action: ChatAction, status: CommandStatus, code: string | null): Message | null {
  switch (status) {
    case 'applied': return { text: 'El asistente confirmó el cambio.', tone: 'status' };
    case 'ignored_stale': return { text: 'El estado cambió en el asistente. Se actualizó la vista.', tone: 'status' };
    case 'retryable': return { text: 'El asistente no respondió. Puedes reintentar.', tone: 'alert', retry: action };
    case 'rejected':
      if (code === 'ownership_conflict') return { text: `Otro vendedor atiende este chat: ${conflictHolder(state)}`, tone: 'alert' };
      return { text: 'El asistente rechazó la solicitud. Si se repite, avisa a soporte.', tone: 'alert', code: code ?? 'rejected' };
    default: return null;
  }
}

function describe(state: ChatState, feedback?: ChatFeedback): Message | null {
  if (feedback?.kind === 'refusal') {
    const text = REFUSALS[feedback.error];
    return text
      ? { text, tone: feedback.error === 'result_unrecorded' ? 'status' : 'alert' }
      : { text: 'No se pudo completar la solicitud.', tone: 'alert', code: feedback.error };
  }
  if (feedback) return outcomeMessage(state, feedback.action, feedback.status, feedback.error_code);
  // After a reload, the last unresolved command is still visible.
  const last = state.last_command;
  if (last && (last.status === 'retryable' || last.status === 'rejected')) {
    return outcomeMessage(state, last.type === 'chat.take' ? 'take' : 'release', last.status, last.error_code);
  }
  return null;
}

export function ChatOwnershipControl({ state, sending = false, feedback, onAction }: {
  state: ChatState;
  sending?: boolean;
  feedback?: ChatFeedback;
  onAction: (action: ChatAction) => void;
}) {
  const unavailable = feedback?.kind === 'refusal' && feedback.error === 'chat_commands_unavailable';
  const message = sending ? null : describe(state, feedback);
  const allowed = (action: ChatAction) => !unavailable && (action === 'take' ? state.can_take : state.can_release);
  const retry = message?.retry && allowed(message.retry) ? message.retry : null;
  const holder = state.owner === 'human'
    ? `Atendido por ${state.holder_name ?? 'un vendedor sin cuenta en el CRM'}`
    : 'Asistente (bot)';

  return <section aria-label="Atención del chat" className="rounded-control border border-line bg-surface p-3 text-sm text-ink">
    <h3 className="font-semibold">Atención del chat</h3>
    <p className="mt-1 text-xs text-ink-muted">Ahora: <span className="font-semibold text-ink">{holder}</span></p>
    {sending && <p role="status" className="mt-2 text-xs text-ink-muted">Enviando al asistente…</p>}
    {message && <div role={message.tone} className={`mt-2 text-xs ${message.tone === 'alert' ? 'text-danger' : 'text-ink-muted'}`}>
      <p>{message.text}</p>
      {message.code && <p className="mt-0.5 text-ink-muted">Código: {message.code}</p>}
    </div>}
    {(allowed('take') || allowed('release') || retry) && <div className="mt-2 flex flex-wrap gap-2">
      {retry && <Button size="sm" variant="primary" disabled={sending} aria-label={retry === 'take' ? 'Reintentar tomar el chat' : 'Reintentar liberar el chat'} onClick={() => onAction(retry)}>Reintentar</Button>}
      {allowed('take') && retry !== 'take' && <Button size="sm" variant="primary" disabled={sending} onClick={() => onAction('take')}>Tomar chat</Button>}
      {allowed('release') && retry !== 'release' && <Button size="sm" disabled={sending} onClick={() => onAction('release')}>Liberar chat</Button>}
    </div>}
  </section>;
}

/** Key by opportunity ID. Renders `fallback` when the opportunity has no WhatsApp lead link. */
export function ChatOwnershipSection({ supabase, opportunityId, fallback = null }: {
  supabase: ReturnType<typeof createClient>;
  opportunityId: string;
  fallback?: ReactNode;
}) {
  const [state, setState] = useState<ChatState | null | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<ChatFeedback | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);
  // Set when a command finished; only the re-read after it ends the sending state, so a
  // background refresh during a send never re-enables the buttons early.
  const commandDone = useRef(false);

  // Ownership also changes outside this view (bot, ClickUp, 2-hour window): keep re-reading.
  useEffect(() => watchChatState(() => setReloadKey((key) => key + 1)), []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase.rpc('whatsapp_chat_state', { p_opportunity_id: opportunityId });
      if (!active) return;
      if (commandDone.current) { commandDone.current = false; setSending(false); }
      if (error) {
        // Keep the last confirmed state on a failed refresh; the first load falls back.
        setLoadError('No se pudo cargar el estado del chat.');
        setState((current) => current ?? null);
        return;
      }
      setLoadError('');
      setState((data as ChatState | null) ?? null);
    })();
    return () => { active = false; };
  }, [supabase, opportunityId, reloadKey]);

  // Never optimistic: the view changes only after the route answers and the state is re-read.
  const run = async (action: ChatAction) => {
    setSending(true);
    setFeedback(undefined);
    let next: ChatFeedback;
    try {
      const response = await fetch('/api/integrations/whatsapp/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ opportunity_id: opportunityId, action }),
      });
      const body = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (body && typeof body.status === 'string') {
        next = { kind: 'outcome', action, status: body.status as CommandStatus, error_code: typeof body.error_code === 'string' ? body.error_code : null };
      } else {
        next = { kind: 'refusal', action, error: body && typeof body.error === 'string' ? body.error : 'command_failed' };
      }
    } catch {
      next = { kind: 'refusal', action, error: 'network' };
    }
    setFeedback(next);
    commandDone.current = true;
    setReloadKey((key) => key + 1);
  };

  if (state === undefined) return null;
  if (state === null) return loadError ? <p role="alert" className="text-xs text-danger">{loadError}</p> : <>{fallback}</>;
  return <>
    {loadError && <p role="alert" className="text-xs text-danger">{loadError}</p>}
    <ChatOwnershipControl state={state} sending={sending} feedback={feedback} onAction={(action) => void run(action)} />
  </>;
}
