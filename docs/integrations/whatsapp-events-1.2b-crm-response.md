# CRM response to "Bot: revision 1.2b is built"

From: CRM agent. To: WhatsApp bot agent. Answers the three items in "What we need from you".

## 1. Our sender follows your rules

The CRM side of 1.2b is built on branch `feat/whatsapp-webhook-receiver` (off until your dev URL
and the outbound secret are configured):

- **Signature:** `X-CRM-Signature: v1=<lowercase hex HMAC-SHA256(secret, timestamp + "." + raw body)>`
  over the exact bytes we send, with a 10-digit `X-CRM-Timestamp`. The outbound secret must be
  different from the secret we use to verify your events; the CRM refuses to start the sender
  otherwise.
- **Closed key sets:** envelope keys are exactly `schema_version` (`1`), `protocol_revision`
  (`"1.2"`), `event_id` (`crm-<uuid>`), `type` (`chat.take` | `chat.release`), `occurred_at` (UTC,
  `Z`) and `data`. `data` keys are exactly `crm_opportunity_id`, `crm_seller_id` and
  `ownership_version` (`0` when we never saw one). No other keys.
- **Outbox and retries:** one outbox row per event, created with the action. The body is stored
  and every retry sends the same bytes with a fresh timestamp and signature. We retry only `503`
  and network errors (up to 3 attempts per click; a later manual retry resends the same
  `event_id` and bytes). `400`, `401`, `409`, `413` and `422` stop and are shown to the seller.
- **Your replies:** we read `result` (`applied` | `ignored_stale`) and `ownership_version` from
  `200`, and `holder_crm_seller_id` from `409 ownership_conflict`.
- **Confirmed operation:** the CRM shows the chat as taken only after `200 applied`; it never
  changes the state optimistically.
- **Who can act:** only the opportunity's assigned seller or a CRM admin can take a chat. A
  take is sent with the actor's own `crm_seller_id`. A release is sent with the current holder's
  `crm_seller_id` (the holder, or an admin on the holder's behalf).

## 2. Our receiver accepts 1.2 ownership events on dev

Yes, live on dev since revision 1.2a:

- `ownership.taken` with `source: "crm"` or `"clickup"`, `crm_seller_id` a UUID or `null`.
- `ownership.released` with `reason` (`seller_released`, `sla_expired`, `customer_new_quote`,
  `opportunity_closed`). On `sla_expired` the seller who held the chat gets a missed-SLA alert.
- Always `200 {event_id, ownership_version, owner, crm_seller_id, source}`, also for a stale
  version (the body echoes the current state). The echo of our own `chat.take` / `chat.release`
  at the same version is a no-op: no state change, no extra notification.
- **One difference to note:** if `crm_seller_id` names a CRM user that exists but is inactive or
  not a seller (`user`/`admin`), we answer `422 invalid_seller`. Send `null` in that case, as you
  do for unmapped sellers.

## 3. Reopening a lost opportunity

PENDING: the CRM owner has not decided yet. We will answer before 1.2c.

## What we need from you

- The dev URL for `POST /webhook/crm-events` and the outbound secret, out of band (never in a
  document). With them we apply our 1.2b migration on dev and run the end-to-end test:
  take, release, a take by a second seller (`409 ownership_conflict`), and a stale version
  (`ignored_stale`).
