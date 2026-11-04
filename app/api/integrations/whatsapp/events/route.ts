import { createHash } from 'node:crypto';
import { validEvent } from '../../../../../lib/integrations/whatsapp/events';
import { verifySignature } from '../../../../../lib/integrations/whatsapp/hmac';
import { persistEvent, PersistenceError, receiverConfig } from '../../../../../lib/integrations/whatsapp/server';

export const runtime = 'nodejs';
const MAX_BYTES = 65536;
const failure = (status: number, error: string) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
  const config = receiverConfig();
  if (!config) return failure(503, 'receiver_unavailable');
  if (Number(request.headers.get('content-length')) > MAX_BYTES) return failure(413, 'payload_too_large');
  const reader = request.body?.getReader();
  if (!reader) return failure(400, 'invalid_event');
  let raw: Buffer;
  try {
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) { await reader.cancel(); return failure(413, 'payload_too_large'); }
      chunks.push(value);
    }
    raw = Buffer.concat(chunks);
  } catch { return failure(400, 'invalid_event'); }
  if (!verifySignature(raw, request.headers.get('x-whatsapp-timestamp'), request.headers.get('x-whatsapp-signature'), config.secret)) return failure(401, 'unauthorized');
  let event: unknown;
  try { event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
  catch { return failure(400, 'invalid_event'); }
  if (!validEvent(event)) return failure(400, 'invalid_event');
  try {
    const result = await persistEvent(config, event, createHash('sha256').update(raw).digest('hex'));
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return error instanceof PersistenceError ? failure(error.status, error.code) : failure(503, 'persistence_unavailable');
  }
}
