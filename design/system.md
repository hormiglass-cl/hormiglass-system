# Hormiglass · sistema encontrado

Fuente de tokens y reglas: `app/globals.css`. Componentes de referencia: `components/ui/crm.tsx` (Panel y Button). No es un sistema propuesto ni una paleta nueva. Captura acotada a los tokens usados por la ficha y sus muestras.

## Colores (15)

| Token CSS | Valor | Uso |
|---|---|---|
| --hg-app-bg | #f6f5f2 | Fondo de aplicación |
| --hg-surface | #ffffff | Panel y badge |
| --hg-surface-muted | #eeede8 | Superficie secundaria |
| --hg-border | #e3e1db | Borde del panel |
| --hg-border-subtle | #eeede8 | Separador del encabezado |
| --hg-text | #363636 | Texto principal |
| --hg-text-muted | #5c5a55 | Texto secundario |
| --hg-accent | #f7931f | Acción primaria |
| --hg-accent-hover | #eb8a1e | Hover de acción |
| --hg-accent-ink | #a14a06 | Texto de acento y foco |
| --hg-accent-soft | #fff3e6 | Identidad y oportunidad |
| --hg-accent-border | #f8cfa0 | Borde de oportunidad |
| --hg-info | #2c5a94 | Texto e iconos del asistente |
| --hg-info-soft | #eaf1fa | Fondo del asistente |
| --hg-info-border | #bfd3ec | Borde del asistente |

`--hg-on-accent` es un alias de valor #363636 para texto sobre el botón naranja. Las utilidades son `text-ink`, `text-ink-muted`, `text-accent-ink`, `text-info`, `bg-accent-soft`, `bg-info-soft`, `border-accent-line` y `border-info-line`.

## Tipografía

Fuente: `app/globals.css`, regla body y escala `.t-*`.

- Sistema: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Body: 14px / 1.43. Escala encontrada: 11/14, 12/16, 13/18, 14/20, 16/22, 22/28, 26/32 px (7 tamaños).
- Pesos permitidos: 400, 500, 600, 700. Mínimo 11px.

## Espaciado y forma

Fuente: `app/globals.css` (componentes) y `components/ui/crm.tsx` (utilidades Panel/Button).

- Espaciados usados en componentes: 4, 6, 8, 10, 12, 16, 20, 24px. Se mantienen múltiplos de la escala existente, sin nuevos tokens globales.
- Radios: `--hg-radius-sm: 6px`, `--hg-radius: 8px`, `--hg-radius-lg: 10px`.
- Sombras: `--hg-shadow-card: 0 1px 2px rgb(54 54 54 / 5%)`; `--hg-shadow-popover: 0 12px 32px rgb(54 54 54 / 14%)`.

## Reglas de componentes

- Panel: blanco, borde de 1px, radio 10px, sombra card; encabezado separado por border-subtle.
- Button: texto semibold, radio control 6px, primary accent/on-accent, hover accent-hover; foco visible de 2px accent-ink con offset 2px. Un primario por contexto.
- Estados: acompañar el color con texto o icono. Sin gradientes ni nuevos colores en esta ficha.
- Mantener datos ficticios y resumen local; no convertir teléfono/código en enlaces reales.

## Autochequeo del artboard

`whatsapp-client-details/01-refined.html` utiliza únicamente los colores de esta tabla, la fuente de sistema y radios de 6/10px. Texto mínimo de 11px, colores oscuros sobre fondos suaves, foco visible; sin movimiento ni recursos externos. Anchos verificados en el componente real: 236, 320 y 390px. El artboard representa únicamente la ficha, no el layout de la aplicación.
