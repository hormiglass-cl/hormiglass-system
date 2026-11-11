import 'server-only';
import type { WhatsAppEvent } from './events';

const DEV_URL = 'https://whbqrracrxmeuyerrbdg.supabase.co';
export function receiverConfig() {
  const env = process.env;
  const secret = env.WHATSAPP_EVENTS_HMAC_SECRET;
  const key = env.WHATSAPP_EVENTS_SERVICE_ROLE_KEY;
  // Deliberately compare literal strings: URL parsing would normalize forbidden ports/paths.
  if (env.WHATSAPP_EVENTS_ENABLED !== 'true' || env.WHATSAPP_EVENTS_SUPABASE_URL !== DEV_URL || !secret || secret.trim().length < 32 || !key?.trim()) return null;
  return { url: DEV_URL, secret, key };
}
export class PersistenceError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
const knownErrors: Record<string, number> = {
  event_conflict: 409, identity_conflict: 409, revision_conflict: 409,
  ownership_conflict: 409, protocol_revision_required: 409,
  rut_required: 422, invalid_seller: 422, ambiguous_customer: 422,
  invalid_opportunity: 422, invalid_event: 400,
};
export async function persistEvent(config: NonNullable<ReturnType<typeof receiverConfig>>, event: WhatsAppEvent, hash: string) {
  try {
    const response = await fetch(`${config.url}/rest/v1/rpc/whatsapp_receive_event`, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', apikey: config.key, Authorization: `Bearer ${config.key}` },
      body: JSON.stringify({ p_event: event, p_hash: hash }),
    });
    // Bound the reply, too. The RPC returns only IDs/status, never an inbound payload.
    const reader = response.body?.getReader();
    if (!reader) throw new Error('empty_response');
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 8192) { await reader.cancel(); throw new Error('response_too_large'); }
      chunks.push(value);
    }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!response.ok) {
      const code = result?.message;
      if (result?.code === 'P0001' && Object.hasOwn(knownErrors, code)) throw new PersistenceError(knownErrors[code], code);
      throw new Error('rpc_failure');
    }
    if (!result || typeof result !== 'object' || Array.isArray(result) || result.event_id !== event.event_id) throw new Error('invalid_result');
    const uuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
    let keys: string[];
    let valid: boolean;
    switch (event.type) {
      case 'lead.qualified':
        keys = ['event_id', 'crm_customer_id', 'crm_opportunity_id'];
        valid = uuid(result.crm_customer_id) && uuid(result.crm_opportunity_id);
        // 1.2 results carry the processing status (S5); 1.1/legacy results stay unchanged.
        if (event.protocol_revision === '1.2') { keys.push('status'); valid = valid && ['created', 'updated', 'ignored_stale', 'duplicate'].includes(result.status); }
        break;
      case 'message.new':
        keys = ['event_id', 'crm_message_id']; valid = uuid(result.crm_message_id);
        if (event.protocol_revision === '1.2') { keys.push('status'); valid = valid && ['created', 'duplicate'].includes(result.status); }
        break;
      case 'ownership.taken':
      case 'ownership.released': {
        keys = ['event_id', 'ownership_version', 'owner'];
        valid = Number.isInteger(result.ownership_version) && result.ownership_version >= Number(event.data.version) && result.ownership_version <= 2147483647;
        if (event.protocol_revision === '1.1' || event.protocol_revision === '1.2') {
          keys.push('crm_seller_id', 'source');
          // A stale 1.1 request may observe newer 1.2 CRM-originated state.
          // Input gating and the equal-version check below still enforce the requested source.
          const humanSources = ['clickup', 'crm'];
          valid = valid && ((result.owner === 'bot' && result.crm_seller_id === null && result.source === null)
            || (result.owner === 'human' && (result.crm_seller_id === null || uuid(result.crm_seller_id)) && humanSources.includes(result.source)));
          if (result.ownership_version === event.data.version) {
            valid = valid && (event.type === 'ownership.released' ? result.owner === 'bot'
              : result.owner === 'human' && (result.crm_seller_id === event.data.crm_seller_id
                || (typeof result.crm_seller_id === 'string' && typeof event.data.crm_seller_id === 'string' && result.crm_seller_id.toLowerCase() === event.data.crm_seller_id.toLowerCase())) && result.source === event.data.source);
          }
        } else valid = valid && result.owner === 'bot';
        break;
      }
      case 'handoff.created':
        keys = ['event_id', 'external_handoff_id', 'crm_case_id', 'crm_opportunity_id', 'status'];
        if (event.protocol_revision === '1.1' || event.protocol_revision === '1.2') {
          keys.push('routing_status');
          valid = result.external_handoff_id === event.data.handoff_id
            && ['pending_routing', 'routed'].includes(result.routing_status)
            && ((event.data.kind === 'operational' && result.status === 'operational' && result.crm_case_id === null && result.crm_opportunity_id === null)
              || (event.data.kind !== 'operational' && result.status === 'pending_association' && result.crm_case_id === null && result.crm_opportunity_id === null && result.routing_status === 'pending_routing')
              || (event.data.kind === 'commercial' && result.status === 'associated' && result.crm_case_id === null && uuid(result.crm_opportunity_id))
              || (event.data.kind === 'complaint' && result.status === 'associated' && uuid(result.crm_case_id) && uuid(result.crm_opportunity_id)));
          break;
        }
        valid = result.external_handoff_id === event.data.handoff_id && (
          (result.status === 'associated' && event.data.kind === 'complaint' && uuid(result.crm_case_id) && uuid(result.crm_opportunity_id)) ||
          (result.status === (event.data.kind === 'complaint' ? 'pending_association' : 'operational') && result.crm_case_id === null && result.crm_opportunity_id === null)
        ); break;
    }
    if (!valid || Object.keys(result).length !== keys.length || Object.keys(result).some(key => !keys.includes(key))) throw new Error('invalid_result');
    return result;
  } catch (error) {
    if (error instanceof PersistenceError) throw error;
    // Never propagate database details, transport errors, headers or PII.
    throw new PersistenceError(503, 'persistence_unavailable');
  }
}
