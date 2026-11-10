# Importación de Dolibarr — 10 de noviembre de 2026

Proyecto Supabase: `jvenwcupdllcqbxixcuo` (`hormiglass-system`).

## Resultado verificado

| Concepto | Registros |
| --- | ---: |
| Filas de empresas/personas en el export original | 21.805 |
| Clientes únicos importados | 20.303 |
| Clientes importados sin RUT | 19.033 |
| Proveedores exclusivos importados | 123 |
| Notas históricas importadas | 213 |
| Vendedores de origen referenciados | 23 |
| Fichas nuevas en RR. HH. sin cuenta CRM | 21 |

Los otros dos vendedores ya tenían ficha en RR. HH. Los nombres de clientes,
proveedores y vendedores importados se normalizaron con mayúscula inicial.
No se creó ninguna cuenta de acceso al CRM.

Los duplicados se agruparon por RUT válido o por nombre junto con correo o
teléfono, siempre que no hubiera dos RUT válidos distintos. Se conservaron los
teléfonos y correos alternativos. La comprobación final dio cero duplicados
entre los clientes importados según esas tres reglas. La importación se puede
repetir: la migración crea claves únicas de origen y el script omite fichas ya
presentes. Una segunda ejecución de lotes de muestra, notas y proveedores
intentó insertar cero filas.

Las notas históricas figuran como «Sistema» porque el export no trae un campo
de autor ni una fecha de escritura confiable. El contenido conserva cualquier
nombre incluido en el texto. Se marcan como notas de Dolibarr para poder
identificarlas en una futura revisión de privacidad.

## Datos que siguen fuera del CRM

- 391 contactos en el segundo export; 390 están asociados a clientes. No existe aún una
  tabla ni interfaz de contactos empresariales y no se autorizó su creación.
- 24 registros del primer export marcados como ni cliente ni proveedor.
- RUT inválidos, teléfonos inválidos y correos mal formados del archivo fuente.

Los CSV, los lotes SQL generados y los datos personales permanecen fuera del
repositorio. El código de preparación está en `scripts/prepare-dolibarr-import.py`
y la migración de esquema en `supabase/migrations/`.
