# WhatsApp inbound receiver — proposed v1 contract

**Local implementation, disabled by default; not a live integration.** This is a technical proposal for the bot agent to agree and implement. It accepts four inbound event types atomically. It does **not** establish ClickUp parity or replace the bot's existing workflows.

## Before connecting the bot

1. Agree this wire contract and share **development** seller UUID mappings with the bot agent (`usuarios.id`, not `auth_id` or ClickUp IDs). The bot owns rotation.
2. Complete the development schema preflight below; apply the additive migration to that development project only after approval.
3. Provision an independent dev service credential and random shared HMAC secret securely. Neither is currently supplied by this delivery.
4. Deploy an approved **HTTPS development CRM** endpoint; configure the bot to send to `POST /api/integrations/whatsapp/events`. No endpoint is deployed by this delivery.
5. Explicitly enable the receiver and test end-to-end in development. Keep existing ClickUp behavior running until broader parity is independently verified.

No production request, migration, deployment, `.env` edit, real bot change or ClickUp change is part of this work.

### Server-only configuration

| Variable (new) | Required value |
|---|---|
| `WHATSAPP_EVENTS_ENABLED` | Exactly `true`; missing/anything else disables the receiver |
| `WHATSAPP_EVENTS_SUPABASE_URL` | Exactly `https://whbqrracrxmeuyerrbdg.supabase.co` |
| `WHATSAPP_EVENTS_SERVICE_ROLE_KEY` | Explicit development service-role credential, never a browser/public variable |
| `WHATSAPP_EVENTS_HMAC_SECRET` | Independent shared secret, at least 32 non-whitespace characters; use a securely generated high-entropy value |

No shared Supabase client, cookie authentication or fallback URL/key is used. URL equality is literal: even a trailing slash, explicit port 443, credentials, query, fragment, alternative host, custom host or path is rejected **before network access**. The exact proxy path bypass occurs before cookie work; API siblings retain their existing behavior. Importing the route does not initialize a client or read configuration. Disabled/missing/invalid configuration returns `503 {"error":"receiver_unavailable"}` without network activity.

## Authentication and retries

Send `Content-Type: application/json`, UTF-8 body, maximum **65,536 raw bytes** (including whitespace). Unknown fields are rejected by the HTTP validator; use a new agreed schema version for extensions.

| Header | Format |
|---|---|
| `X-WhatsApp-Timestamp` | Ten decimal digits: Unix seconds at **delivery time** |
| `X-WhatsApp-Signature` | `v1=` followed by 64 lowercase hexadecimal HMAC-SHA256 characters |

Canonical signed bytes are **ASCII timestamp + ASCII `.` + unchanged raw body bytes**. There is no method, path, newline, JSON sorting, trimming or re-encoding in the signature. Comparison is constant-time after checking signature length/format. The timestamp must be within **±300 seconds**, inclusive, of the CRM clock. Synchronize clocks.

Bot-side Node example (illustrative; no real secrets):

```js
import { createHmac } from 'node:crypto';
const raw = Buffer.from(JSON.stringify(event), 'utf8'); // retain these exact bytes for retries
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = 'v1=' + createHmac('sha256', sharedDevSecret)
  .update(timestamp + '.', 'ascii').update(raw).digest('hex');
// HTTPS POST to the agreed development endpoint, body: raw
// headers: X-WhatsApp-Timestamp: timestamp, X-WhatsApp-Signature: signature
```

**Retry with the same event ID and identical body bytes, but a fresh transport timestamp/signature.** A different JSON serialization is a different event payload, even if semantically equivalent. The receiver hashes raw bytes with SHA256. A committed duplicate returns the exact stored result; changed-byte reuse of an event ID returns 409. Do not regenerate event IDs after transport errors: a timeout can occur after commit. Use exponential backoff with jitter for 503/network errors; reconcile 400/401/409/422 before retrying. There are no automatic server-side retries or redirects.

## Envelope and event examples

All events use this envelope:

```json
{
  "schema_version": 1,
  "event_id": "evt-20261104-001",
  "type": "lead.qualified",
  "conversation_id": "wa-conversation-123",
  "data": {
    "lead_id": "bot-lead-456",
    "revision": 1,
    "phone": "+56912345678",
    "name": "Development Test",
    "rut": "12345678-5",
    "crm_seller_id": "10000000-0000-4000-8000-000000000001",
    "title": "Glass requirement",
    "requirement": "Supply and install glass; dimensions pending"
  }
}
```

Example identity numbers/UUIDs above are placeholders, not provisioned accounts. `event_id`, `conversation_id`, `lead_id`, `handoff_id`, `message_id`: 1–128 ASCII characters, first alphanumeric, remaining alphanumeric or `. _ : -`. IDs are global within this bot integration, not per conversation. Do not reuse them for another entity. Revision/version: integer 1–2,147,483,647.

### `lead.qualified`

The example above shows all allowed fields. `rut` is optional in the protocol **only when the target schema permits it or the phone matches an existing customer**. No RUT is invented, and no schema is relaxed. Name/title: nonblank, up to 200 characters; requirement: nonblank, up to 16,000; supplied RUT: nonblank, up to 32. Phone is canonical international `+` followed by 8–15 digits, first digit nonzero. Seller must be an active `user` or `admin` in `usuarios`; there is no local rotation or fallback seller.

The RPC normalizes stored customer phones to digits. Exactly one match is reused; multiple matches return `ambiguous_customer` without writes. A new customer and new opportunity are created atomically with UUID-based `OP-WA-<full-uuid>` code. External lead and conversation link to the same customer/opportunity permanently. A conflicting identity is rejected. Different external leads may share a customer but not an opportunity.

Corrections use a **new event ID, same lead/conversation/phone and increasing revision**. Same revision/same data is accepted; same revision/different data is `revision_conflict`; older revisions are acknowledged without changing the latest requirement. A SHA256 of normalized JSONB requirement data accompanies the revision. Newer requirements are stored separately in the service-only `whatsapp_lead_links.bot_requirement`, and a notification goes to the opportunity's **current seller**. Pipeline, assignment, financials, products and human notes are never overwritten. A corrected seller field does not reassign the opportunity. The notification is created in the existing table, but a human review screen for this separate requirement is not connected yet.

Result: `{"event_id":"evt-20261104-001","crm_customer_id":"<uuid>","crm_opportunity_id":"<uuid>"}`.

### `handoff.created`

Use the same envelope, replacing `type`, `event_id` and `data`:

```json
{
  "handoff_id": "bot-handoff-1",
  "kind": "complaint",
  "description": "Customer reports damaged glass",
  "crm_opportunity_id": "20000000-0000-4000-8000-000000000001",
  "postventa_type": "dano_transporte"
}
```

`kind`: `complaint` or `operational`; description: nonblank, up to 16,000 characters. Opportunity UUID and Postventa type are optional **for complaints only**. Supported types: `producto_defectuoso`, `problema_fabricacion`, `problema_instalacion`, `dano_transporte`, `uso_incorrecto`, `movimiento_terreno`, `trabajo_adicional`, `dano_terceros`, `faltante`, `defecto`, `cantidad_adicional`, `otro` (default). This event does not authorize quantities/additional works automatically.

A complaint uses the supplied valid opportunity or the conversation's linked opportunity. Conflicting supplied-vs-linked opportunities are rejected. A supplied unknown opportunity, or no linked opportunity, is preserved as `pending_association`: **no fake sale/customer/case**. A valid association inserts existing `postventa_casos`, `estado=recibido`, `tipo` as above, actual seller in `vendedor_id`, customer in `cliente_id`, and no fabricated `responsable_id` or logistics `evento_id`. `PV-WA-<full-case-uuid>` folios avoid collisions without changing/calling the shared count-based generator.

An operational handoff is distinct stored work, not Postventa. Example data: `{"handoff_id":"bot-handoff-2","kind":"operational","description":"Delivery scheduling needs a person"}`.

Result keys: `event_id`, `external_handoff_id`, `crm_case_id` (UUID or null), `crm_opportunity_id` (UUID or null), `status` (`associated`, `pending_association`, `operational`). Retrying the same handoff ID with a new event ID and identical data never creates a second case or resets human management. Changed immutable handoff data returns `identity_conflict`. Original event duplicates always return their stored result, even after later association.

### Controlled pending association (service only)

`public.whatsapp_associate_handoff(p_handoff_id text, p_opportunity_id uuid)` associates one existing complaint with a valid existing opportunity. It uses the **same case insertion path as ingestion**, takes the integration lock, preserves the handoff identity and returns `crm_case_id`, `crm_opportunity_id`, `status=associated`. Same association retries return the same case; reassociation conflicts. Unknown handoff/operational handoff: `invalid_event`; unknown opportunity: `invalid_opportunity`. It never modifies existing case state/management.

This is **not a public HTTP endpoint**. A future authenticated human UI/server action must validate operator authorization and call this RPC server-side with the service credential. That UI is **not connected**; do not put the service key into the browser or grant this RPC to authenticated users to work around it.

### `message.new`

```json
{
  "message_id": "wa-source-message-1",
  "direction": "inbound",
  "text": "Hello, I need a quotation",
  "sent_at": "2026-11-04T12:00:00Z"
}
```

Direction: `inbound` or `outbound` (history projection, **not an outbound send command**). Text: nonblank, up to 16,000 characters. `sent_at`: UTC ISO date-time with seconds, optional 1–3 fractional digits, `Z` suffix. Source message ID is immutable across conversations. A new event ID with the same message returns the same `crm_message_id`; changed content/conversation conflicts. Results: `event_id`, `crm_message_id`. Text messages only in this v1; attachments/read receipts require future contract work. No continuous inbox UI is connected.

### `ownership.released`

```json
{"version": 3}
```

A versioned inbound projection that the bot owns the conversation. Only a higher version updates storage; stale events return the latest `ownership_version`. Result: `event_id`, `ownership_version`, `owner=bot`. It is **not** a scheduler, bot command, SLA timer or proof that an external action occurred. The frontend's existing mock timer is untouched.

## HTTP response semantics

Every response is JSON with `Cache-Control: no-store`. Success is **200 only after the database transaction committed**, including inbox result and domain writes. Exact event duplicates return the original stored result (no changing `duplicate` flag). No response includes an inbound payload.

| Status | Body / action |
|---|---|
| 200 | Stored result for the event type |
| 400 | `{"error":"invalid_event"}`: malformed JSON/UTF-8, unsupported shape/type, invalid fields |
| 401 | `{"error":"unauthorized"}`: missing/invalid HMAC, changed bytes, stale/future timestamp |
| 413 | `{"error":"payload_too_large"}`: over 65,536 raw bytes |
| 409 | `{"error":"event_conflict"}`, `identity_conflict`, or `revision_conflict`; reconcile identity/revision, do not blind retry |
| 422 | `{"error":"rut_required"}`, `invalid_seller`, `ambiguous_customer`, or `invalid_opportunity`; fix prerequisites |
| 503 | `{"error":"receiver_unavailable"}` (configuration) or `persistence_unavailable` (database/network/unexpected error); retry same bytes/ID with fresh signature |

No secrets, headers, raw bodies or database exception details are logged by the receiver. Deployment infrastructure must independently avoid logging PII payloads/credentials. Unsupported HTTP methods use Next's standard 405 behavior.

## Persistence and deployment preflight

Migration: `supabase/migrations/20261104120000_whatsapp_events_receiver.sql`. Additive integration tables with RLS enabled; PUBLIC/anon/authenticated data access and function execute explicitly revoked. Only `service_role` receives table/RPC grants. Both RPCs are **SECURITY INVOKER**, with fixed search path. The development service role must already have required domain table grants and RLS bypass. No public security-definer write path is introduced.

All integration deliveries and association calls serialize on one integration-local transaction advisory lock (174931, 1), with an additional normalized phone advisory lock for customer creation. This conservative approach prioritizes correctness at bounded initial traffic; load/queue sizing remains deployment work. It protects concurrent duplicate event IDs and different events for the same lead/handoff. It does not globally serialize unrelated legacy/manual customer creation; do not run another ingester for these same external identities. No trigger or shared folio generator is replaced. Every error rolls back domain writes and inbox insertion together.

### Local test path — no remote connection

```sh
node --test tests/whatsapp-events*.test.mjs
```

The SQL test starts a **brand-new disposable local PostgreSQL** cluster with TCP disabled and a unique short `/tmp/wa-pg-*` Unix socket directory (short path avoids macOS socket length limits). It ignores ambient PG connection variables, bootstraps minimal roles/domain tables, applies the migration, exercises public RPCs and cleans up in `finally`. No existing database is reset. Installed `initdb`, `pg_ctl`, `postgres`, `psql` are prerequisites; no installer runs. SQL assertions live in `supabase/tests/whatsapp_events_receiver.sql`.

**Fixture compatibility is a limitation, not deployed-schema proof.** `tests/fixtures/whatsapp-events-schema.sql` deliberately models representative fields/constraints from:

- `supabase/schema.sql`: customer RUT, opportunity assignment/state/financial fields, users and notification columns;
- `20260916165716_catalogo_y_cierre_operativo.sql`: required `postventa_casos.oportunidad_id`, description, `responsable_id` and logistics `evento_id` distinction;
- `20261007200000_modulo_integral_postventa.sql`: supported Postventa states/types, unique folio, `vendedor_id`/`cliente_id`, explicit-folio trigger behavior;
- `0034_oportunidad_origen_modalidad.sql` and the inspected legacy bot migration: opportunity origin and commercial roles (legacy RPC itself is not reused).

### Before any dev migration/enablement

In the **development project's** SQL editor, verify the project identity is exactly `whbqrracrxmeuyerrbdg` before doing anything. This delivery did not query or migrate that database. Do not derive the target from a shared client's fallback.

- Inspect actual `information_schema.columns`, `pg_constraint`, `pg_policies`, triggers, defaults and grants for `clientes`, `oportunidades`, `usuarios`, `notificaciones`, `postventa_casos`. Migrations plus the stale snapshot do not fully reconstruct deployed schema.
- Confirm every inserted column/default and check listed above, commercial roles `admin`/`user`, valid seller UUID mappings, opportunity/customer foreign keys and notification type `sistema`.
- **If `clientes.rut` is NOT NULL and a new phone has no supplied RUT, ingestion intentionally returns 422 `rut_required` with no partial rows.** Agree bot collection of actual RUT or a separately authorized schema decision; never invent one or silently relax constraints.
- Check phone ambiguity, existing RUT/other unique constraints and custom domain triggers; unexpected incompatibility fails closed as sanitized 503. The fixture does not prove compatibility with these.
- Confirm Postventa accepts `recibido`, supported type checks, `PV-WA-<uuid>` folios and explicit folios bypass the shared generator; confirm no additional mandatory fields or incompatible trigger assumptions.
- Confirm service-only function/data access and service-role domain privileges/RLS behavior; run development smoke probes only after explicit approval and with development test records.
- Apply the single additive migration only through the approved development migration process; keep the receiver disabled until credentials, HTTPS endpoint and bot contract are ready. There are intentionally no production CLI commands here.

## Remaining scope (S3 is not fulfilled)

Not implemented: bot-facing outbound take/release/close/send/history endpoints; bidirectional request signing; ownership SLA/reconciliation scheduler, quote-follow-up parity and versioned workflow coordination; bot seller provisioning/rotation configuration; continuous production inbox/history UI; complaint-association UI; correction-review UI; attachment contracts; live HTTPS deployment and bot connection. This unit prepares S1/S2/S4–S7 inbound behavior only. Broader ClickUp parity remains the overall target.
