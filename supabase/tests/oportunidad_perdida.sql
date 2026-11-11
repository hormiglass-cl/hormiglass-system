-- Database rules for lost opportunities (migrations 20261111120000, 20261111130000, 20261111140000).
-- Run against a DEV database only. Every change is rolled back: success ends with
-- the error "ROLLBACK_OK 1234567890" (the last digit is rule 10); any other error names the failing rule.
-- Requires at least one opportunity in stage 'nueva'.
DO $$
DECLARE v_id uuid; v_user uuid; v_auth uuid; r record; ok text := '';
BEGIN
  SELECT id INTO v_id FROM public.oportunidades WHERE estado_pipeline = 'nueva' AND perdida_at IS NULL LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'SETUP: no open opportunity in stage nueva'; END IF;

  -- 1. Marking lost sets perdida_at in the database.
  UPDATE public.oportunidades SET perdida_motivo = 'precio', perdida_detalle = 'caro' WHERE id = v_id;
  SELECT * INTO r FROM public.oportunidades WHERE id = v_id;
  IF r.perdida_at IS NULL THEN RAISE EXCEPTION 'FAIL1 perdida_at not set'; END IF; ok := ok || '1';

  -- 2. A lost opportunity cannot change stage.
  BEGIN UPDATE public.oportunidades SET estado_pipeline = 'pagada' WHERE id = v_id; RAISE EXCEPTION 'FAIL2';
  EXCEPTION WHEN check_violation THEN ok := ok || '2'; END;

  -- 3. Unknown reasons are rejected.
  BEGIN UPDATE public.oportunidades SET perdida_motivo = 'foo' WHERE id = v_id; RAISE EXCEPTION 'FAIL3';
  EXCEPTION WHEN check_violation THEN ok := ok || '3'; END;

  -- 4. 'otro' requires a non-blank detail.
  BEGIN UPDATE public.oportunidades SET perdida_motivo = 'otro', perdida_detalle = '  ' WHERE id = v_id; RAISE EXCEPTION 'FAIL4';
  EXCEPTION WHEN check_violation THEN ok := ok || '4'; END;

  -- 5. Editing the reason keeps the original date; clients cannot set it.
  UPDATE public.oportunidades SET perdida_motivo = 'competencia', perdida_at = '2000-01-01' WHERE id = v_id;
  IF (SELECT perdida_at FROM public.oportunidades WHERE id = v_id) <> r.perdida_at THEN RAISE EXCEPTION 'FAIL5'; END IF; ok := ok || '5';

  -- 6. Reopening clears every lost field and keeps the stage.
  UPDATE public.oportunidades SET perdida_motivo = NULL WHERE id = v_id;
  SELECT * INTO r FROM public.oportunidades WHERE id = v_id;
  IF r.perdida_at IS NOT NULL OR r.perdida_detalle IS NOT NULL OR r.estado_pipeline <> 'nueva' THEN RAISE EXCEPTION 'FAIL6'; END IF; ok := ok || '6';

  -- 7. Only a 'nueva' opportunity can be marked lost.
  UPDATE public.oportunidades SET estado_pipeline = 'pagada' WHERE id = v_id;
  BEGIN UPDATE public.oportunidades SET perdida_motivo = 'precio' WHERE id = v_id; RAISE EXCEPTION 'FAIL7';
  EXCEPTION WHEN check_violation THEN ok := ok || '7'; END;

  -- 8. Setting perdida_at without a reason does not mark it lost.
  UPDATE public.oportunidades SET estado_pipeline = 'nueva', perdida_at = now() WHERE id = v_id;
  IF (SELECT perdida_at FROM public.oportunidades WHERE id = v_id) IS NOT NULL THEN RAISE EXCEPTION 'FAIL8'; END IF; ok := ok || '8';

  -- 9. An insert cannot choose the lost date (migration 20261111130000).
  INSERT INTO public.oportunidades (cliente_id, codigo, titulo, estado_pipeline, fecha_inicio, perdida_motivo, perdida_at)
  SELECT cliente_id, codigo || '-probe', titulo, 'nueva', fecha_inicio, 'precio', '2000-01-01'
  FROM public.oportunidades WHERE id = v_id
  RETURNING perdida_at INTO r;
  IF r.perdida_at < now() - interval '1 minute' THEN RAISE EXCEPTION 'FAIL9 backdated insert kept'; END IF; ok := ok || '9';

  -- 10. The author is set from the session user and may become NULL (user deleted, ON DELETE
  --     SET NULL), but cannot be replaced (migration 20261111140000).
  SELECT u.id, u.auth_id INTO v_user, v_auth FROM public.usuarios u WHERE u.auth_id IS NOT NULL LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', v_auth::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth)::text, true);
  UPDATE public.oportunidades SET perdida_motivo = 'precio' WHERE id = v_id;
  IF (SELECT perdida_por FROM public.oportunidades WHERE id = v_id) IS DISTINCT FROM v_user THEN RAISE EXCEPTION 'FAIL10 author not set'; END IF;
  UPDATE public.oportunidades SET perdida_por = gen_random_uuid() WHERE id = v_id;
  IF (SELECT perdida_por FROM public.oportunidades WHERE id = v_id) IS DISTINCT FROM v_user THEN RAISE EXCEPTION 'FAIL10 author replaced'; END IF;
  UPDATE public.oportunidades SET perdida_por = NULL WHERE id = v_id;
  IF (SELECT perdida_por FROM public.oportunidades WHERE id = v_id) IS NOT NULL THEN RAISE EXCEPTION 'FAIL10 author restored after SET NULL'; END IF;
  ok := ok || '0';

  RAISE EXCEPTION 'ROLLBACK_OK %', ok;
END $$;
