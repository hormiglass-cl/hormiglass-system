import { createHmac, timingSafeEqual } from 'node:crypto';

// Canonical bytes: ASCII unix-seconds + one ASCII '.' + the unmodified body bytes.
export function verifySignature(raw: Uint8Array, timestamp: string | null, signature: string | null, secret: string, now = Date.now()): boolean {
  if (!timestamp || !/^[0-9]{10}$/.test(timestamp) || !signature || !/^v1=[a-f0-9]{64}$/.test(signature)) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.`, 'ascii').update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(3), 'hex'));
}
