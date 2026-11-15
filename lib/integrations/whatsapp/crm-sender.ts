import 'server-only';
import { createHmac } from 'node:crypto';

// CRM -> bot sender for revision 1.2b (chat.take / chat.release). Pure and injectable:
// the route supplies the exact body bytes stored in the outbox.
export const MAX_RESPONSE_BYTES = 8192;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [250, 750];
const TIMEOUT_MS = 10000;

export type CrmEventsConfig = { url: string; secret: string };
export type SendResult = { httpStatus: number | null; response: Record<string, unknown> | null; attempts: number };
export type SendDeps = { fetch?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void> };

// Off unless both values are valid; the outbound secret must differ from the inbound one.
export function parseCrmEventsConfig(env: Record<string, string | undefined>): CrmEventsConfig | null {
  const raw = env.WHATSAPP_CRM_EVENTS_URL; const secret = env.WHATSAPP_CRM_EVENTS_SECRET;
  if (!raw || !secret || secret.trim().length < 32 || secret === env.WHATSAPP_EVENTS_HMAC_SECRET) return null;
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return null; }
  if (parsed.username || parsed.password) return null;
  // Plain HTTP only for a bot running on this machine during local testing.
  const local = parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !local) return null;
  return { url: raw, secret };
}

// Canonical bytes: ASCII unix-seconds + one ASCII '.' + the unmodified body bytes.
export function signCrmEvent(secret: string, timestamp: string, body: string): string {
  return `v1=${createHmac('sha256', secret).update(`${timestamp}.`, 'ascii').update(Buffer.from(body, 'utf8')).digest('hex')}`;
}

// Reads at most `limit` bytes; returns null when the body is larger, missing or not a JSON object.
export async function readBoundedJson(response: Response, limit = MAX_RESPONSE_BYTES): Promise<Record<string, unknown> | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

// Up to 3 attempts; backoff only on 503 or network errors. Every attempt signs the identical
// body with a fresh timestamp. Any other HTTP status stops and is returned to the caller.
// A failure while reading the reply counts as a network error; the bot dedupes by event_id.
export async function sendCrmEvent(input: CrmEventsConfig & { body: string }, deps: SendDeps = {}): Promise<SendResult> {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  let last: SendResult = { httpStatus: null, response: null, attempts: 0 };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const timestamp = String(Math.floor(now() / 1000));
    try {
      const response = await doFetch(input.url, {
        method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json', 'X-CRM-Timestamp': timestamp, 'X-CRM-Signature': signCrmEvent(input.secret, timestamp, input.body) },
        body: input.body,
      });
      last = { httpStatus: response.status, response: await readBoundedJson(response), attempts: attempt };
      if (response.status !== 503) return last;
    } catch {
      last = { httpStatus: null, response: null, attempts: attempt };
    }
    if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_MS[attempt - 1]);
  }
  return last;
}
