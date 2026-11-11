-- Revision 1.2a "Ficha WhatsApp": read the stored bot record and resolve pending corrections.
-- WhatsApp tables stay service_role only; browsers reach them through these checked functions.
BEGIN;
CREATE FUNCTION public.whatsapp_lead_panel(p_opportunity_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l public.whatsapp_lead_links%ROWTYPE;
BEGIN
  IF NOT public.is_active_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO l FROM public.whatsapp_lead_links WHERE opportunity_id=p_opportunity_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('lead_id',l.external_lead_id,'revision',l.revision,'record',l.bot_requirement,
    'can_resolve',public.has_role('user'),
    'corrections',(SELECT coalesce(jsonb_agg(jsonb_build_object('entity',c.entity,'field',c.field,
        'before',c.before_value,'after',c.after_value,'revision',c.revision,'updated_at',c.updated_at)
        ORDER BY c.entity DESC,c.field),'[]'::jsonb)
      FROM public.whatsapp_pending_corrections c WHERE c.external_lead_id=l.external_lead_id));
END $$;

-- Accept writes the bot value; discard keeps the current value. Both record the bot value as the
-- opportunity snapshot, so a later revision repeating it is not proposed again, while a human
-- value that differs from the snapshot keeps later bot changes under review.
-- p_expected_after must equal the queued value: a newer bot correction refuses a stale click.
CREATE FUNCTION public.whatsapp_resolve_correction(p_opportunity_id uuid, p_entity text, p_field text,
  p_expected_after jsonb, p_accept boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l public.whatsapp_lead_links%ROWTYPE; c public.whatsapp_pending_corrections%ROWTYPE;
BEGIN
  IF NOT public.is_active_user() OR NOT public.has_role('user') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_accept IS NULL THEN RAISE EXCEPTION 'invalid_resolution'; END IF;
  -- Receiver lock order (link, opportunity, customer): a concurrent bot correction waits or wins.
  SELECT * INTO l FROM public.whatsapp_lead_links WHERE opportunity_id=p_opportunity_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'correction_not_found'; END IF;
  PERFORM 1 FROM public.oportunidades WHERE id=l.opportunity_id FOR UPDATE;
  PERFORM 1 FROM public.clientes WHERE id=l.customer_id FOR UPDATE;
  SELECT * INTO c FROM public.whatsapp_pending_corrections
    WHERE external_lead_id=l.external_lead_id AND entity=p_entity AND field=p_field;
  IF NOT FOUND THEN RAISE EXCEPTION 'correction_not_found'; END IF;
  IF c.after_value IS DISTINCT FROM coalesce(p_expected_after,'null'::jsonb) THEN RAISE EXCEPTION 'correction_changed'; END IF;
  IF p_accept THEN
    -- Field names come from the queue's CHECK whitelist; row hydration keeps native types.
    IF c.entity='opportunity' THEN
      EXECUTE format('UPDATE public.oportunidades SET %1$I=(jsonb_populate_record(NULL::public.oportunidades,$1)).%1$I WHERE id=$2',c.field)
        USING jsonb_build_object(c.field,c.after_value),l.opportunity_id;
    ELSE
      EXECUTE format('UPDATE public.clientes SET %1$I=(jsonb_populate_record(NULL::public.clientes,$1)).%1$I WHERE id=$2',c.field)
        USING jsonb_build_object(c.field,c.after_value),l.customer_id;
    END IF;
  END IF;
  IF c.entity='opportunity' THEN
    UPDATE public.whatsapp_lead_links SET last_applied=last_applied||jsonb_build_object(c.field,c.after_value)
      WHERE external_lead_id=l.external_lead_id;
  END IF;
  DELETE FROM public.whatsapp_pending_corrections
    WHERE external_lead_id=c.external_lead_id AND entity=c.entity AND field=c.field;
  RETURN public.whatsapp_lead_panel(p_opportunity_id);
END $$;
REVOKE ALL ON FUNCTION public.whatsapp_lead_panel(uuid),public.whatsapp_resolve_correction(uuid,text,text,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_lead_panel(uuid),public.whatsapp_resolve_correction(uuid,text,text,jsonb,boolean) TO authenticated;
COMMIT;
