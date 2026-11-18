-- Only an admin may change an opportunity's assigned seller (migration 20261118120000).
-- Run against a DEV database only. Every change is rolled back: success ends with the error
-- "ROLLBACK_OK 123456"; any other error names the failing rule.
-- Requires one active non-admin user and one active admin, both with a login.
DO $$
DECLARE v_id uuid; v_old uuid; v_user uuid; v_user_auth uuid; v_admin uuid; v_admin_auth uuid;
  v_cliente uuid; v_new uuid; ok text := '';
BEGIN
  SELECT id, auth_id INTO v_user, v_user_auth FROM public.usuarios WHERE activo AND rol = 'user' AND auth_id IS NOT NULL LIMIT 1;
  SELECT id, auth_id INTO v_admin, v_admin_auth FROM public.usuarios WHERE activo AND rol = 'admin' AND auth_id IS NOT NULL LIMIT 1;
  IF v_user IS NULL OR v_admin IS NULL THEN RAISE EXCEPTION 'SETUP: need an active user and an active admin with a login'; END IF;
  SELECT id, asignado_a, cliente_id INTO v_id, v_old, v_cliente FROM public.oportunidades LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'SETUP: no opportunity'; END IF;
  v_new := CASE WHEN v_old IS DISTINCT FROM v_admin THEN v_admin ELSE v_user END;

  -- Act as a signed-in non-admin, the way the browser does (PostgREST role "authenticated").
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- 1. A non-admin cannot change the assigned seller.
  BEGIN UPDATE public.oportunidades SET asignado_a = v_new WHERE id = v_id; RAISE EXCEPTION 'FAIL1 non-admin changed the seller';
  EXCEPTION WHEN insufficient_privilege THEN ok := ok || '1'; END;

  -- 2. A non-admin cannot clear the assigned seller either.
  IF v_old IS NOT NULL THEN
    BEGIN UPDATE public.oportunidades SET asignado_a = NULL WHERE id = v_id; RAISE EXCEPTION 'FAIL2 non-admin cleared the seller';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END IF;
  ok := ok || '2';

  -- 3. A non-admin can still edit other fields, and re-saving the same seller is not a change.
  UPDATE public.oportunidades SET titulo = titulo || ' ', asignado_a = v_old WHERE id = v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL3 non-admin could not edit other fields'; END IF; ok := ok || '3';

  -- 4. A non-admin can still create an opportunity (inserts are unchanged).
  INSERT INTO public.oportunidades (cliente_id, codigo, titulo, estado_pipeline, fecha_inicio, asignado_a)
  VALUES (v_cliente, 'PROBE-ASIGNADO', 'probe', 'nueva', now(), v_user);
  ok := ok || '4';

  -- 5. An admin can change the assigned seller.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_auth, 'role', 'authenticated')::text, true);
  UPDATE public.oportunidades SET asignado_a = v_new WHERE id = v_id;
  IF (SELECT asignado_a FROM public.oportunidades WHERE id = v_id) IS DISTINCT FROM v_new THEN RAISE EXCEPTION 'FAIL5 admin could not change the seller'; END IF;
  ok := ok || '5';

  -- 6. Trusted server paths (service role, SECURITY DEFINER functions such as the bot receiver)
  --    still assign sellers.
  PERFORM set_config('role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  UPDATE public.oportunidades SET asignado_a = v_old WHERE id = v_id;
  IF (SELECT asignado_a FROM public.oportunidades WHERE id = v_id) IS DISTINCT FROM v_old THEN RAISE EXCEPTION 'FAIL6 service role could not assign'; END IF;
  ok := ok || '6';

  RAISE EXCEPTION 'ROLLBACK_OK %', ok;
END $$;
