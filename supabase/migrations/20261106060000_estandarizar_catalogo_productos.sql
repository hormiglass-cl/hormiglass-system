-- Estandarización del catálogo de productos e insumos.
-- Respaldo completo previo, limpieza de nombres (sin íconos/basura OCR ni medidas/color dentro del nombre),
-- campos separados (nombre, subcategoría, medidas, color, descripción) y código interno PROV-FAM-NNN.
-- El código del proveedor (Bottai, MACBAL) queda en codigo_proveedor. Las FK usan id, no se rompen.

CREATE TABLE IF NOT EXISTS public.catalogo_productos_respaldo_20261106 AS
  SELECT * FROM public.catalogo_productos;

CREATE TEMP TABLE _std (
  old_codigo text PRIMARY KEY,
  nombre text, familia text, subcategoria text, medidas text, color text, descripcion text,
  codigo_proveedor text, precio_cero boolean DEFAULT false
) ON COMMIT DROP;

-- ───────────── HG (fabricación propia): se conserva el código HG-XXX-NNN ─────────────
CREATE TEMP TABLE _hg (c text, n text, f text, s text, m text, col text, d text) ON COMMIT DROP;
INSERT INTO _hg VALUES
('HG-ADO-001','Adocreto','Adoquines','Adocreto','10 x 20 x 6 cm','Gris',NULL),
('HG-ADO-002','Adocreto','Adoquines','Adocreto','10 x 20 x 8 cm','Gris',NULL),
('HG-ADO-003','Adocreto','Adoquines','Adocreto','10 x 20 x 6 cm','A elección',NULL),
('HG-ADO-004','Adocreto','Adoquines','Adocreto','10 x 20 x 8 cm','A elección',NULL),
('HG-ADO-005','Adocreto onda','Adoquines','Adocreto',NULL,NULL,NULL),
('HG-ADO-006','Adocésped doble ECO','Adoquines','Adocésped','45,5 x 28 x 8 cm',NULL,NULL),
('HG-ADO-007','Adocésped gato','Adoquines','Adocésped','33 x 33 x 8 cm',NULL,NULL),
('HG-ADO-008','Adoquín piedra natural','Adoquines','Piedra natural','14 cm',NULL,'Largo libre'),
('HG-BAL-001','Baldosa MINVU 0-1','Baldosas','MINVU táctil','40 x 40 x 3,8 cm','Amarillo / Rojo',NULL),
('HG-BAL-002','Baldosa MINVU 0-1','Baldosas','MINVU táctil','40 x 40 x 3,8 cm','Negro / Verde',NULL),
('HG-BAR-001','Barda','Bardas',NULL,NULL,'Gris',NULL),
('HG-BAR-002','Barda imitación madera','Bardas',NULL,NULL,NULL,NULL),
('HG-BLO-001','Bloque','Bloques',NULL,'19 x 19 x 39 cm',NULL,NULL),
('HG-BLO-002','Bloque','Bloques',NULL,'14 x 19 x 39 cm',NULL,NULL),
('HG-BOR-001','Borde de piscina','Bordes de piscina',NULL,'50 x 50 x 5 cm',NULL,NULL),
('HG-CAM-001','Marco de cámara','Cámaras','Marco','60 x 60 cm',NULL,NULL),
('HG-CAM-002','Tapa de cámara','Cámaras','Tapa','60 x 60 cm',NULL,NULL),
('HG-CAM-003','Marco de cámara','Cámaras','Marco','40 x 40 cm',NULL,NULL),
('HG-CAM-004','Tapa de cámara','Cámaras','Tapa','40 x 40 cm',NULL,NULL),
('HG-CAM-005','Tapa de cámara redonda','Cámaras','Tapa','Ø 60 cm',NULL,NULL),
('HG-MAC-001','Macetero','Maceteros',NULL,'69 x 80 cm',NULL,NULL),
('HG-MAC-002','Macetero rectangular liso','Maceteros','Rectangular liso','40 x 40 cm',NULL,NULL),
('HG-MAC-003','Macetero cuadrado liso','Maceteros','Cuadrado liso','50 x 50 cm',NULL,NULL),
('HG-MAC-004','Macetero cuadrado liso','Maceteros','Cuadrado liso','40 x 40 x 40 cm',NULL,NULL),
('HG-MAC-005','Macetero con dibujo','Maceteros','Con dibujo','40 x 40 cm',NULL,NULL),
('HG-MAC-006','Macetero redondo','Maceteros','Redondo','40 x 40 cm',NULL,NULL),
('HG-MAC-007','Macetero plato hondo','Maceteros','Plato hondo','40 x 34 cm',NULL,NULL),
('HG-MAC-008','Macetero plato hondo','Maceteros','Plato hondo','40 x 40 cm',NULL,NULL),
('HG-MAC-009','Macetero plato hondo','Maceteros','Plato hondo','60 x 26 cm',NULL,NULL),
('HG-MAC-010','Macetero plato hondo','Maceteros','Plato hondo','80 x 25 cm',NULL,NULL),
('HG-MAC-011','Macetero plato hondo','Maceteros','Plato hondo','50 x 20 cm',NULL,NULL),
('HG-MAC-012','Macetero plato hondo','Maceteros','Plato hondo','40 x 18 cm',NULL,NULL),
('HG-MAC-013','Macetero plato hondo','Maceteros','Plato hondo','58 x 12 cm',NULL,NULL),
('HG-MAC-014','Macetero piramidal','Maceteros','Piramidal','40 x 60 cm',NULL,NULL),
('HG-PAS-001','Pastelón 1 a 2 colores','Pastelones',NULL,'40 x 40 cm',NULL,NULL),
('HG-PAS-002','Pastelón 1 a 2 colores','Pastelones',NULL,'50 x 50 cm',NULL,NULL),
('HG-PAS-003','Pastelón 3 colores','Pastelones',NULL,'40 x 40 cm',NULL,NULL),
('HG-PAS-004','Pastelón 3 colores','Pastelones',NULL,'50 x 50 x 4 cm',NULL,NULL),
('HG-PAS-005','Pastelón liso','Pastelones',NULL,'60 x 30 cm','Gris',NULL),
('HG-PAS-006','Durmiente pastelón','Pastelones','Durmiente','60 x 30 cm',NULL,'Con grano o color'),
('HG-PAS-007','Pastelón liso','Pastelones',NULL,'90 x 30 cm','Gris',NULL),
('HG-PAS-008','Durmiente pastelón liso','Pastelones','Durmiente','100 x 30 cm','Gris',NULL),
('HG-PAS-009','Durmiente pastelón 3 colores','Pastelones','Durmiente','50 x 50 cm',NULL,NULL),
('HG-PAS-010','Pastelón hexagonal','Pastelones',NULL,'30 x 30 x 4 cm',NULL,NULL),
('HG-PIG-001','Pigmento rojo y amarillo','Pigmentos',NULL,NULL,NULL,NULL),
('HG-PIG-002','Pigmento marrón, azul, verde y negro','Pigmentos',NULL,NULL,NULL,NULL),
('HG-PLA-001','Placa normal','Placas',NULL,'0,50 x 2,00 m, e 2,5 cm','Gris',NULL),
('HG-PLA-002','Placa','Placas',NULL,'0,60 x 2,00 m, e 3 cm',NULL,NULL),
('HG-PLA-003','Placa reforzada','Placas',NULL,'0,50 x 2,00 m, e 5 cm',NULL,NULL),
('HG-PLA-004','Placa reforzada','Placas',NULL,'0,50 x 2,00 m, e 4 cm',NULL,NULL),
('HG-PLA-005','Placa reforzada','Placas',NULL,'0,50 x 2,00 m, e 4,5 cm',NULL,NULL),
('HG-PLA-006','Placa','Placas',NULL,'0,50 x 2,00 m, e 3,3 cm',NULL,NULL),
('HG-PLA-007','Placa','Placas',NULL,'0,50 x 2,00 m, e 3 cm',NULL,NULL),
('HG-PLA-008','Placa normal','Placas',NULL,'0,60 x 1,00 m, e 2,5 cm',NULL,NULL),
('HG-PLA-009','Placa imitación madera','Placas','Imitación madera','1,83 x 0,15 m, e 4 cm',NULL,NULL),
('HG-PLA-010','Placa piedra laja','Placas','Piedra laja','0,50 x 2,00 m, e 2,5 cm',NULL,NULL),
('HG-PLA-011','Placa piedra laja','Placas','Piedra laja','0,60 x 2,00 m, e 2,5 cm',NULL,NULL),
('HG-POS-001','Poste','Postes',NULL,'2,30 m x 13 x 12 cm','Gris',NULL),
('HG-POS-002','Poste','Postes',NULL,'2,60 m x 13 x 12 cm','Gris',NULL),
('HG-POS-003','Poste','Postes',NULL,'3,00 m x 13 x 12 cm','Gris',NULL),
('HG-POS-004','Poste','Postes',NULL,'3,20 m x 13 x 12 cm','Gris',NULL),
('HG-POS-005','Poste con brazo','Postes','Con brazo','2,30 m x 13 x 12 cm','Gris',NULL),
('HG-POS-006','Poste con brazo','Postes','Con brazo','2,60 m x 13 x 12 cm','Gris',NULL),
('HG-POS-007','Poste con brazo','Postes','Con brazo','3,00 m x 13 x 12 cm','Gris',NULL),
('HG-POS-008','Poste con brazo','Postes','Con brazo','3,20 m x 13 x 12 cm','Gris',NULL),
('HG-POS-009','Poste imitación madera','Postes','Imitación madera','2,30 m x 13 x 13 cm',NULL,NULL),
('HG-POS-010','Poste imitación madera','Postes','Imitación madera','2,60 m x 13 x 13 cm',NULL,NULL),
('HG-POS-011','Poste imitación madera','Postes','Imitación madera','3,00 m x 13 x 13 cm',NULL,NULL),
('HG-ROM-001','Rompeola','Rompeolas',NULL,'40 x 40 x 4 cm',NULL,NULL),
('HG-ROM-002','Juego de esquineros de rompeola','Rompeolas',NULL,NULL,NULL,NULL),
('HG-SOL-001','Solerilla canto biselado','Soleras','Solerilla','1 m',NULL,NULL),
('HG-SOL-002','Solerilla canto redondo','Soleras','Solerilla','100 x 20 x 6 cm','Gris',NULL),
('HG-SOL-003','Solerilla canto redondo','Soleras','Solerilla','100 x 20 x 6 cm','A elección',NULL),
('HG-SOL-004','Solerilla canto redondo','Soleras','Solerilla','100 x 20 x 6 cm',NULL,'Terminación grano'),
('HG-SOL-005','Solerilla canto redondo','Soleras','Solerilla','50 x 20 x 6 cm','Gris',NULL),
('HG-SOL-006','Solera tipo A','Soleras','Solera','1 m x 30 x 16-12 cm',NULL,NULL),
('HG-SOL-007','Solera tipo C','Soleras','Solera','1 m x 25 x 10-8 cm',NULL,NULL);

INSERT INTO _std (old_codigo, nombre, familia, subcategoria, medidas, color, descripcion, codigo_proveedor)
SELECT c, n, f, s, m, col, d, NULL FROM _hg;

-- ───────────── ATR (Atrio Baldosas): ya vienen estructurados ─────────────
INSERT INTO _std (old_codigo, nombre, familia, subcategoria, medidas, color, descripcion, codigo_proveedor)
SELECT codigo,
  'Baldosa ' || lower(CASE subcategoria WHEN 'Pulido' THEN 'Pulida lisa' ELSE subcategoria END),
  'Baldosas',
  CASE subcategoria WHEN 'Pulido' THEN 'Pulida lisa' ELSE subcategoria END,
  regexp_replace(replace(medidas, 'x', ' x '), '$', ' cm'),
  replace(initcap(lower(color)), '/', ' / '),
  NULL, codigo_proveedor
FROM public.catalogo_productos WHERE codigo LIKE 'ATR-%';

-- ───────────── MAC (MACBAL): BMV/B|G <modelo> <NNxNN> <color> [grano] ─────────────
INSERT INTO _std (old_codigo, nombre, familia, subcategoria, medidas, color, descripcion, codigo_proveedor)
SELECT codigo,
  'Baldosa ' || CASE
    WHEN nombre ILIKE '%Mallorca%' THEN 'Mallorca'
    WHEN nombre ILIKE '%Sevilla Recta S/Bisel%' THEN 'Sevilla recta sin bisel'
    WHEN nombre ILIKE '%Sevilla Recta C/Bisel%' THEN 'Sevilla recta con bisel'
    WHEN nombre ILIKE '%Táctil 1%' THEN 'MINVU táctil 1 pulida'
    WHEN nombre ILIKE '%Táctil 0%' THEN 'MINVU táctil 0 pulida'
    ELSE 'lisa pulida' END,
  'Baldosas',
  CASE
    WHEN nombre ILIKE '%Mallorca%' THEN 'Mallorca'
    WHEN nombre ILIKE '%Sevilla%' THEN 'Sevilla'
    WHEN nombre ILIKE '%Táctil 1%' THEN 'MINVU táctil 1'
    WHEN nombre ILIKE '%Táctil 0%' THEN 'MINVU táctil 0'
    ELSE 'Lisa pulida' END,
  substring(nombre from '(\d\d)x\d\d') || ' x ' || substring(nombre from '\d\dx(\d\d)') || ' cm',
  CASE lower(trim(regexp_replace(regexp_replace(nombre, '^.*\d\dx\d\d\s+', ''), '\s+(Alpiste|Arroz)$', '', 'i')))
    WHEN 'negra' THEN 'Negro' WHEN 'amarilla' THEN 'Amarillo'
    ELSE initcap(lower(trim(regexp_replace(regexp_replace(nombre, '^.*\d\dx\d\d\s+', ''), '\s+(Alpiste|Arroz)$', '', 'i')))) END,
  concat_ws('. ',
    CASE WHEN nombre LIKE 'BMV/B%' THEN 'Base blanca' ELSE 'Base gris' END,
    CASE WHEN nombre ~* 'Alpiste$' THEN 'Grano alpiste' WHEN nombre ~* 'Arroz$' THEN 'Grano arroz' END),
  codigo_proveedor
FROM public.catalogo_productos WHERE codigo LIKE 'MAC-%';

-- ───────────── BOT (Bottai): lista OCR, corrección fila por fila ─────────────
-- (old_codigo, nombre, familia, subcategoria, medidas, color, descripcion)
CREATE TEMP TABLE _bot (c text, n text, f text, s text, m text, col text, d text) ON COMMIT DROP;
INSERT INTO _bot VALUES
-- Adoquines
('BOT-400401202','Adoquín Sigma RN 35 MPa','Adoquines','Sigma','12 x 24 x 8 cm','Gris',NULL),
('BOT-400403317','Adoquín Sigma RN 35 MPa','Adoquines','Sigma','12 x 24 x 6 cm','Amarillo',NULL),
('BOT-400406106','Adoquín Domino AR 45 MPa','Adoquines','Domino','10 x 20 x 8 cm','Rojo',NULL),
('BOT-400406112','Adoquín Domino RN 35 MPa','Adoquines','Domino','10 x 10 x 6 cm','Gris',NULL),
('BOT-400406138','Adoquín Domino RN 35 MPa','Adoquines','Domino','10 x 20 x 8 cm','Gris',NULL),
('BOT-400407111','Adoquín Domino RN 35 MPa','Adoquines','Domino','10 x 10 x 8 cm','Negro',NULL),
('BOT-400407119','Adoquín Domino RN 35 MPa','Adoquines','Domino','10 x 20 x 6 cm','Ocre',NULL),
('BOT-400407126','Adoquín Domino RN 35 MPa','Adoquines','Domino','10 x 20 x 8 cm','Ocre',NULL),
('BOT-400407140','Adoquín Domino RN 35 MPa','Adoquines','Domino','10 x 10 x 8 cm','Rojo',NULL),
('BOT-400407216','Adoquín Domino RN 35 MPa','Adoquines','Domino','10 x 20 x 6 cm','Negro',NULL),
('BOT-40040811','Adoquín Domino AR 55 MPa','Adoquines','Domino','10 x 20 x 8 cm','Gris','Absorción máx. 5 %'),
('BOT-400408119','Adoquín Domino AR 55 MPa','Adoquines','Domino','10 x 20 x 6 cm','Gris',NULL),
('BOT-400414505','Adoquín Ecopark RN 35 MPa','Adoquines','Ecopark','28 x 46 cm','Gris','7,63 unidades por m²'),
('BOT-400414506','Adoquín Ecopark RN 35 MPa','Adoquines','Ecopark','28 x 46 x 8 cm','Gris','Macho/hembra'),
('BOT-400414807','Adoquín Ecopark especial Bavaria','Adoquines','Ecopark','28 x 48 x 8 cm',NULL,'7,63 unidades por m²'),
('BOT-400416105','Adoquín Roma RN 35 MPa','Adoquines','Roma','e 8 cm','Gris',NULL),
('BOT-400416123','Adoquín Roma AR 45 MPa','Adoquines','Roma','e 8 cm','Gris',NULL),
('BOT-400416125','Adoquín Roma AR 45 MPa','Adoquines','Roma','e 10 cm','Gris',NULL),
('BOT-400416126','Adoquín Roma RN 35 MPa','Adoquines','Roma','e 10 cm','Gris',NULL),
('BOT-400416130','Adoquín Roma RN 35 MPa','Adoquines','Roma','e 10 cm','Ocre',NULL),
('BOT-400416131','Adoquín Roma RN 35 MPa','Adoquines','Roma','e 10 cm','Rojo',NULL),
('BOT-400416138','Adoquín Roma AR 45 MPa','Adoquines','Roma','e 8 cm','Gris',NULL),
('BOT-400416128','Adoquín Roma AR 55 MPa','Adoquines','Roma','e 10 cm','Gris',NULL),
-- Barreras
('BOT-200211303','Barrera caminera doble desvío tipo F','Barreras','Doble','h 0,81 x L 3 m',NULL,'Macho/hembra'),
('BOT-200211312','Barrera caminera simple desvío tipo F','Barreras','Simple','h 0,81 x L 3 m',NULL,'Macho/hembra'),
('BOT-200211400','Barrera caminera doble MOP tipo F','Barreras','Doble','h 0,81 x L 3 m',NULL,NULL),
('BOT-200211817','Barrera caminera simple MOP tipo F','Barreras','Simple','h 0,81 x L 3 m',NULL,NULL),
-- Bloques
('BOT-300301131','Bloque liso','Bloques','Liso','10 x 20 x 40 cm','Gris',NULL),
('BOT-300302132','Enchape estriado','Bloques','Estriado','5 x 20 x 40 cm','Gris',NULL),
('BOT-300302154','Bloque estriado','Bloques','Estriado','20 x 20 x 20 cm','Gris',NULL),
('BOT-300303135','Bloque piedra esquinero','Bloques','Piedra','20 x 20 x 40 cm','Gris',NULL),
('BOT-300303155','Bloque piedra','Bloques','Piedra','20 x 20 x 20 cm','Gris',NULL),
('BOT-300303159','Tapamesa','Bloques',NULL,NULL,'Gris',NULL),
('BOT-300303175','Bloque piedra esquinero','Bloques','Piedra','20 x 20 x 20 cm','Gris',NULL),
('BOT-300305701','Enchape estriado','Bloques','Estriado','5 x 20 x 40 cm','Ocre',NULL),
('BOT-300306104','Bloque piedra','Bloques','Piedra','20 x 20 x 40 cm','Rojo',NULL),
('BOT-300306108','Bloque piedra esquinero','Bloques','Piedra','20 x 20 x 40 cm','Ocre',NULL),
('BOT-300306231','Bloque piedra','Bloques','Piedra','15 x 20 x 40 cm','Gris',NULL),
('BOT-300308130','Bloque piedra esquinero','Bloques','Piedra','20 x 20 x 40 cm','Rojo',NULL),
('BOT-300308282','Bloque piedra','Bloques','Piedra','15 x 20 x 40 cm','Ocre',NULL),
('BOT-300308706','Enchape piedra','Bloques','Piedra','5 x 20 x 40 cm','Ocre',NULL),
('BOT-300802128','Bloque estriado esquinero','Bloques','Estriado','20 x 20 x 20 cm','Gris',NULL),
-- Cajones (ancho x alto x largo; Hr = altura de relleno)
('BOT-1650701028','Cajón clase B','Cajones','Clase B','1,5 x 2 x 2 m',NULL,'Altura de relleno (Hr): 0,6 - 2 m'),
('BOT-50701073','Cajón clase B','Cajones','Clase B','1,2 x 1,2 x 2 m',NULL,'Altura de relleno (Hr): 2 - 4 m'),
('BOT-650701012','Cajón clase B','Cajones','Clase B','1 x 2 x 2 m',NULL,'Altura de relleno (Hr): 0 - 0,6 m'),
('BOT-650701013','Cajón clase B','Cajones','Clase B','1 x 2 x 2 m',NULL,'Altura de relleno (Hr): 0,8 - 2 m'),
('BOT-650701014','Cajón clase B','Cajones','Clase B','1 x 2 x 2 m',NULL,'Altura de relleno (Hr): 2 - 4 m'),
('BOT-650701018','Cajón clase B','Cajones','Clase B','1 x 2 x 2 m',NULL,'Altura de relleno (Hr): 6 - 8 m'),
('BOT-650701018-2','Cajón clase B','Cajones','Clase B','2 x 1 x 2 m',NULL,'Altura de relleno (Hr): 0,6 - 2 m'),
('BOT-650701019','Cajón clase B','Cajones','Clase B','2 x 1 x 2 m',NULL,'Altura de relleno (Hr): 2 - 4 m'),
('BOT-650701023','Cajón clase B','Cajones','Clase B','2 x 1,5 x 2 m',NULL,'Altura de relleno (Hr): 0,6 - 2 m'),
('BOT-650701024','Cajón clase B','Cajones','Clase B','2 x 1,5 x 2 m',NULL,'Altura de relleno (Hr): 2 - 4 m'),
('BOT-650701025','Cajón clase B','Cajones','Clase B','2 x 1,5 x 2 m',NULL,'Altura de relleno (Hr): 4 - 6 m'),
('BOT-650701028','Cajón clase B','Cajones','Clase B','2 x 1,5 x 2 m',NULL,'Altura de relleno (Hr): 6 - 8 m'),
('BOT-650701029','Cajón clase B','Cajones','Clase B','1,5 x 2 x 2 m',NULL,'Altura de relleno (Hr): 2 - 4 m'),
('BOT-650701030','Cajón clase B','Cajones','Clase B','1,5 x 2 x 2 m',NULL,'Altura de relleno (Hr): 4 - 6 m'),
('BOT-650701032','Cajón clase B','Cajones','Clase B','2 x 2 x 2 m',NULL,'Altura de relleno (Hr): 0 - 0,8 m'),
('BOT-650701035','Cajón clase B','Cajones','Clase B','2 x 2 x 2 m',NULL,'Altura de relleno (Hr): 4 - 6 m'),
('BOT-650701063','Cajón clase B','Cajones','Clase B','1,5 x 1,5 x 2 m',NULL,'Altura de relleno (Hr): 0 - 0,6 m'),
('BOT-650701064','Cajón clase B','Cajones','Clase B','1,5 x 1,5 x 2 m',NULL,'Altura de relleno (Hr): 0,6 - 2 m'),
('BOT-650701068','Cajón clase B','Cajones','Clase B','1,5 x 1 x 2 m',NULL,'Altura de relleno (Hr): 0 - 0,8 m'),
('BOT-650701069','Cajón clase B','Cajones','Clase B','1,5 x 1 x 2 m',NULL,'Altura de relleno (Hr): 0,6 - 2 m'),
('BOT-650701070','Cajón clase B','Cajones','Clase B','1,5 x 1 x 2 m',NULL,'Altura de relleno (Hr): 2 - 4 m'),
('BOT-650701071','Cajón clase B','Cajones','Clase B','1,2 x 1,2 x 2 m',NULL,'Altura de relleno (Hr): 0 - 0,6 m'),
('BOT-650701072','Cajón clase B','Cajones','Clase B','1,2 x 1,2 x 2 m',NULL,'Altura de relleno (Hr): 0,6 - 2 m'),
('BOT-650701074','Cajón clase B','Cajones','Clase B','1,2 x 1,2 x 2 m',NULL,'Altura de relleno (Hr): 4 - 6 m'),
('BOT-650701075','Cajón clase B','Cajones','Clase B','1,2 x 1,2 x 2 m',NULL,'Altura de relleno (Hr): 6 - 8 m'),
('BOT-650701076','Cajón clase A','Cajones','Clase A','1 x 1 x 2,5 m',NULL,'Altura de relleno (Hr): 0 - 0,6 m'),
('BOT-650701077','Cajón clase A','Cajones','Clase A','1 x 1 x 2,5 m',NULL,'Altura de relleno (Hr): 0,6 - 2 m'),
('BOT-650701085','Cajón clase B','Cajones','Clase B','1,5 x 1,5 x 2 m',NULL,'Altura de relleno (Hr): 2 - 4 m'),
('BOT-680701031','Cajón clase B','Cajones','Clase B','1,5 x 2 x 2 m',NULL,'Altura de relleno (Hr): 6 - 8 m'),
('BOT-680701033','Cajón clase B','Cajones','Clase B','2 x 2 x 2 m',NULL,'Altura de relleno (Hr): 0,6 - 2 m'),
('BOT-850701066','Cajón clase B','Cajones','Clase B','1,5 x 1,5 x 2 m',NULL,'Altura de relleno (Hr): 4 - 6 m'),
('BOT-850701067','Cajón clase B','Cajones','Clase B','1,5 x 1,5 x 2 m',NULL,'Altura de relleno (Hr): 6 - 8 m'),
('BOT-8507071020','Cajón clase B','Cajones','Clase B','2 x 1 x 2 m',NULL,'Altura de relleno (Hr): 4 - 6 m'),
-- Cámaras
('BOT-200208246','Cubierta redonda','Cámaras','Cubierta','Ø 1000 mm',NULL,NULL),
('BOT-200209201','Cubierta de cámara','Cámaras','Cubierta','40 x 40 cm',NULL,NULL),
('BOT-200209202','Marco de cámara','Cámaras','Marco','40 x 40 cm',NULL,NULL),
('BOT-200209204','Marco de cámara','Cámaras','Marco','50 x 80 cm',NULL,NULL),
('BOT-200209205','Cubierta de cámara','Cámaras','Cubierta','60 x 60 cm',NULL,NULL),
('BOT-200209206','Marco de cámara','Cámaras','Marco','60 x 60 cm',NULL,NULL),
('BOT-200209207','Cubierta reforzada','Cámaras','Cubierta','60 x 60 cm',NULL,NULL),
('BOT-200209208','Marco reforzado','Cámaras','Marco','60 x 60 cm',NULL,NULL),
('BOT-200209209','Cubierta de cámara redonda','Cámaras','Cubierta','Ø 60 cm',NULL,NULL),
('BOT-200223223','Tapa de cámara desgrasadora','Cámaras','Tapa',NULL,NULL,NULL),
('BOT-200223226','Cámara desgrasadora sin fondo','Cámaras','Cámara',NULL,NULL,NULL),
('BOT-200223231','Cámara eléctrica','Cámaras','Cámara','60 x 60 x 100 cm',NULL,NULL),
('BOT-200223232','Cámara eléctrica','Cámaras','Cámara','80 x 80 x 100 cm',NULL,NULL),
('BOT-200223234','Tapa de cámara eléctrica','Cámaras','Tapa','80 x 80 cm',NULL,NULL),
('BOT-200223235','Tapa de cámara eléctrica','Cámaras','Tapa','60 x 80 cm',NULL,NULL),
('BOT-250221210','Módulo de cámara','Cámaras','Módulo','0,6 x 0,3 m',NULL,NULL),
('BOT-250221211','Módulo de cámara','Cámaras','Módulo','0,6 x 0,6 m',NULL,NULL),
('BOT-250221212','Módulo de cámara','Cámaras','Módulo','0,6 x 0,1 m',NULL,NULL),
('BOT-250221218','Radier base','Cámaras','Radier',NULL,NULL,NULL),
('BOT-250221219','Módulo de cámara','Cámaras','Módulo','0,8 x 1 m',NULL,NULL),
('BOT-250221220','Módulo de cámara','Cámaras','Módulo','0,8 x 0,6 m',NULL,NULL),
('BOT-250221223','Anillo reductor para módulo 800 mm','Cámaras','Anillo','600 x 800 mm',NULL,NULL),
('BOT-250222101','Chimenea','Cámaras','Chimenea','Ø 600 mm x 0,6 m',NULL,NULL),
('BOT-250222104','Cuerpo base','Cámaras','Cuerpo base','Ø 1200 mm x 1 m',NULL,NULL),
('BOT-250222106','Cono','Cámaras','Cono','1800 x 1200 mm x 0,6 m',NULL,NULL),
('BOT-250222107','Cuerpo base','Cámaras','Cuerpo base','Ø 1800 mm x 0,6 m',NULL,NULL),
('BOT-250222118','Cuerpo base V30','Cámaras','Cuerpo base','Ø 1200 mm x 0,6 m',NULL,NULL),
('BOT-250222125','Cuerpo base','Cámaras','Cuerpo base','Ø 1800 mm x 0,6 m',NULL,NULL),
('BOT-250225341','Marco de cámara eléctrica subterránea','Cámaras','Marco',NULL,NULL,NULL),
('BOT-260222103','Cono','Cámaras','Cono','1200 x 600 mm x 0,6 m',NULL,NULL),
('BOT-260222105','Cuerpo base','Cámaras','Cuerpo base','Ø 1200 mm x 0,6 m',NULL,NULL),
('BOT-280221221','Módulo de cámara','Cámaras','Módulo','0,8 x 0,3 m',NULL,NULL),
-- Canaletas
('BOT-200212102','Canaleta','Canaletas','Canaleta','100 x 20 x 20 cm',NULL,NULL),
('BOT-200212108','Tapa de canaleta','Canaletas','Tapa','50 x 37 x 40 cm',NULL,NULL),
('BOT-200212109','Canaleta','Canaletas','Canaleta','100 x 10 x 10 cm',NULL,NULL),
('BOT-200212160','Tapa de canaleta ranurada','Canaletas','Tapa','100 x 10 x 10 cm',NULL,NULL),
('BOT-200212185','Canaleta','Canaletas','Canaleta','750 x 440 x 1000 mm',NULL,NULL),
('BOT-200212186','Tapa de canaleta','Canaletas','Tapa','760 x 250 x 50 mm',NULL,NULL),
('BOT-200212187','Canaleta','Canaletas','Canaleta','510 x 440 x 1000 mm',NULL,NULL),
('BOT-200212188','Tapa de canaleta','Canaletas','Tapa','470 x 250 x 60 mm',NULL,NULL),
-- Muros
('BOT-200211159','Muro camellón macho/hembra','Muros','Camellón','h 2 m x avance 2 m',NULL,NULL),
('BOT-200211183','Muro tipo Y','Muros','Tipo Y','6 x 1 m',NULL,NULL),
('BOT-2002141158','Muro camellón macho/hembra','Muros','Camellón','h 2 m x avance 1 m',NULL,NULL),
-- Otros vibrados
('BOT-250225309','Caseta guardamedidor con escotilla EMOS','Otros vibrados','Guardamedidor',NULL,NULL,NULL),
('BOT-250225381','Cámara guardamedidor Aguas Andinas','Otros vibrados','Guardamedidor',NULL,NULL,NULL),
('BOT-250225382','Guardallaves Aguas Andinas','Otros vibrados','Guardallaves',NULL,NULL,NULL),
('BOT-250225384','Tapa guardallaves Aguas Andinas','Otros vibrados','Guardallaves',NULL,NULL,NULL),
('BOT-280225308','Guardallave','Otros vibrados','Guardallaves','125 mm, h 15',NULL,NULL),
-- Pastelones
('BOT-200201502','Pastelón hexagonal','Pastelones','Hexagonal','37 x 32 x 4 cm','Gris',NULL),
('BOT-200201503','Pastelón hexagonal','Pastelones','Hexagonal','37 x 16 x 4 cm','Gris',NULL),
('BOT-200201550','Pastelón','Pastelones',NULL,'50 x 50 x 4 cm','Gris',NULL),
('BOT-200201558','Pastelón Zenith','Pastelones','Zenith','20 x 40 x 4 cm','Gris',NULL),
('BOT-200201581','Pastelón OCEM con diseño','Pastelones','Cuadro grande','40 x 40 x 4 cm','Gris',NULL),
('BOT-200201583','Pastelón OCEM con diseño','Pastelones','Curvas esquina','40 x 40 x 4 cm','Gris',NULL),
('BOT-200201584','Pastelón OCEM con diseño','Pastelones','Línea gruesa','40 x 40 x 4 cm','Gris',NULL),
('BOT-200201585','Pastelón OCEM con diseño','Pastelones','Línea delgada','40 x 40 x 4 cm','Gris',NULL),
('BOT-200201587','Pastelón OCEM con diseño','Pastelones','Puntos','40 x 40 x 4 cm','Gris',NULL),
('BOT-200201588','Pastelón OCEM con diseño','Pastelones','Piedra cuadro','40 x 40 x 4 cm','Gris',NULL),
('BOT-200201588-2','Pastelón OCEM con diseño','Pastelones','Relieve piedra','40 x 40 x 4 cm','Gris',NULL),
('BOT-200201590','Pastelón OCEM con diseño','Pastelones','Sol abanico','40 x 40 x 4 cm','Gris',NULL),
('BOT-200202025','Pastelón','Pastelones',NULL,'80 x 30 x 4 cm','Rojo',NULL),
-- Soleras y solerillas
('BOT-200208104','Solera recta tipo B','Soleras','Solera','50 x 25 x 12 cm',NULL,NULL),
('BOT-200208105','Solera curva SERVIU','Soleras','Solera','Radio 6 m',NULL,NULL),
('BOT-200208110','Solera Alameda','Soleras','Solera','250 x 120 x 600 mm',NULL,NULL),
('BOT-200208118','Cabeza de solera','Soleras','Cabeza',NULL,NULL,NULL),
('BOT-200208125','Solera recta tipo C','Soleras','Solera','100 x 25 x 10 cm',NULL,NULL),
('BOT-200208255','Solera recta tipo C Zenith','Soleras','Solera','100 x 25 x 10 cm',NULL,NULL),
('BOT-200208256','Solera recta tipo C MOP Zenith','Soleras','Solera','100 x 25 x 10 cm',NULL,NULL),
('BOT-200208259','Solera recta tipo C Zenith','Soleras','Solera','50 x 25 x 10 cm',NULL,NULL),
('BOT-200208308','Solera recta tipo A SERVIU Zenith','Soleras','Solera','1 m',NULL,NULL),
('BOT-200208311','Solerón con 2 biseles Zenith','Soleras','Solerón','1 x 0,3 x 0,4 m',NULL,NULL),
('BOT-200208313','Solera Kassel K150','Soleras','Solera','50 cm',NULL,NULL),
('BOT-200208865','Solera zarpa con redondeo Zenith','Soleras','Solera','50 x 45 cm',NULL,NULL),
('BOT-200208866','Solera zarpa con redondeo Zenith','Soleras','Solera','50 x 45 cm','Ocre',NULL),
('BOT-200208205','Solerilla','Soleras','Solerilla',NULL,NULL,NULL),
('BOT-200208254','Solerilla con redondeo macho/hembra Zenith','Soleras','Solerilla','100 x 20 x 6 cm',NULL,NULL),
('BOT-200208258','Solerilla alta resistencia con redondeo macho/hembra Zenith','Soleras','Solerilla','1 m',NULL,NULL),
('BOT-200208264','Solerilla con redondeo macho/hembra Zenith','Soleras','Solerilla','0,5 m',NULL,NULL),
('BOT-200208265','Solerilla con bisel macho/hembra Zenith','Soleras','Solerilla','0,5 m',NULL,NULL),
-- Tubos
('BOT-00501719','Tubo AR B/P J/M','Tubos','Armado','Ø 800 mm x 2,5 m',NULL,NULL),
('BOT-00502216','Tubo AR B/P JG','Tubos','Armado','Ø 1000 mm x 2,5 m',NULL,NULL),
('BOT-100101103','Tubo circular CTE','Tubos','Circular CTE','Ø 150 mm x 1 m',NULL,NULL),
('BOT-100101105','Tubo circular CTE','Tubos','Circular CTE','Ø 200 mm x 1 m',NULL,NULL),
('BOT-100101106','Tubo circular CTE','Tubos','Circular CTE','Ø 250 mm x 1 m',NULL,NULL),
('BOT-100101108','Tubo circular CTE','Tubos','Circular CTE','Ø 350 mm x 1 m',NULL,NULL),
('BOT-100101109','Tubo circular CTE','Tubos','Circular CTE','Ø 400 mm x 1 m',NULL,NULL),
('BOT-100101110','Tubo circular CTE','Tubos','Circular CTE','Ø 450 mm x 1 m',NULL,NULL),
('BOT-100101141','Tubo circular CTE','Tubos','Circular CTE','Ø 400 mm x 0,6 m',NULL,NULL),
('BOT-100102211','Tubo circular CTE sin cabeza','Tubos','Circular CTE','Ø 500 mm x 1 m',NULL,NULL),
('BOT-100102214','Tubo circular CTE sin cabeza','Tubos','Circular CTE','Ø 800 mm x 1 m',NULL,NULL),
('BOT-100102216','Tubo circular CTE sin cabeza','Tubos','Circular CTE','Ø 1600 mm x 1 m',NULL,NULL),
('BOT-100102217','Tubo circular CTE sin cabeza','Tubos','Circular CTE','Ø 1200 mm x 1 m',NULL,NULL),
('BOT-400102212','Tubo circular CTE sin cabeza','Tubos','Circular CTE','Ø 600 mm x 1 m',NULL,NULL),
('BOT-100106502','Tubo circular AR/P M','Tubos','Armado','Ø 500 mm x 2 m',NULL,NULL),
('BOT-100107601','Tubo circular AR/P G','Tubos','Armado','Ø 400 mm x 2 m',NULL,NULL),
('BOT-100107602','Tubo circular AR/P G','Tubos','Armado','Ø 500 mm x 2 m',NULL,NULL),
('BOT-100108709','Tubo circular CTE perforado','Tubos','Perforado','Ø 1000 mm x 1 m',NULL,NULL),
('BOT-100108710','Tubo circular CTE perforado','Tubos','Perforado','Ø 1200 mm x 1 m',NULL,NULL),
('BOT-250225319','Tapa de tubo','Tubos','Tapa','Ø 300 mm, e 7 cm',NULL,NULL),
('BOT-250225366','Tapa de tubo','Tubos','Tapa','Ø 400 mm',NULL,NULL),
('BOT-500501116','Tubo AR B/P JG','Tubos','Armado','Ø 1000 mm x 2,5 m',NULL,NULL),
('BOT-500502278','Tubo AR B/P JG','Tubos','Armado','Ø 1200 mm x 2,5 m',NULL,NULL),
('BOT-600502212','Tubo AR B/P JG','Tubos','Armado','Ø 600 mm x 2,5 m',NULL,NULL),
('BOT-800802219','Tubo AR B/P JG','Tubos','Armado','Ø 800 mm x 2,5 m',NULL,NULL);

INSERT INTO _std (old_codigo, nombre, familia, subcategoria, medidas, color, descripcion, codigo_proveedor, precio_cero)
SELECT b.c, b.n, b.f, b.s, b.m, b.col, b.d,
       p.codigo_proveedor,
       (p.precio_referencia < 100
        OR (b.f = 'Cajones' AND p.precio_referencia < 100000)
        OR b.c IN ('BOT-100102216','BOT-400416128','BOT-650701077'))
FROM _bot b JOIN public.catalogo_productos p ON p.codigo = b.c;

-- Sanidad: todo producto no-DEMO debe quedar cubierto
DO $$
DECLARE faltan int;
BEGIN
  SELECT count(*) INTO faltan FROM public.catalogo_productos p
   WHERE p.codigo NOT LIKE 'DEMO-%' AND NOT EXISTS (SELECT 1 FROM _std s WHERE s.old_codigo = p.codigo);
  IF faltan > 0 THEN RAISE EXCEPTION 'Quedan % productos sin regla de limpieza', faltan; END IF;
END $$;

-- ───────────── Aplicación: nuevo código PROV-FAM-NNN ─────────────
CREATE TEMP TABLE _num ON COMMIT DROP AS
SELECT s.old_codigo,
  CASE WHEN s.old_codigo LIKE 'HG-%' THEN s.old_codigo
  ELSE pref || '-' || fam || '-' || lpad(row_number() OVER (PARTITION BY pref, fam ORDER BY s.subcategoria NULLS FIRST, s.nombre, s.medidas NULLS FIRST, s.color NULLS FIRST, s.old_codigo)::text, 3, '0')
  END AS nuevo
FROM (
  SELECT s.*, split_part(s.old_codigo, '-', 1) AS pref,
    CASE s.familia
      WHEN 'Adoquines' THEN 'ADO' WHEN 'Baldosas' THEN 'BAL' WHEN 'Bardas' THEN 'BAR' WHEN 'Barreras' THEN 'BRR'
      WHEN 'Bloques' THEN 'BLO' WHEN 'Bordes de piscina' THEN 'BOR' WHEN 'Cajones' THEN 'CAJ' WHEN 'Cámaras' THEN 'CAM'
      WHEN 'Canaletas' THEN 'CAN' WHEN 'Maceteros' THEN 'MAC' WHEN 'Muros' THEN 'MUR' WHEN 'Otros vibrados' THEN 'OTV'
      WHEN 'Pastelones' THEN 'PAS' WHEN 'Pigmentos' THEN 'PIG' WHEN 'Placas' THEN 'PLA' WHEN 'Postes' THEN 'POS'
      WHEN 'Rompeolas' THEN 'ROM' WHEN 'Soleras' THEN 'SOL' WHEN 'Tubos' THEN 'TUB' ELSE 'OTR' END AS fam
  FROM _std s
) s;

-- Mapa id -> código nuevo (antes de tocar nada)
CREATE TEMP TABLE _map ON COMMIT DROP AS
SELECT p.id, p.codigo AS old_codigo, n.nuevo FROM public.catalogo_productos p JOIN _num n ON n.old_codigo = p.codigo;

-- Evita choques temporales con el UNIQUE(codigo)
UPDATE public.catalogo_productos p SET codigo = 'TMP-' || p.id::text
FROM _map m WHERE m.id = p.id AND m.nuevo <> m.old_codigo;

UPDATE public.catalogo_productos p SET
  codigo = m.nuevo,
  nombre = s.nombre,
  familia = s.familia,
  subcategoria = s.subcategoria,
  medidas = s.medidas,
  color = s.color,
  descripcion = s.descripcion,
  codigo_proveedor = CASE WHEN s.old_codigo LIKE 'HG-%' THEN NULL ELSE s.codigo_proveedor END,
  precio_referencia = CASE WHEN s.precio_cero THEN 0 ELSE p.precio_referencia END,
  observaciones = CASE
    WHEN s.old_codigo LIKE 'BOT-%' THEN
      'Lista Bottai transcrita por OCR: verificar nombre, medidas y precio.' ||
      CASE WHEN s.precio_cero THEN ' Precio ilegible en la lista: ingresar manualmente.' ELSE '' END
    ELSE p.observaciones END,
  requiere_revision = (s.old_codigo LIKE 'BOT-%'),
  unidad = CASE WHEN p.unidad IN ('und','unidad') THEN 'unidad' ELSE p.unidad END,
  origen = CASE WHEN s.old_codigo LIKE 'HG-%' THEN 'fabricacion_propia' ELSE 'reventa' END
FROM _map m JOIN _std s ON s.old_codigo = m.old_codigo
WHERE p.id = m.id;

COMMENT ON TABLE public.catalogo_productos_respaldo_20261106 IS
  'Copia previa a la estandarización del catálogo (2026-11-06). Se puede eliminar cuando se valide el nuevo catálogo.';
