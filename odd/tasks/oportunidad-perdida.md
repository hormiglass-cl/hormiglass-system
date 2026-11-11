# Oportunidad perdida

Objective: let sellers close an opportunity as lost (with a required reason) so it leaves the active pipeline, and reopen it.
Branch: `feat/oportunidad-perdida` (from `main`). Delivery: `ask-on-risk`. Test runner: `node --test tests/*.test.mjs`, plus `npm run lint` and `npm run build`.

## Specs

- S1. Data model: lost is stored in new nullable columns on `oportunidades` (`perdida_at`, `perdida_motivo`, `perdida_detalle`, `perdida_por`); `estado_pipeline` is unchanged so reopening restores the stage. Reasons: `precio`, `competencia`, `sin_respuesta`, `proyecto_cancelado`, `otro` (`otro` requires detail). The database sets `perdida_at`/`perdida_por` and enforces consistency. Applied to **dev only**; production is never touched.
- S2. Only an opportunity in `nueva` can be marked lost (assumption, agreed default: from "Pago Validado" on, money is involved). A lost opportunity cannot change stage until reopened.
- S3. Ventas: "Marcar como perdida" action with a required reason; it leaves the active Kanban/list; an "Activas | Perdidas" switch shows lost ones; "Reabrir" restores it. Both actions are logged in the opportunity activity.
- S4. A rejected quote never marks the opportunity lost. When the opportunity's current quote changes to `rechazada`, the CRM only suggests marking it lost.
- S5. The client is never deleted. Lost opportunities are excluded from active-pipeline counts: dashboard pipeline/funnel/KPIs, follow-up notifications, client active balance, and opportunity pickers for new quotes, purchase orders and events.
- S6. User's words (L2): "el cliente tal vez se elimina del pipeline y podria ir a postventa tal vez en un apartado nuevo donde diga rechazos" → agreed instead: lost opportunities stay in Ventas under "Perdidas", not in Postventa.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1, S2, S5 (predicate) | inline | done | `5cdeee6`; migration applied to dev; DB probe `ROLLBACK_OK 12345678`; RED (module missing) → GREEN 4/4 |
| T2 | S3, S4 | delegated writer (parallel with T3; disjoint surface `app/ventas/page.tsx`) | done | `5407805`; eslint clean; not clicked in a browser |
| T3 | S5 (+ commissions in `app/comisiones`, `app/rrhh/[id]`) | delegated writer (parallel with T2; other files) | done | `76bc393`; follow-up test RED (`['activa','perdida']`) → GREEN |
| V1 | S1–S6 | independent verifier (Risk item 1: migration) | in progress | |

## Log

- L1 (2026-11-11, user): "Hagamos el cambio, tenemos el permiso" — after agreeing to propose: explicit "Marcar como perdida" action with required reason; leaves active Kanban into a "Perdidas" filter in Ventas, reopenable; client not deleted; a rejected quote does not close the opportunity, the CRM only suggests it. Teammate (pipeline owner) permission obtained.
- L2 (2026-11-11, user, earlier): "Estoy viendo en cotizaciones que hay un filtro de cotizaciones rechazadas, tal vez ahi podrian ir y el cliente tal vez se elimina del pipeline y podria ir a postventa tal vez en un apartado nuevo donde diga rechazos o no se la verdad."
- L3: Decision: separate columns instead of a new `estado_pipeline` value. No CHECK exists on `estado_pipeline`; triggers `validar_cierre_venta` and `trg_actualizar_estado_comision` fire only on other columns, so new columns do not interact. Dashboard `app/page.tsx:826` already filters a non-existent `'perdida'` stage.
- L4: Known base failures (present on `main` before this feature): "Navegación lateral Sidebar: colapsada por defecto y persistencia", "Fase 3: verificación de interfaces y UI de ventas para comisiones y roles". Production database not touched; the migration must be applied there through the normal release process.
- L5: Seam check after T2+T3: `npm run lint` clean; `node --test tests/*.test.mjs` 72 tests, 70 pass, 2 known base failures; `npm run build` passes after removing stale generated `.next/dev/types` left by the WhatsApp branch dev server. `tests/seguimiento-notificaciones.test.mjs` registers a small resolve hook because lib modules now import each other without extensions (tsconfig lacks `allowImportingTsExtensions`).
