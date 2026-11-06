export interface QuoteDraftItem {
  description: string;
  quantity: string;
  unitPrice: string;
}

export type QuoteCalculation =
  | { ok: true; lines: number[]; net: number; iva: number; total: number }
  | { ok: false; error: string };

export function createQuoteItem(): QuoteDraftItem {
  return { description: '', quantity: '1', unitPrice: '' };
}

/** Local demo arithmetic only: round each CLP line before calculating aggregate IVA. */
export function calculateQuote(items: readonly QuoteDraftItem[]): QuoteCalculation {
  if (!items.length) return { ok: false, error: 'Agrega al menos un ítem.' };
  const lines: number[] = [];
  let net = 0;
  for (const item of items) {
    if (!item.description.trim()) return { ok: false, error: 'Completa la descripción de cada ítem.' };
    const quantity = Number(item.quantity);
    const price = Number(item.unitPrice);
    if (!item.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, error: 'La cantidad debe ser finita y positiva.' };
    }
    if (!item.unitPrice.trim() || !Number.isFinite(price) || price < 0) {
      return { ok: false, error: 'El precio debe ser finito y mayor o igual a cero.' };
    }
    const amount = Math.round(quantity * price);
    net += amount;
    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(net)) {
      return { ok: false, error: 'Los importes exceden el rango seguro de cálculo CLP.' };
    }
    lines.push(amount);
  }
  const iva = Math.round(net * 0.19);
  const total = net + iva;
  if (!Number.isSafeInteger(iva) || !Number.isSafeInteger(total)) {
    return { ok: false, error: 'Los importes exceden el rango seguro de cálculo CLP.' };
  }
  return { ok: true, lines, net, iva, total };
}
