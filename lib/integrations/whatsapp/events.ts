// Legacy v1 and explicit revision 1.1 wire validation. No coercion: transport signatures and event identity use exact bytes.
export type WhatsAppEvent = {
  schema_version: 1;
  protocol_revision?: '1.1';
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
export const postventaTypes = ['producto_defectuoso', 'problema_fabricacion', 'problema_instalacion', 'dano_transporte', 'uso_incorrecto', 'movimiento_terreno', 'trabajo_adicional', 'dano_terceros', 'faltante', 'defecto', 'cantidad_adicional', 'otro'];
export function validEvent(v: unknown): v is WhatsAppEvent {
  if (!object(v) || !only(v, ['schema_version', 'protocol_revision', 'event_id', 'conversation_id', 'type', 'data']) || (Object.hasOwn(v, 'protocol_revision') && v.protocol_revision !== '1.1') || v.schema_version !== 1 || !id(v.event_id) || !id(v.conversation_id) || !object(v.data)) return false;
  const d = v.data;
  switch (v.type) {
    case 'lead.qualified':
      return only(d, ['lead_id', 'revision', 'phone', 'name', 'rut', 'crm_seller_id', 'title', 'requirement']) && id(d.lead_id) && version(d.revision) && typeof d.phone === 'string' && /^\+[1-9][0-9]{7,14}$/.test(d.phone) && text(d.name, 200) && (d.rut === undefined || text(d.rut, 32)) && uuid(d.crm_seller_id) && text(d.title, 200) && text(d.requirement, 16000);
    case 'handoff.created':
      if (v.protocol_revision === '1.1') {
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
      return only(d, ['message_id', 'direction', 'text', 'sent_at']) && id(d.message_id) && ['inbound', 'outbound'].includes(String(d.direction)) && text(d.text, 16000) && typeof d.sent_at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(d.sent_at) && Number.isFinite(Date.parse(d.sent_at)) && new Date(d.sent_at).toISOString().slice(0, 19) === d.sent_at.slice(0, 19);
    case 'ownership.taken':
      return v.protocol_revision === '1.1' && only(d, ['version', 'crm_seller_id', 'source']) && version(d.version) && Object.hasOwn(d, 'crm_seller_id') && (d.crm_seller_id === null || uuid(d.crm_seller_id)) && d.source === 'clickup';
    case 'ownership.released':
      return only(d, ['version']) && version(d.version);
    default: return false;
  }
}
