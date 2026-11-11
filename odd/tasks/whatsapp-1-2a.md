# WhatsApp contract revision 1.2a (inbound)

Objective: the receiver accepts `protocol_revision` "1.2" alongside "1.1"/legacy, stores the structured lead record, applies or queues customer corrections, records message authors and ownership release reasons, and shows a "Ficha WhatsApp" panel with corrections to review.
Branch: `feat/whatsapp-webhook-receiver`. Delivery: `ask-on-risk`. Tests: `node --test tests/whatsapp-events*.test.mjs` (throwaway local Postgres; needs initdb/pg_ctl/psql), `node --test tests/*.test.mjs`, `npm run lint`, `npm run build`. Dev DB `whbqrracrxmeuyerrbdg` only; production is never touched.

## Specs

Sources: docs/integrations/whatsapp-events-1.2-crm-response.md (sections 1–4), docs/integrations/whatsapp-events-1.2-bot-reply.md, the bot proposal Part A (`crm-requirements-v1-2.md`), and the mapping approved by the user (L2).

- **S1 Envelope.** `protocol_revision` may be absent (legacy), `"1.1"` or `"1.2"`; anything else is rejected (400 `invalid_event`). Unknown fields stay rejected. A 1.2-only field inside a 1.1 or legacy envelope is rejected. Legacy and 1.1 behavior and results stay byte-for-byte unchanged.
- **S2 `lead.qualified` 1.2 fields (A1).** All 1.1 fields stay. Optional additions, validated strictly:
  - `customer_type` `natural|company`; `company` text ≤200; `tax_document` `boleta|factura`; `purchase_order` text ≤100; `service` text ≤100; `fulfillment` `delivery|install|pickup`; `city`, `commune` text ≤100; `address` text ≤300; `use_case` text ≤200; `urgency` `urgente|alta|media|baja`; `desired_date` valid `YYYY-MM-DD`; `source_number` phone `^\+[1-9][0-9]{7,14}$`.
  - `site` object, optional keys only: `terrain` text ≤100, `truck_access` boolean, `debris_removal` boolean, `access_restrictions` text ≤500.
  - `items` array (≤50) of objects: `product` text ≤200 required; optional `variant` text ≤200 or null, `quantity` finite number > 0 or null, `unit` text ≤20 or null, `measurements` text ≤200 or null.
  - `ai_summary` object, optional keys only: `lead_class`, `next_best_action`, `executive_summary`, `pain`, `scope`, `timing`, `obstacle`, each text ≤4000.
  - "text" means a non-empty string without NUL. Absent optional fields mean "no information", never "clear the value".
- **S3 Mapping on creation (approved, L2).** A new lead creates:
  - Customer (only when no customer matches the phone): `tipo_cliente` = `juridica` if `customer_type` is `company`, else `natural`; `apellido_razon_social` = `company` if present, else `name`; `rut` as today.
  - Opportunity: `titulo` = `title`; `direccion_obra` = non-empty parts of `address`, `commune`, `city` joined with ", " (omit `city` when equal to `commune`); from `fulfillment`: `install` → `tipo_venta` "Instalación", `modalidad_requerimiento` "instalacion", `forma_entrega` null; `delivery` → "Suministro", "solo_material", "despacho_propio"; `pickup` → "Suministro", "solo_material", "retiro_cliente"; `prioridad` from `urgency`: urgente→urgente, alta→alta, media→normal, baja→normal; `productos` = one string per item: `product`, `variant`, `quantity`, `unit` joined by spaces, plus ` (measurements)` when present (e.g. "Adoquín Piedra 40 m2"). Fields the bot did not send keep the current defaults.
  - Everything else (`requirement`, `site`, `use_case`, `tax_document`, `purchase_order`, `desired_date`, `ai_summary`, `source_number`, `service`) is shown in the "Ficha WhatsApp" panel (S9) from the stored bot record.
  - The values written to the opportunity are stored as the "last applied" snapshot of the lead.
- **S4 Corrections (F3, agreed).** A higher `revision` (any protocol revision) updates the stored bot record, then for each mapped opportunity field (S3) whose new value differs from the last applied value: if the opportunity's current value still equals the last applied value (no human edit), apply it and update the snapshot; otherwise create a pending correction (field, current value as "before", bot value as "after"). A newer pending correction for the same field replaces the older one. Customer fields (`customer_type`, `company`, `rut`) are never applied automatically: when they differ from the customer's current values they become pending corrections. Pipeline stage, assignment, amounts and notes are never touched. Every correction notifies the opportunity's assigned seller with how many changes were applied and how many await review.
- **S5 Stale and duplicate (1.2 only).** `lead.qualified` 1.2 results add `status`: `created` (new lead), `updated` (higher revision), `ignored_stale` (lower or equal revision with the same record). An identical replay of an already processed 1.2 event returns the stored result with `status` `duplicate`. Equal revision with a different record stays `409 revision_conflict`.
- **S6 `message.new` 1.2 (A3).** `sender` required: `customer|bot|seller|system`; `crm_seller_id` required exactly when `sender` is `seller` (active `user`/`admin`, else 422 `invalid_seller`). `direction` must match: `inbound` ⇔ `customer`; `outbound` ⇔ `bot|seller|system`. Result adds `status` `created|duplicate`.
- **S7 Ownership 1.2 (A2).** `ownership.taken` accepts `source` `clickup|crm`. `ownership.released` requires `reason`: `seller_released|sla_expired|customer_new_quote|opportunity_closed`; it is stored with the bot-owned state. On `sla_expired`, the seller who held the chat (if mapped) gets a missed-SLA notification. 1.1 ownership rules stay unchanged (no `reason` allowed under 1.1).
- **S8 Handoffs 1.2.** `handoff.created` under 1.2 behaves exactly like 1.1.
- **S9 "Ficha WhatsApp" panel (approved, L2).** On an opportunity created from WhatsApp (it has a lead link), the panel replaces the "Integración pendiente" placeholder and shows the stored bot record (S3 panel fields), the revision, and pending corrections as before → after with "Aceptar" and "Descartar". Accepting writes the value to the opportunity or customer and updates the snapshot; discarding keeps the current value. Only active CRM users can read it; only users allowed to edit opportunities (`user`/`admin`) can resolve. Reads/writes go through database functions (WhatsApp tables stay closed to the browser).
- **S10 Docs.** The contract doc (`docs/integrations/whatsapp-events.md`) documents 1.2a shapes, results and errors; the bot is told when 1.2 is live on dev.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1, S2, S5–S7 (TypeScript validator, route result checks, Node tests) | delegated writer, parallel with T2 (disjoint: `lib/integrations/whatsapp/*`, `tests/whatsapp-events.test.mjs`) | pending | |
| T2 | S1–S8 (SQL migration, fixture, SQL tests) | delegated writer, parallel with T1 (disjoint: `supabase/**`, `tests/fixtures/whatsapp-events-schema.sql`, `tests/whatsapp-events-sql.test.mjs`, `tests/whatsapp-events-v1-1.test.mjs`) | pending | |
| T3 | S9 (panel RPCs + UI) | after T2 | pending | |
| T4 | S10 + apply to dev + end-to-end probe | inline | pending | |

## Log

- L1 (2026-11-11, user): "dale, arranquemos con la 1.2a"
- L2 (2026-11-11, user): "dale" — approves the field mapping table (title; address/commune/city → direccion_obra; fulfillment → tipo de venta/modalidad; urgency → prioridad; items → productos; customer_type/company/rut only on creation, corrections to review; requirement/site/use_case/tax_document/purchase_order/desired_date/ai_summary/source_number → new "Ficha WhatsApp" panel replacing "Integración pendiente"; conflicts show before → after with accept/discard; every correction notifies).
- L3: Mapping facts: `oportunidades` has no `comuna`/`direccion` columns on dev (types are wrong); no per-field edit tracking exists; SQL receiver forces string data fields and `whatsapp_ownership` CHECK allows only `source='clickup'`; live function body is in `20261104130000_whatsapp_events_v1_1.sql` 102–287; WhatsApp tables are service_role only; `app/ventas/page.tsx:2919` checks `origen === 'whatsapp'` but the receiver writes "WhatsApp Bot". Baseline: `node --test tests/whatsapp-events*.test.mjs` 25/25 pass.
- L4: Decisions taken by the agent (technical): `sender` required under 1.2 and paired with `direction`; `status` added only to 1.2 results; release reason stored on ownership state.
