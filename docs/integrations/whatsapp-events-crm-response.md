# CRM response to the WhatsApp bot agent

**Transport accepted; revision 1.1 is a concrete technical proposal awaiting your agreement, not a deployed or enabled integration.** We retain the numeric `schema_version: 1`, raw-byte HMAC `v1=`, fresh delivery timestamps on retries, unchanged event bytes/IDs, and atomic stored acknowledgements. The local amendment adds commercial/area handoffs and ClickUp-origin human ownership. [Full wire contract and setup](whatsapp-events.md).

## Agreement requested

| Topic | Proposed agreement |
|---|---|
| Revision | Send root `protocol_revision: "1.1"` to opt into new handoff/ownership shapes. Absence remains strict legacy v1; null/unknown revisions or fields reject. Signature version stays `v1`. |
| Commercial | `kind: commercial`, required area `sales`/`management`. Notify the opportunity's **current active seller**. No linked/supplied valid opportunity means durable `pending_association`; never create a sale. |
| Operational | Required area `finance`/`scheduling`; never attach a sale. Only explicit active area recipients; missing configuration stays `pending_routing`. |
| Complaint | Implies `claims` (explicit other area rejects). Preserve existing actual Postventa/pending association path and supported optional `postventa_type`. Claims recipient mapping is needed for notifications, not for case creation. No invented responsible person. |
| Handoff metadata | All revision 1.1 handoffs require stable `reason`, regex `^[a-z][a-z0-9]*(_[a-z0-9]+)*$`, at most 64 characters, and priority `urgente`/`alta`/`media`/`baja`. |
| Ownership | Add revision 1.1 `ownership.taken` with `{ "version": 4, "crm_seller_id": "<uuid or null>", "source": "clickup" }`. Seller key is mandatory; null stays null. UUID must identify an active commercial CRM user/admin. Taken/released share one monotonic version sequence. |

No local rotation, guessed admin/finance/calendar recipients, assignment/stage/financial/note overwrites, or unrequested ClickUp changes. Management requires both current seller and explicit mapped management routing. Commercial/complaint accept optional `crm_opportunity_id`; supplied-vs-linked contradictions are conflicts. Sales uses the current seller directly, not the area directory.

## Wire examples and acknowledgements

```json
{
  "schema_version": 1,
  "protocol_revision": "1.1",
  "event_id": "commercial-event-1",
  "conversation_id": "conversation-1",
  "type": "handoff.created",
  "data": {
    "handoff_id": "commercial-1",
    "kind": "commercial",
    "area": "sales",
    "reason": "quote_requested",
    "priority": "alta",
    "description": "Customer requests a quotation"
  }
}
```

If no known sale exists:

```json
{"event_id":"commercial-event-1","external_handoff_id":"commercial-1","crm_case_id":null,"crm_opportunity_id":null,"status":"pending_association","routing_status":"pending_routing"}
```

After authorized service-side association, a **new** event ID with identical handoff data can return:

```json
{"event_id":"commercial-event-2","external_handoff_id":"commercial-1","crm_case_id":null,"crm_opportunity_id":"20000000-0000-4000-8000-000000000010","status":"associated","routing_status":"routed"}
```

UUID is illustrative only. Exact replay of `commercial-event-1` still returns its **original pending acknowledgement**. New-event duplicate handoff retries/completion do not duplicate cases/notifications or reset human management. Changed immutable data/conversation rejects. Notification dedup is handoff+recipient, transactional with persistence.

Ownership example:

```json
{
  "schema_version": 1,
  "protocol_revision": "1.1",
  "event_id": "ownership-event-4",
  "conversation_id": "conversation-1",
  "type": "ownership.taken",
  "data": { "version": 4, "crm_seller_id": null, "source": "clickup" }
}
```

```json
{"event_id":"ownership-event-4","ownership_version":4,"owner":"human","crm_seller_id":null,"source":"clickup"}
```

Higher ownership version applies; lower returns the authoritative state without changing it. Equal/identical complete state succeeds; equal/different owner, seller or source conflicts. Release data remains `{"version":5}` and clears seller/source. Both revision 1.1 ownership replies may report authoritative human or bot ownership; a stale take can report bot, and a stale release can report human. Bot replies have seller/source null. Original event replay is immutable, even after later transitions.

**Compatibility negotiation:** legacy releases keep the exact three-key result only while bot is authoritative/representable. An equal/newer human state instead returns `409 {"error":"protocol_revision_required"}` without mutation. A higher legacy release may restore bot. We will never falsely acknowledge bot ownership. This intentional interoperability change needs your agreement.

The service-side event ingress is **only** `public.whatsapp_receive_event`. There is no alternate `public.whatsapp_receive_event_v1` compatibility RPC: direct calls fail with PostgreSQL `42883` (`undefined_function`), so they cannot bypass ownership/revision guards or prewrite false acknowledgements. Legacy lead/message/complaint handling is preserved within the canonical invoker function. This does not add credentials, a definer function, or another exposed schema.

## Errors and retry policy

Success is HTTP200 only after commit. All errors use `{"error":"<code>"}` with no database details. Continue retrying identical bytes/event ID with a fresh HMAC timestamp after network/503 failures; reconcile other failures first.

| Status | Codes |
|---|---|
| 400 | `invalid_event` (unknown revisions/fields/type, missing or invalid metadata) |
| 401 | `unauthorized` (HMAC/timestamp) |
| 409 | `event_conflict`, `identity_conflict`, `revision_conflict`, **`ownership_conflict`**, **`protocol_revision_required`** |
| 413 | `payload_too_large` |
| 422 | `invalid_seller`, `invalid_opportunity`, `rut_required`, `ambiguous_customer` |
| 503 | `receiver_unavailable`, `persistence_unavailable` |

## Explicit routing configuration and completion

There is no authoritative area directory in the CRM. The proposed service-only `whatsapp_area_recipients` table starts empty. A service operator must configure approved **development** recipients, then call `whatsapp_complete_handoff` to retry association/routing. No browser credentials, new UI, fallback person or automatic retry worker is provided.

```sql
-- Illustrative future approved-dev setup; UUIDs are placeholders, not real accounts.
INSERT INTO public.whatsapp_area_recipients(area, usuario_id)
VALUES ('finance', '10000000-0000-4000-8000-000000000010')
ON CONFLICT (area, usuario_id) DO NOTHING;
SELECT public.whatsapp_complete_handoff('finance-handoff-1');
-- Verified existing sale, for pending commercial/complaint only:
SELECT public.whatsapp_complete_handoff(
  'commercial-1', '20000000-0000-4000-8000-000000000010'::uuid
);
```

Completion returns the handoff fields without `event_id`; pending association/routing remains explicit until prerequisites exist. Existing association cannot be replaced. Missing/inactive recipients never count as routed. RLS and service-only table/function grants apply; no public/browser executable privileged path is added. These examples are not migration or enablement claims.

## RUT: NULLABILITY UNVERIFIED — activation blocker

We understand **the bot does not collect a personal RUT** and prefers accepting WhatsApp customers without one for later seller completion. Exact-development metadata access returned **HTTP401**. This does **not** establish either nullable or NOT NULL. We have not fabricated RUTs, altered the shared schema, retried remote access, or queried production.

An authorized person can verify the exact project identity **`whbqrracrxmeuyerrbdg`** in its development SQL editor and run this **read-only metadata-only** query (no customer records):

```sql
SELECT table_schema, table_name, column_name, is_nullable, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'clientes'
  AND column_name = 'rut';
```

Please provide that metadata result, not credentials or personal records. No returned row is inconclusive (access/schema visibility must also be checked). If a new customer would violate an actual NOT NULL constraint, the receiver fails atomically with `rut_required`; existing phone matches can still be reused. Any shared-schema change requires a separate authorized decision after verification.

## Still missing before connection

- Bot agreement on this exact revision and legacy ownership interoperability rule.
- Verified development schema/grants/triggers, including actual RUT metadata; additive migrations have been tested only in a disposable local fixture, not applied remotely.
- Reachable HTTPS development URL, securely provisioned HMAC/service credentials, explicit enablement, and real development seller UUID mappings.
- Explicit area recipient mappings and an authorized service workflow for pending association/completion.
- Bot-owned outbound endpoints for take/release/close/send/history. No endpoint values are invented here. Future outbound credentials must follow a **separate secret policy**, not assume reuse of this inbound service credential.

Media/structured lead fields remain deferred: retain the agreed placeholder-text plan for now, without claiming attachments are implemented. This amendment does not connect the mock frontend, implement the bot workflow/scheduler, replace ClickUp, or complete parity. No deployment, activation, production/database mutation or bot runtime change is claimed.
