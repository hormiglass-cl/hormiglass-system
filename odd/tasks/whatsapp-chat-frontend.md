# WhatsApp chat integrated in the CRM — frontend only

Objective: build the frontend of the WhatsApp integration designed in the "Chat integrado CRM" canvas, backed by in-memory mock data behind a repository port so the backend can be plugged in later.
Branch: `feat/whatsapp-chat-frontend` · Delivery: ask-on-risk · Test runner: `node --test tests/whatsapp-*.test.mjs` (Node 26 native TS stripping) + `npm run lint` + `npm run lint:design` + `npm run build`.

## Specs

- S1 — "Me gustaria que armaramos primero el diseño (frontend) y despues vemos como conectamos el backend". No Supabase tables, migrations, or external WhatsApp provider calls in this feature. Data comes from a mock adapter behind a `ConversationRepository` port (assumption: in-memory, resets on reload).
- S2 — Conversation states from the design board "Estados y tipos de mensaje": `1 · Con asistente`, `2 · Esperando vendedor`, `3 · Atendiendo tú` ("Asistente en pausa" with a countdown; "Al tomarla, el asistente se pausa por 60 min y respondes tú."; "Si vence el plazo, el asistente retoma solo."), `4 · Cerrada` ("Si el cliente vuelve a escribir, la conversación se reabre con el asistente y queda en la misma ficha."). Actions: "Tomar conversación", "Devolver al asistente", "Cerrar", "Ver historial".
- S3 — Message types: Cliente, Asistente, Vendedor desde el CRM, Vendedor desde el teléfono ("Enviado desde el teléfono"), Archivo (e.g. "Cotización OP-2026-6056.pdf · 340 KB"), Eventos del sistema ("Derivado a Ventas · asignado a Jesus por turno", "Jesus tomó la conversación", "Plazo vencido · el asistente retomó"). Delivery ticks ✓ / ✓✓.
- S4 — Opportunity window ("Ventana de la venta · pestaña WhatsApp"): the activity column gets an `Actividad` / `WhatsApp` switch with an unread badge; the WhatsApp view shows contact header (name, phone, state chip), "Tomar conversación" button, thread, "1 MENSAJE NUEVO" divider, and a composer locked with "Toma la conversación para responder al cliente." while the assistant is in charge. Opportunity summary shows "Datos capturados por el asistente" when the opportunity came from WhatsApp.
- S5 — Inbox ("Bandeja de conversaciones"): new sidebar item "Conversaciones" with unread count, filters "Mis chats", "Esperando", "Con asistente", "Cerrados"; conversation list with state pill and unread count; thread with quick replies ("Agendar visita a terreno", "Enviar ficha técnica", "Cotización en preparación") and hint "Se envía por WhatsApp desde el número de Hormiglass"; right panel with Cliente, Oportunidad, "Capturado por el asistente" and "Abrir oportunidad"; banner "Nuevo cliente asignado a ti" with "Ver chat" / "Más tarde".
- S6 — Seller notifications: "Nuevo cliente asignado a ti", "Tu plazo vence en 5 min", "El asistente retomó una conversación" (frontend surface only; assumption: shown as in-app toasts/banners from mock events, not persisted in `notificaciones`).

## Tasks

| ID | Specs | Route | Status | Commit |
| --- | --- | --- | --- | --- |
| T1 | S1, S2, S3 | inline | done | pending work-unit commit; 6 domain tests + focused ESLint pass |
| T2 | S3 | delegated (context backstop) | in progress | — |
| T3 | S5, S6 | inline | pending | — |
| T4 | S4 | inline | pending | — |

- T1: domain types, pure state machine, repository port + mock adapter, shared store hook; tests first.
- T2: presentational chat components (bubbles, state badge, thread, composer, header).
- T3: `/conversaciones` inbox page + nav item + notifications banner.
- T4: WhatsApp tab inside the opportunity modal in `app/ventas/page.tsx`.

## Log

- L1 (2026-11-03, user): "Me gustaria que armaramos primero el diseño (frontend) y despues vemos como conectamos el backend" — following the canvas https://claude.ai/artifact/4VkZuqvA2wRTsHM7RWiivE (boards Main, Inbox, States).
- L2: Writer trigger not fired: T2–T4 depend on T1, so units are not independent; parent writes inline.
- L3 (2026-11-03, user constraint recovered): "acuerdate de no tocar nada de producción ni en main ni nada." Confirmed feature branch; pre-existing AGENTS.md/package changes are not part of this work.
- L4: T1 RED: missing repository module (exit 1). GREEN: all 6 domain tests pass; focused ESLint passes. Node prints the existing typeless-package warning. Fixtures have no real CRM IDs: never link demo conversations to unrelated live opportunities.
- L5: Runtime context backstop fired; delegate the next bounded UI unit (T2–T4) with narrow edit surfaces. No parallel writers.
