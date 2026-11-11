// Legacy v1 and explicit revisions 1.1/1.2 wire validation. No coercion: transport signatures and event identity use exact bytes.
export type WhatsAppEvent = {
  schema_version: 1;
  protocol_revision?: '1.1' | '1.2';
  event_id: string;
  conversation_id: string;
  type: 'lead.qualified' | 'handoff.created' | 'message.new' | 'ownership.released' | 'ownership.taken';
  data: Record<string, unknown>;
};
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !v.includes('\u0000');
const id = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const uuid = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const version = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= 2147483647;
const only = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(k => keys.includes(k));
const oneOf = (v: unknown, values: string[]) => typeof v === 'string' && values.includes(v);
const phone = (v: unknown) => typeof v === 'string' && /^\+[1-9][0-9]{7,14}$/.test(v);
// A real calendar date, e.g. 2026-02-30 is rejected.
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const optional = (d: Record<string, unknown>, key: string, check: (v: unknown) => boolean) => !Object.hasOwn(d, key) || check(d[key]);
const nullable = (check: (v: unknown) => boolean) => (v: unknown) => v === null || check(v);
const leadKeys = ['lead_id', 'revision', 'phone', 'name', 'rut', 'crm_seller_id', 'title', 'requirement'];
const summaryKeys = ['lead_class', 'next_best_action', 'executive_summary', 'pain', 'scope', 'timing', 'obstacle'];
// Optional lead.qualified fields added in revision 1.2 (A1). Absent means "no information".
const lead12: Record<string, (v: unknown) => boolean> = {
  customer_type: v => oneOf(v, ['natural', 'company']),
  company: v => text(v, 200),
  tax_document: v => oneOf(v, ['boleta', 'factura']),
  purchase_order: v => text(v, 100),
  service: v => text(v, 100),
  fulfillment: v => oneOf(v, ['delivery', 'install', 'pickup']),
  city: v => text(v, 100),
  commune: v => text(v, 100),
  address: v => text(v, 300),
  use_case: v => text(v, 200),
  urgency: v => oneOf(v, ['urgente', 'alta', 'media', 'baja']),
  desired_date: date,
  source_number: phone,
  site: v => object(v) && only(v, ['terrain', 'truck_access', 'debris_removal', 'access_restrictions'])
    && optional(v, 'terrain', t => text(t, 100)) && optional(v, 'truck_access', b => typeof b === 'boolean')
    && optional(v, 'debris_removal', b => typeof b === 'boolean') && optional(v, 'access_restrictions', t => text(t, 500)),
  items: v => Array.isArray(v) && v.length <= 50 && v.every(i => object(i) && only(i, ['product', 'variant', 'quantity', 'unit', 'measurements'])
    && text(i.product, 200) && optional(i, 'variant', nullable(t => text(t, 200)))
    && optional(i, 'quantity', nullable(q => typeof q === 'number' && Number.isFinite(q) && q > 0))
    && optional(i, 'unit', nullable(t => text(t, 20))) && optional(i, 'measurements', nullable(t => text(t, 200)))),
  ai_summary: v => object(v) && only(v, summaryKeys) && summaryKeys.every(k => optional(v, k, t => text(t, 4000))),
};
export const postventaTypes = ['producto_defectuoso', 'problema_fabricacion', 'problema_instalacion', 'dano_transporte', 'uso_incorrecto', 'movimiento_terreno', 'trabajo_adicional', 'dano_terceros', 'faltante', 'defecto', 'cantidad_adicional', 'otro'];
export function validEvent(v: unknown): v is WhatsAppEvent {
  if (!object(v) || !only(v, ['schema_version', 'protocol_revision', 'event_id', 'conversation_id', 'type', 'data']) || (Object.hasOwn(v, 'protocol_revision') && v.protocol_revision !== '1.1' && v.protocol_revision !== '1.2') || v.schema_version !== 1 || !id(v.event_id) || !id(v.conversation_id) || !object(v.data)) return false;
  const d = v.data;
  const r12 = v.protocol_revision === '1.2';
  switch (v.type) {
    case 'lead.qualified':
      return only(d, r12 ? [...leadKeys, ...Object.keys(lead12)] : leadKeys) && (!r12 || Object.keys(lead12).every(k => optional(d, k, lead12[k])))
        && id(d.lead_id) && version(d.revision) && phone(d.phone) && text(d.name, 200) && (d.rut === undefined || text(d.rut, 32)) && uuid(d.crm_seller_id) && text(d.title, 200) && text(d.requirement, 16000);
    case 'handoff.created':
      // Revision 1.2 keeps the 1.1 handoff rules unchanged (S8).
      if (v.protocol_revision === '1.1' || r12) {
        return only(d, ['handoff_id', 'kind', 'area', 'reason', 'priority', 'description', 'crm_opportunity_id', 'postventa_type']) && id(d.handoff_id) && text(d.description, 16000)
          && typeof d.reason === 'string' && d.reason.length <= 64 && /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(d.reason)
          && typeof d.priority === 'string' && ['urgente', 'alta', 'media', 'baja'].includes(d.priority)
          && (d.crm_opportunity_id === undefined || uuid(d.crm_opportunity_id))
          && (d.postventa_type === undefined || (d.kind === 'complaint' && typeof d.postventa_type === 'string' && postventaTypes.includes(d.postventa_type)))
          && ((d.kind === 'commercial' && typeof d.area === 'string' && ['sales', 'management'].includes(d.area))
            || (d.kind === 'operational' && typeof d.area === 'string' && ['finance', 'scheduling'].includes(d.area) && d.crm_opportunity_id === undefined)
            || (d.kind === 'complaint' && (d.area === undefined || d.area === 'claims')));
      }
      return only(d, ['handoff_id', 'kind', 'description', 'crm_opportunity_id', 'postventa_type']) && id(d.handoff_id) && ['complaint', 'operational'].includes(String(d.kind)) && text(d.description, 16000) && (d.crm_opportunity_id === undefined || uuid(d.crm_opportunity_id)) && (d.postventa_type === undefined || postventaTypes.includes(String(d.postventa_type))) && (d.kind === 'complaint' || (d.crm_opportunity_id === undefined && d.postventa_type === undefined));
    case 'message.new':
      // 1.2 adds the author: inbound comes only from the customer; a seller author names the CRM seller.
      if (r12 && !(oneOf(d.sender, ['customer', 'bot', 'seller', 'system']) && (d.direction === 'inbound') === (d.sender === 'customer')
        && (d.sender === 'seller' ? uuid(d.crm_seller_id) : !Object.hasOwn(d, 'crm_seller_id')))) return false;
      return only(d, r12 ? ['message_id', 'direction', 'text', 'sent_at', 'sender', 'crm_seller_id'] : ['message_id', 'direction', 'text', 'sent_at']) && id(d.message_id) && ['inbound', 'outbound'].includes(String(d.direction)) && text(d.text, 16000) && typeof d.sent_at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(d.sent_at) && Number.isFinite(Date.parse(d.sent_at)) && new Date(d.sent_at).toISOString().slice(0, 19) === d.sent_at.slice(0, 19);
    case 'ownership.taken':
      return (v.protocol_revision === '1.1' || r12) && only(d, ['version', 'crm_seller_id', 'source']) && version(d.version) && Object.hasOwn(d, 'crm_seller_id') && (d.crm_seller_id === null || uuid(d.crm_seller_id)) && (d.source === 'clickup' || (r12 && d.source === 'crm'));
    case 'ownership.released':
      if (r12) return only(d, ['version', 'reason']) && version(d.version) && oneOf(d.reason, ['seller_released', 'sla_expired', 'customer_new_quote', 'opportunity_closed']);
      return only(d, ['version']) && version(d.version);
    default: return false;
  }
}
