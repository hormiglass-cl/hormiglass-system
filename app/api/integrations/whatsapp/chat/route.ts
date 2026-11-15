import { createClient } from '../../../../../lib/supabase/server';
import { sendCrmEvent } from '../../../../../lib/integrations/whatsapp/crm-sender';
import { crmCommandsConfig, recordCommandResult } from '../../../../../lib/integrations/whatsapp/server';

// Revision 1.2b: a seller or admin takes/releases the WhatsApp chat of an opportunity.
// The CRM state changes only after the bot confirms; the outbox row holds the exact bytes.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const UUID = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const refused: Record<string, number> = {
  forbidden: 403, not_holder: 403, chat_not_linked: 404, invalid_command: 400,
  chat_not_taken: 409, already_holder: 409, command_in_progress: 409,
};
const failure = (status: number, error: string) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  const config = crmCommandsConfig();
  if (!config) return failure(503, 'chat_commands_unavailable');
  let input: unknown;
  try { input = await request.json(); } catch { return failure(400, 'invalid_request'); }
  const { opportunity_id: opportunityId, action } = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  if (typeof opportunityId !== 'string' || !UUID.test(opportunityId) || (action !== 'take' && action !== 'release')) return failure(400, 'invalid_request');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('whatsapp_chat_command', { p_opportunity_id: opportunityId, p_type: `chat.${action}` });
  if (error) {
    // 42501: no session (anon has no EXECUTE grant).
    const code = error.code === '42501' ? 'forbidden' : error.code === 'P0001' && Object.hasOwn(refused, error.message) ? error.message : null;
    return code ? failure(refused[code], code) : failure(500, 'command_failed');
  }
  if (!data || typeof data.event_id !== 'string' || typeof data.body !== 'string') return failure(500, 'command_failed');

  const sent = await sendCrmEvent({ url: config.bot.url, secret: config.bot.secret, body: data.body });
  const outcome = await recordCommandResult(config, data.event_id, sent);
  // The row stays `sending`; after 60 seconds a new click resends the same bytes.
  if (!outcome) return failure(503, 'result_unrecorded');
  return Response.json(outcome, { headers: { 'Cache-Control': 'no-store' } });
}
