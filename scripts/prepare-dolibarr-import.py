"""Prepara lotes SQL idempotentes desde el CSV ya limpiado de Dolibarr.

Los archivos resultantes contienen datos personales: escribirlos fuera del repo.
Este programa no conecta a Supabase ni ejecuta SQL.
"""

import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path


def title_name(value):
    words = re.sub(r"\s+", " ", value.strip()).title().split(" ")
    legal = {"Spa": "SpA", "Ltda": "Ltda.", "Ltda.": "Ltda.", "Eirl": "EIRL", "S.A.": "S.A."}
    return " ".join(legal.get(word, word) for word in words)


def clean_client_name(value):
    """Conserva letras, cifras y espacios, sin perder tildes ni la ñ."""
    name = value.strip()
    name = re.sub(
        r"^(?:(?:raz[oó]n\s+social|r\.?\s*social|empresa|nombre|social|"
        r"cotizaci[oó]n\s+a\s+nombre\s+de)\s*:\s*)+",
        "", name, flags=re.IGNORECASE,
    )
    rut = r"\d{1,2}\.\d{3}\.\d{3}-[0-9kK]"
    name = re.sub(r"^" + rut + r"\s+", "", name)
    name = re.sub(r"\s*[/,.-]?\s*" + rut + r"\s*$", "", name)
    name = re.sub(r"\bS\s*\.\s*A\s*\.?\b", "SA", name, flags=re.IGNORECASE)
    name = "".join(char if char.isalnum() or char.isspace() else " " for char in name)
    words = re.sub(r"\s+", " ", name).strip().title().split()
    legal = {"Spa": "SpA", "Ltda": "Ltda", "Sa": "SA", "Eirl": "EIRL"}
    cleaned = " ".join(legal.get(word, word) for word in words)
    if not cleaned:
        raise ValueError("Un nombre quedó vacío después de limpiarlo")
    return cleaned


def sql_literal(value):
    return "'" + value.replace("'", "''") + "'"


def sql_json(data):
    return sql_literal(json.dumps(data, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def nullable(value):
    return value.strip() or None


def make_clients(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[row["dup_key"]].append(row)
    clients = []
    notes = []
    for grouped in groups.values():
        primary = grouped[0]
        emails = []
        phones = []
        for row in grouped:
            for email in [row["correo"], *row["correos_secundarios"].split(";")]:
                if email and email.lower() not in [x.lower() for x in emails]:
                    emails.append(email)
            if row["telefono"] and row["telefono"] not in phones:
                phones.append(row["telefono"])
            if row["notas"].strip():
                notes.append({
                    "dolibarr_origen_id": row["dolibarr_id"],
                    "cliente_dolibarr_id": primary["dolibarr_id"],
                    "contenido": "Nota histórica de Dolibarr (fecha y autor no informados): " + row["notas"].strip(),
                })
        rut = primary["rut"] if primary["rut_estado"] == "ok" else None
        clients.append({
            "dolibarr_id": primary["dolibarr_id"],
            "nombre": clean_client_name(primary["nombre"]),
            "rut": rut,
            "tipo_cliente": nullable(primary["tipo_cliente"]),
            "telefono": phones[0] if phones else None,
            "telefonos_secundarios": phones[1:],
            "correo": emails[0] if emails else None,
            "correos_secundarios": emails[1:],
            "direccion": nullable(primary["direccion"]),
            "comuna": nullable(primary["comuna"]),
            "region": nullable(primary["region"]),
            "canal_origen": nullable(primary["canal_origen"]),
            "estado_dolibarr": nullable(primary["tipo_dolibarr"]),
            "codigo_dolibarr": nullable(primary["cod_cliente_dolibarr"]),
            "alias": nullable(primary["alias"]),
            "empresa_matriz": nullable(primary["empresa_matriz"]),
            "vendedor_origen": title_name(primary["vendedor_origen"]) if primary["vendedor_origen"] else None,
            "created_at": primary["created_at"],
        })
    return clients, notes


def merge_cross_key_duplicates(clients, notes):
    """Une claves distintas cuando coinciden nombre + correo o nombre + teléfono.

    Nunca une dos RUT válidos diferentes. Devuelve además el mapa para depurar
    una importación iniciada con la agrupación conservadora por clave original.
    """
    parent = list(range(len(clients)))
    ruts = [{c["rut"]} if c["rut"] else set() for c in clients]

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def join(a, b):
        a, b = root(a), root(b)
        if a == b or len(ruts[a] | ruts[b]) > 1:
            return
        parent[b] = a
        ruts[a] |= ruts[b]

    for field in ("correo", "telefono"):
        keys = defaultdict(list)
        for i, client in enumerate(clients):
            if client[field]:
                keys[(client["nombre"].lower(), client[field].lower())].append(i)
        for indexes in keys.values():
            for i in indexes[1:]:
                join(indexes[0], i)

    groups = defaultdict(list)
    for i, client in enumerate(clients):
        groups[root(i)].append(client)

    merged = []
    maps = []
    replacements = {}
    for grouped in groups.values():
        primary = max(grouped, key=lambda c: (
            bool(c["rut"]), bool(c["correo"]), bool(c["telefono"])))
        phones = list(dict.fromkeys(phone for c in grouped
                                    for phone in [c["telefono"], *c["telefonos_secundarios"]] if phone))
        emails = list(dict.fromkeys(email for c in grouped
                                    for email in [c["correo"], *c["correos_secundarios"]] if email))
        primary = dict(primary)
        primary["telefono"] = primary["telefono"] or (phones[0] if phones else None)
        primary["correo"] = primary["correo"] or (emails[0] if emails else None)
        primary["telefonos_secundarios"] = [p for p in phones if p != primary["telefono"]]
        primary["correos_secundarios"] = [e for e in emails if not primary["correo"] or e.lower() != primary["correo"].lower()]
        if not primary["vendedor_origen"]:
            primary["vendedor_origen"] = next((c["vendedor_origen"] for c in grouped
                                               if c["vendedor_origen"]), None)
        merged.append(primary)
        for c in grouped:
            replacements[c["dolibarr_id"]] = primary["dolibarr_id"]
        if len(grouped) > 1:
            maps.append({"source_ids": [c["dolibarr_id"] for c in grouped],
                         "telefonos": phones, "correos": emails})

    for note in notes:
        note["cliente_dolibarr_id"] = replacements[note["cliente_dolibarr_id"]]
    return merged, notes, maps


def client_sql(batch):
    return f"""WITH source AS (
  SELECT * FROM jsonb_to_recordset({sql_json(batch)}) AS x(
    dolibarr_id text, nombre text, rut text, tipo_cliente text,
    telefono text, telefonos_secundarios text[], correo text,
    correos_secundarios text[], direccion text, comuna text, region text,
    canal_origen text, estado_dolibarr text, codigo_dolibarr text,
    alias text, empresa_matriz text, vendedor_origen text, created_at timestamptz)
), ins AS (
  INSERT INTO public.clientes (
    dolibarr_id, nombre, apellido_razon_social, rut, tipo_cliente,
    telefono, telefonos_secundarios, correo, correos_secundarios,
    direccion, comuna, region, canal_origen, estado_dolibarr,
    codigo_dolibarr, alias, empresa_matriz, vendedor_historico_id,
    created_at)
  SELECT s.dolibarr_id, s.nombre, s.nombre, s.rut, s.tipo_cliente,
    s.telefono, COALESCE(s.telefonos_secundarios, '{{}}'::text[]),
    s.correo, s.correos_secundarios, s.direccion, s.comuna, s.region,
    s.canal_origen, s.estado_dolibarr, s.codigo_dolibarr, s.alias,
    s.empresa_matriz,
    (SELECT t.id FROM public.trabajadores t
      WHERE lower(t.nombre) = lower(s.vendedor_origen)
      ORDER BY (t.usuario_id IS NOT NULL) DESC, t.created_at ASC LIMIT 1),
    s.created_at
  FROM source s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clientes c WHERE c.dolibarr_id = s.dolibarr_id
      OR (s.rut IS NOT NULL AND regexp_replace(lower(c.rut), '[^0-9k]', '', 'g') = regexp_replace(lower(s.rut), '[^0-9k]', '', 'g'))
      OR (s.correo IS NOT NULL AND lower(c.nombre) = lower(s.nombre) AND lower(c.correo) = lower(s.correo))
      OR (s.telefono IS NOT NULL AND lower(c.nombre) = lower(s.nombre) AND c.telefono = s.telefono
        AND (c.rut IS NULL OR s.rut IS NULL OR regexp_replace(lower(c.rut), '[^0-9k]', '', 'g') = regexp_replace(lower(s.rut), '[^0-9k]', '', 'g')))
  )
  ON CONFLICT DO NOTHING RETURNING id
)
SELECT count(*)::int AS inserted FROM ins;"""


def name_updates_sql(batch):
    return f"""WITH source AS (
  SELECT * FROM jsonb_to_recordset({sql_json(batch)}) AS x(
    dolibarr_id text, old_name text, new_name text)
), changed AS (
  UPDATE public.clientes c SET
    apellido_razon_social=CASE WHEN c.apellido_razon_social=c.nombre
      THEN s.new_name ELSE c.apellido_razon_social END,
    nombre=s.new_name
  FROM source s
  WHERE c.dolibarr_id=s.dolibarr_id AND c.nombre=s.old_name
  RETURNING c.id
)
SELECT count(*)::int AS updated FROM changed;"""


def seller_sql(names):
    payload = [{"nombre": name} for name in names]
    return f"""WITH source AS (
  SELECT * FROM jsonb_to_recordset({sql_json(payload)}) AS x(nombre text)
), ins AS (
  INSERT INTO public.trabajadores
    (nombre, rut, email, cargo, area, tipo_contrato, fecha_ingreso,
     sueldo_base, activo, usuario_id, origen_dolibarr, observaciones)
  SELECT s.nombre, NULL, NULL, 'Vendedor histórico', 'Comercial & Ventas',
    'Sin información', NULL, NULL, FALSE, NULL, TRUE,
    'Referencia de vendedor importada de Dolibarr. Sin cuenta en CRM.'
  FROM source s
  WHERE NOT EXISTS (SELECT 1 FROM public.trabajadores t WHERE lower(t.nombre) = lower(s.nombre))
  ON CONFLICT DO NOTHING RETURNING id
)
SELECT count(*)::int AS inserted FROM ins;"""


def cross_group_contacts_sql(clients):
    """Une teléfonos/correos de filas con RUT y sin RUT del mismo nombre y correo."""
    groups = defaultdict(list)
    for client in clients:
        if client["correo"]:
            groups[(client["nombre"].lower(), client["correo"].lower())].append(client)
    payload = []
    for grouped in groups.values():
        if len(grouped) < 2:
            continue
        phones = list(dict.fromkeys(phone for c in grouped
                                    for phone in [c["telefono"], *c["telefonos_secundarios"]] if phone))
        emails = list(dict.fromkeys(email for c in grouped
                                    for email in [c["correo"], *c["correos_secundarios"]] if email))
        payload.append({"nombre": grouped[0]["nombre"], "correo": grouped[0]["correo"],
                        "telefonos": phones, "correos": emails})
    return f"""WITH source AS (
  SELECT * FROM jsonb_to_recordset({sql_json(payload)}) AS x(
    nombre text, correo text, telefonos text[], correos text[])
), changed AS (
  UPDATE public.clientes c SET
    telefono=COALESCE(c.telefono, s.telefonos[1]),
    telefonos_secundarios=ARRAY(
      SELECT DISTINCT phone FROM unnest(COALESCE(c.telefonos_secundarios, '{{}}'::text[])
        || COALESCE(s.telefonos, '{{}}'::text[])) phone
      WHERE phone<>COALESCE(c.telefono, s.telefonos[1])),
    correos_secundarios=ARRAY(
      SELECT DISTINCT email FROM unnest(COALESCE(c.correos_secundarios, '{{}}'::text[])
        || COALESCE(s.correos, '{{}}'::text[])) email
      WHERE lower(email)<>lower(c.correo))
  FROM source s WHERE c.dolibarr_id IS NOT NULL
    AND lower(c.nombre)=lower(s.nombre) AND lower(c.correo)=lower(s.correo)
  RETURNING c.id
)
SELECT count(*)::int AS updated FROM changed;"""


def reconciliation_sql(groups, operation):
    payload = [{"grupo": i, **group} for i, group in enumerate(groups)]
    common = f"""WITH source AS (
  SELECT * FROM jsonb_to_recordset({sql_json(payload)}) AS x(
    grupo integer, source_ids text[], telefonos text[], correos text[])
), expanded AS (
  SELECT s.grupo, unnest(s.source_ids) AS source_id,
    s.telefonos, s.correos FROM source s
), ranked AS (
  SELECT c.id, e.grupo, e.telefonos, e.correos,
    row_number() OVER (PARTITION BY e.grupo ORDER BY
      (c.rut IS NOT NULL) DESC, c.created_at ASC, c.id) AS rn,
    first_value(c.id) OVER (PARTITION BY e.grupo ORDER BY
      (c.rut IS NOT NULL) DESC, c.created_at ASC, c.id) AS keeper
  FROM expanded e JOIN public.clientes c ON c.dolibarr_id=e.source_id
)"""
    if operation == "preflight":
        body = """SELECT
  (SELECT count(*) FROM ranked WHERE rn>1)::int AS clientes_sobrantes,
  (SELECT count(*) FROM public.notas_actividad n JOIN ranked r ON n.cliente_id=r.id WHERE r.rn>1)::int AS notas_a_trasladar,
  (SELECT count(*) FROM public.oportunidades o JOIN ranked r ON o.cliente_id=r.id WHERE r.rn>1)::int AS oportunidades_vinculadas,
  (SELECT count(*) FROM public.cotizaciones q JOIN ranked r ON q.cliente_id=r.id WHERE r.rn>1)::int AS cotizaciones_vinculadas;"""
    elif operation == "contacts":
        body = """ , changed AS (
  UPDATE public.clientes c SET
    telefono=COALESCE(c.telefono, r.telefonos[1]),
    telefonos_secundarios=ARRAY(
      SELECT DISTINCT phone FROM unnest(COALESCE(c.telefonos_secundarios, '{}'::text[])
        || COALESCE(r.telefonos, '{}'::text[])) phone
      WHERE phone<>COALESCE(c.telefono,r.telefonos[1])),
    correo=COALESCE(c.correo,r.correos[1]),
    correos_secundarios=ARRAY(
      SELECT DISTINCT email FROM unnest(COALESCE(c.correos_secundarios, '{}'::text[])
        || COALESCE(r.correos, '{}'::text[])) email
      WHERE lower(email)<>lower(COALESCE(c.correo,r.correos[1]))),
    vendedor_historico_id=COALESCE(c.vendedor_historico_id,
      (SELECT c2.vendedor_historico_id FROM ranked r2
       JOIN public.clientes c2 ON c2.id=r2.id
       WHERE r2.grupo=r.grupo AND c2.vendedor_historico_id IS NOT NULL LIMIT 1))
  FROM ranked r WHERE r.rn=1 AND c.id=r.id
  RETURNING c.id
)
SELECT count(*)::int AS updated FROM changed;"""
    elif operation == "notes":
        body = """ , changed AS (
  UPDATE public.notas_actividad n SET cliente_id=r.keeper
  FROM ranked r WHERE r.rn>1 AND n.cliente_id=r.id
  RETURNING n.id
)
SELECT count(*)::int AS moved FROM changed;"""
    elif operation == "delete":
        body = """ , removed AS (
  DELETE FROM public.clientes c USING ranked r
  WHERE c.id=r.id AND r.rn>1
    AND NOT EXISTS (SELECT 1 FROM public.notas_actividad n WHERE n.cliente_id=c.id)
    AND NOT EXISTS (SELECT 1 FROM public.oportunidades o WHERE o.cliente_id=c.id)
    AND NOT EXISTS (SELECT 1 FROM public.cotizaciones q WHERE q.cliente_id=c.id)
  RETURNING c.id
)
SELECT count(*)::int AS removed FROM removed;"""
    else:
        raise ValueError(operation)
    return common + body


def notes_sql(notes):
    return f"""WITH source AS (
  SELECT * FROM jsonb_to_recordset({sql_json(notes)}) AS x(
    dolibarr_origen_id text, cliente_dolibarr_id text, contenido text)
), ins AS (
  INSERT INTO public.notas_actividad
    (cliente_id, usuario_id, contenido, tipo_actividad, autor_historico,
     dolibarr_origen_id, dolibarr_tipo)
  SELECT c.id, NULL, s.contenido, 'nota', NULL,
    s.dolibarr_origen_id, 'cliente'
  FROM source s JOIN public.clientes c ON c.dolibarr_id = s.cliente_dolibarr_id
  ON CONFLICT DO NOTHING RETURNING id
)
SELECT count(*)::int AS inserted FROM ins;"""


def supplier_sql(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[title_name(row["nombre"]).lower()].append(row)
    payload = []
    for grouped in groups.values():
        primary = max(grouped, key=lambda row: (
            row["rut_estado"] == "ok", bool(row["telefono"]), bool(row["correo"])))
        def first_value(field):
            return next((row[field].strip() for row in grouped if row[field].strip()), None)
        payload.append({
            "dolibarr_id": primary["dolibarr_id"], "nombre": title_name(primary["nombre"]),
            "rut": primary["rut"] if primary["rut_estado"] == "ok" else None,
            "telefono": first_value("telefono"), "correo": first_value("correo"),
            "direccion": first_value("direccion"), "comuna": first_value("comuna"),
            "region": first_value("region"),
        })
    return f"""WITH source AS (
  SELECT * FROM jsonb_to_recordset({sql_json(payload)}) AS x(
    dolibarr_id text, nombre text, rut text, telefono text, correo text,
    direccion text, comuna text, region text)
), ins AS (
  INSERT INTO public.proveedores
    (dolibarr_id, nombre, rut, telefono, correo, direccion, comuna, region)
  SELECT s.dolibarr_id, s.nombre, s.rut, s.telefono, s.correo,
    s.direccion, s.comuna, s.region FROM source s
  WHERE NOT EXISTS (SELECT 1 FROM public.proveedores p WHERE p.dolibarr_id = s.dolibarr_id
    OR (s.rut IS NOT NULL AND regexp_replace(lower(p.rut), '[^0-9k]', '', 'g') = regexp_replace(lower(s.rut), '[^0-9k]', '', 'g'))
    OR (s.rut IS NULL AND p.rut IS NULL AND lower(p.nombre)=lower(s.nombre)))
  ON CONFLICT DO NOTHING RETURNING id
)
SELECT count(*)::int AS inserted FROM ins;"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--suppliers", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=400)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True, mode=0o700)
    source_rows = read_csv(args.input)
    primary_rows = {row["dup_key"]: row for row in reversed(source_rows)}
    name_updates = []
    for row in primary_rows.values():
        old_name = title_name(row["nombre"])
        new_name = clean_client_name(old_name)
        if old_name != new_name:
            name_updates.append({"dolibarr_id": row["dolibarr_id"],
                                 "old_name": old_name, "new_name": new_name})
    clients, notes = make_clients(source_rows)
    clients, notes, cross_key_maps = merge_cross_key_duplicates(clients, notes)
    names = sorted({c["vendedor_origen"] for c in clients if c["vendedor_origen"]})
    (args.output / "sellers.sql").write_text(seller_sql(names), encoding="utf-8")
    for i in range(0, len(clients), args.batch_size):
        (args.output / f"clients-{i // args.batch_size:03d}.sql").write_text(
            client_sql(clients[i:i + args.batch_size]), encoding="utf-8")
    for i in range(0, len(name_updates), args.batch_size):
        (args.output / f"names-{i // args.batch_size:03d}.sql").write_text(
            name_updates_sql(name_updates[i:i + args.batch_size]), encoding="utf-8")
    (args.output / "notes.sql").write_text(notes_sql(notes), encoding="utf-8")
    (args.output / "duplicate-contacts.sql").write_text(cross_group_contacts_sql(clients), encoding="utf-8")
    (args.output / "cross-key-groups.json").write_text(
        json.dumps(cross_key_maps, ensure_ascii=False), encoding="utf-8")
    for operation in ("preflight", "contacts", "notes", "delete"):
        (args.output / f"reconcile-{operation}.sql").write_text(
            reconciliation_sql(cross_key_maps, operation), encoding="utf-8")
    (args.output / "suppliers.sql").write_text(supplier_sql(read_csv(args.suppliers)), encoding="utf-8")
    print(json.dumps({"clientes_unicos": len(clients), "nombres_a_limpiar": len(name_updates),
                      "lotes_nombres": (len(name_updates) + args.batch_size - 1) // args.batch_size,
                      "duplicados_adicionales":
                      sum(len(group["source_ids"]) - 1 for group in cross_key_maps), "notas": len(notes),
                      "vendedores": len(names), "lotes_clientes": (len(clients) + args.batch_size - 1) // args.batch_size},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
