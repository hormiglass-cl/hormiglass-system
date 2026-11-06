# WhatsApp inbound receiver — proposed v1 and revision 1.1 contract

**Local implementation, disabled by default; not a live integration.** This is a technical proposal for the bot agent to agree and implement. It accepts the four legacy inbound event types atomically, with a proposed opt-in revision 1.1 for richer handoffs and `ownership.taken`. **Revision 1.1 is applied in the development project only (see Development status below); it is not deployed to production.** See [the bot-facing response](whatsapp-events-crm-response.md) for the amendment and remaining blockers. It does **not** establish ClickUp parity or replace the bot's existing workflows.

## Development status (2026-11-06)

- Both migrations are applied to development project `whbqrracrxmeuyerrbdg` only; deployed function bodies match the repository files.
- Revision 1.1 is live in development: `protocol_revision: "1.1"`, `ownership.taken`, and `handoff.created` with `kind` `commercial` | `operational` | `complaint`, required `reason` and `priority`, and `area` per the routing table below.
- `clientes.rut` is verified **NOT NULL** in development. A `lead.qualified` for a phone that matches no existing customer must include `rut`; otherwise the receiver returns 422 `{"error":"rut_required"}` and writes nothing. A phone that matches exactly one existing customer reuses that customer, and `rut` may be omitted.
- Development sellers (`usuarios.id`, all active); any other UUID is rejected with 422 `invalid_seller`:
  - `7b726374-5516-429d-b993-fe18d7d421d6` — Juan Pablo (`admin`)
  - `439b17c7-2623-480a-910e-997a64f72727` — PRUEBA Vendedor 1 (`user`)
  - `bfc11153-a1ed-4c82-9875-38e136944f71` — PRUEBA Vendedor 2 (`user`)
  - `0831b5db-c97d-47d2-a799-fd2f999f0acc` — PRUEBA Vendedor 3 (`user`)

  The `PRUEBA` sellers are development-only test accounts (`@example.invalid`, no password; they cannot sign in).
- No area recipients are mapped yet, so `management`, `finance`, `scheduling` and `claims` handoffs return `routing_status: "pending_routing"`.
- The development endpoint is a temporary tunnel URL shared out of band; it changes whenever the tunnel restarts.

## Before connecting the bot

1. Agree this wire contract and share **development** seller UUID mappings with the bot agent (`usuarios.id`, not `auth_id` or ClickUp IDs). The bot owns rotation.
2. Complete the development schema preflight below; apply the original and amendment migrations in order to that development project only after approval.
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

Send `Content-Type: application/json`, UTF-8 body, maximum **65,536 raw bytes** (including whitespace). Unknown fields are rejected. Numeric `schema_version: 1` and signature `v1=` remain unchanged. Omit `protocol_revision` for strict legacy v1; explicitly send `protocol_revision: "1.1"` for the amendment below. Unknown/null revisions reject, including on otherwise valid events.

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

### `handoff.created` — legacy v1

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

### `ownership.released` — legacy v1

```json
{"version": 3}
```

A versioned inbound projection that the bot owns the conversation. Only a higher version updates storage; stale events return the latest `ownership_version`. Result: `event_id`, `ownership_version`, `owner=bot`. It is **not** a scheduler, bot command, SLA timer or proof that an external action occurred. The frontend's existing mock timer is untouched.

## Proposed revision 1.1 (explicit opt-in)

Add `"protocol_revision":"1.1"` at the envelope root. Lead/message schemas and results are unchanged. All unknown fields/types reject, and the HMAC still signs the complete unchanged raw bytes. Do not add amendment fields to legacy envelopes.

### Handoff routing and association

All revision 1.1 handoffs require `handoff_id`, `kind`, `description`, **`reason` and `priority`**. Reason is a stable lowercase snake_case identifier, 1–64 ASCII characters, regex `^[a-z][a-z0-9]*(_[a-z0-9]+)*$` (no leading/trailing/double underscore). Priorities: `urgente`, `alta`, `media`, `baja`.

| Kind | Area | Association and recipients |
|---|---|---|
| `commercial` | Required: `sales` or `management` | Supplied/linked opportunity; notify its **current active** commercial seller, never the original bot assignment. Management additionally requires explicit mapped recipients. |
| `operational` | Required: `finance` or `scheduling` | No opportunity field allowed and no implicit sale link; requires explicit mapped active recipients. |
| `complaint` | Absent implies `claims`; only explicit `claims` allowed | Existing linked/pending Postventa path, including optional supported `postventa_type`. Case creation does not require a recipient mapping and never invents `responsable_id`; claims notifications require explicit active mapped recipients. |

Opportunity UUID remains optional for commercial/complaint only. A supplied UUID conflicting with the conversation link rejects with `identity_conflict`. An unknown UUID/no known sale remains pending; no opportunity is fabricated. Controlled later association cannot replace an already associated sale or conflict with a conversation link. Existing human assignment/stage/financials/notes/case management are untouched.

```json
{
  "schema_version": 1,
  "protocol_revision": "1.1",
  "event_id": "commercial-001",
  "conversation_id": "wa-conversation-123",
  "type": "handoff.created",
  "data": {
    "handoff_id": "commercial-handoff-001",
    "kind": "commercial",
    "area": "management",
    "reason": "manager_requested",
    "priority": "alta",
    "description": "Customer requests a manager"
  }
}
```

Revision 1.1 handoff results have exactly the five legacy keys plus `routing_status` (`pending_routing` or `routed`). Status is `associated` or `pending_association` for commercial/complaint, `operational` for operational. Commercial `crm_case_id` is always null; associated complaints have actual case/opportunity UUIDs. Pending association implies null case/opportunity and pending routing. Missing/inactive recipients are never acknowledged as routed. Management may notify the current seller while still pending the required management route. Mapping multiple recipients means fan-out to all active configured users; inactive mappings do not count as delivery targets. Sales ignores area mappings and requires the current active `user`/`admin` seller. No roles/calendar flags are used to guess recipients.

```json
{"event_id":"commercial-001","external_handoff_id":"commercial-handoff-001","crm_case_id":null,"crm_opportunity_id":null,"status":"pending_association","routing_status":"pending_routing"}
```

### Service-only routing setup and completion

`whatsapp_area_recipients(area, usuario_id)` is an integration-specific directory; **no real identities are seeded**. An authorized service operator must explicitly configure each required area. These illustrative SQL calls are a future approved-dev setup recipe, **not commands executed by this delivery**. Verify the placeholder users exist and are active before substituting approved development IDs:

```sql
-- Service-controlled only; placeholder UUIDs, not provisioned recipients.
INSERT INTO public.whatsapp_area_recipients(area, usuario_id)
VALUES ('management', '10000000-0000-4000-8000-000000000010')
ON CONFLICT (area, usuario_id) DO NOTHING;

-- Retry routing an already associated/operational handoff after configuration.
SELECT public.whatsapp_complete_handoff('commercial-handoff-001');
-- Associate a pending commercial/complaint with a verified existing development sale and route.
SELECT public.whatsapp_complete_handoff(
  'commercial-handoff-001', '20000000-0000-4000-8000-000000000010'::uuid
);
```

Completion returns the handoff result without `event_id`. It uses the same lock and complaint case-creation function as ingestion. Reassociation conflicts; unknown supplied service opportunity returns `invalid_opportunity`; operational cannot be associated. Repeated delivery/completion never duplicates notifications for the same handoff+recipient, even if that user is both seller and mapped manager. Changed current seller/new explicit recipients can be notified on completion, without reassigning any domain record. It does not retract old notifications or automatically select recipients. No background retry worker or UI is added: a service operator must complete pending work. The original event result remains immutable after completion; a different event ID with identical handoff identity can return the current status.

### Ownership projection: taken and released

```json
{"version":4,"crm_seller_id":null,"source":"clickup"}
```

The data above is for `ownership.taken`, revision 1.1 **only**. `crm_seller_id` must be explicitly present: UUID of an active commercial `user`/`admin`, or null (unattributed human, never inferred). Source must be `clickup`. Released retains data `{"version":5}`. Both share one monotonic sequence per conversation:

- Higher version applies the complete requested state. Release clears seller/source to null; take sets human owner.
- Lower version returns the complete current authoritative state without mutation (a provided requested seller must still be valid).
- Equal version/identical complete owner+seller+source returns current state. Equal/different state returns `409 ownership_conflict` with no writes.
- Exact event replay always returns the originally stored acknowledgement, even after later ownership changes or seller deactivation.

Both revision 1.1 ownership event types return exactly `event_id`, `ownership_version`, `owner`, `crm_seller_id`, `source`. Owner can be `bot` (seller/source null) or `human` (nullable seller, source `clickup`), including a stale release whose authoritative state is human:

```json
{"event_id":"release-stale","ownership_version":4,"owner":"human","crm_seller_id":null,"source":"clickup"}
```

**Negotiated compatibility change:** legacy releases retain their exact old result when the authoritative state is representable as bot. If an equal/newer human projection prevents that, legacy releases return `409 protocol_revision_required`, not a false bot acknowledgement and not an overwrite. A higher-version legacy release can still restore bot and returns the old three-key shape. Previously stored legacy event replays remain unchanged. This is not ClickUp takeover implementation, an outbound command, or a scheduler.

## HTTP response semantics

Every response is JSON with `Cache-Control: no-store`. Success is **200 only after the database transaction committed**, including inbox result and domain writes. Exact event duplicates return the original stored result (no changing `duplicate` flag). No response includes an inbound payload.

| Status | Body / action |
|---|---|
| 200 | Stored result for the event type |
| 400 | `{"error":"invalid_event"}`: malformed JSON/UTF-8, unsupported shape/type, invalid fields |
| 401 | `{"error":"unauthorized"}`: missing/invalid HMAC, changed bytes, stale/future timestamp |
| 413 | `{"error":"payload_too_large"}`: over 65,536 raw bytes |
| 409 | `{"error":"event_conflict"}`, `identity_conflict`, `revision_conflict`, `ownership_conflict`, or `protocol_revision_required`; reconcile identity/revision, do not blind retry |
| 422 | `{"error":"rut_required"}`, `invalid_seller`, `ambiguous_customer`, or `invalid_opportunity`; fix prerequisites |
| 503 | `{"error":"receiver_unavailable"}` (configuration) or `persistence_unavailable` (database/network/unexpected error); retry same bytes/ID with fresh signature |

No secrets, headers, raw bodies or database exception details are logged by the receiver. Deployment infrastructure must independently avoid logging PII payloads/credentials. Unsupported HTTP methods use Next's standard 405 behavior.

## Persistence and deployment preflight

Apply in order, only after approval: original `supabase/migrations/20261104120000_whatsapp_events_receiver.sql`, then additive `supabase/migrations/20261104130000_whatsapp_events_v1_1.sql`. The original migration is unchanged. Additive integration tables with RLS enabled; PUBLIC/anon/authenticated data access and function execute explicitly revoked. Only `service_role` receives table/RPC grants. All RPCs, including completion, are **SECURITY INVOKER**, with fixed search path. `whatsapp_receive_event` is the only event-ingress RPC: the amendment replaces its definition in place and preserves the original lead/message/complaint branches behind the canonical validation, transaction lock and replay guards. There is **no** `public.whatsapp_receive_event_v1` compatibility function or replacement alias; direct calls to that absent function fail with PostgreSQL `42883` (`undefined_function`), including for service callers. Revoking a helper while retaining invoker delegation is not used, and no private/exposed-schema configuration change is required. The development service role must already have required domain table grants and RLS bypass. No public security-definer write path is introduced.

All integration deliveries and association calls serialize on one integration-local transaction advisory lock (174931, 1), with an additional normalized phone advisory lock for customer creation. This conservative approach prioritizes correctness at bounded initial traffic; load/queue sizing remains deployment work. It protects concurrent duplicate event IDs and different events for the same lead/handoff. It does not globally serialize unrelated legacy/manual customer creation; do not run another ingester for these same external identities. No trigger or shared folio generator is replaced. Every error rolls back domain writes and inbox insertion together.

### Local test path — no remote connection

```sh
node --test tests/whatsapp-events*.test.mjs
```

The SQL test starts a **brand-new disposable local PostgreSQL** cluster with TCP disabled and a unique short `/tmp/wa-pg-*` Unix socket directory (short path avoids macOS socket length limits). It ignores ambient PG connection variables, bootstraps minimal roles/domain tables, applies the original then additive migration, exercises public RPCs and cleans up in `finally`. No existing database is reset. Installed `initdb`, `pg_ctl`, `postgres`, `psql` are prerequisites; no installer runs. SQL assertions live in `supabase/tests/whatsapp_events_receiver.sql` and `supabase/tests/whatsapp_events_v1_1.sql`. Tests include actual denied role calls, complete public-domain rollback snapshots, concurrent routing dedup and crossed ownership transitions. `tests/whatsapp-events-v1-1.test.mjs` also exercises signed POSTs backed by real disposable PostgreSQL RPC transport: attempted stale/equal/higher compatibility releases cannot write an acknowledgement or change any affected row, and raw-SHA256 retries cannot replay a false bot acknowledgement. Legitimate higher canonical releases clear human seller/source; legitimate legacy domain paths retain their existing SQL assertions.

**Fixture compatibility is a limitation, not deployed-schema proof.** `tests/fixtures/whatsapp-events-schema.sql` deliberately models representative fields/constraints from:

- `supabase/schema.sql`: customer RUT, opportunity assignment/state/financial fields, users and notification columns;
- `20260916165716_catalogo_y_cierre_operativo.sql`: required `postventa_casos.oportunidad_id`, description, `responsable_id` and logistics `evento_id` distinction;
- `20261007200000_modulo_integral_postventa.sql`: supported Postventa states/types, unique folio, `vendedor_id`/`cliente_id`, explicit-folio trigger behavior;
- `0034_oportunidad_origen_modalidad.sql` and the inspected legacy bot migration: opportunity origin and commercial roles (legacy RPC itself is not reused).

### Before any dev migration/enablement

In the **development project's** SQL editor, verify the project identity is exactly `whbqrracrxmeuyerrbdg` before doing anything. As of 2026-11-06, `clientes.rut` is verified NOT NULL in development and both migrations are applied there (see Development status). Do not derive the target from a shared client's fallback.

- Inspect actual `information_schema.columns`, `pg_constraint`, `pg_policies`, triggers, defaults and grants for `clientes`, `oportunidades`, `usuarios`, `notificaciones`, `postventa_casos`. Migrations plus the stale snapshot do not fully reconstruct deployed schema.
- Confirm every inserted column/default and check listed above, commercial roles `admin`/`user`, valid seller UUID mappings, opportunity/customer foreign keys and notification type `sistema`.
- **If `clientes.rut` is NOT NULL and a new phone has no supplied RUT, ingestion intentionally returns 422 `rut_required` with no partial rows.** Agree bot collection of actual RUT or a separately authorized schema decision; never invent one or silently relax constraints.
- Check phone ambiguity, existing RUT/other unique constraints and custom domain triggers; unexpected incompatibility fails closed as sanitized 503. The fixture does not prove compatibility with these.
- Confirm Postventa accepts `recibido`, supported type checks, `PV-WA-<uuid>` folios and explicit folios bypass the shared generator; confirm no additional mandatory fields or incompatible trigger assumptions.
- Confirm service-only function/data access and service-role domain privileges/RLS behavior; run development smoke probes only after explicit approval and with development test records.
- Apply both migrations in order only through the approved development migration process; keep the receiver disabled until credentials, HTTPS endpoint and bot contract are ready. There are intentionally no production CLI commands here.

## Remaining scope (S3 is not fulfilled)

Not implemented: bot-facing outbound take/release/close/send/history endpoints; bidirectional request signing; ownership SLA/reconciliation scheduler, quote-follow-up parity and versioned workflow coordination; bot seller provisioning/rotation configuration; continuous production inbox/history UI; complaint-association UI; correction-review UI; attachment contracts; live HTTPS deployment and bot connection. This unit prepares S1/S2/S4–S7 inbound behavior and the proposed S9–S10 amendment only; S8 RUT verification remains blocked. Broader ClickUp parity remains the overall target.
