// Traduce cualquier error (Supabase, Postgres, red, JS) a un mensaje apto para el usuario.
// Nunca expone nombres de proveedores, tablas, códigos SQL ni detalles técnicos del backend.

const TECNICO = [
  /supabase/i, /postgres/i, /postgrest/i, /PGRST\d*/, /\bJWT\b/i, /\bSQL\b/i,
  /violates/i, /constraint/i, /relation\s/i, /column\s/i, /\bschema\b/i, /\bfunction\b/i,
  /syntax/i, /duplicate key/i, /null value/i, /invalid input/i, /row-level security/i,
  /permission denied/i, /\bbucket\b/i, /\bstorage\b/i, /\bfetch\b/i, /network/i, /\bRPC\b/i,
  /\buuid\b/i, /\bundefined\b/i, /\bnull\b/i, /exception/i, /\berror\b/i, /\{|\}/,
];

const TRADUCCIONES: Array<[RegExp, string]> = [
  [/duplicate key|already exists|already registered|ya se encuentra registrado/i, 'Ya existe un registro con esos datos.'],
  [/row-level security|permission denied|not authorized|unauthorized|403/i, 'No tienes permisos para realizar esta acción.'],
  [/JWT|session|token/i, 'Tu sesión expiró. Vuelve a iniciar sesión.'],
  [/failed to fetch|network|timeout|ECONN/i, 'No se pudo conectar con el servidor. Revisa tu conexión e intenta nuevamente.'],
  [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
  [/email not confirmed/i, 'Debes confirmar tu correo antes de ingresar.'],
  [/rate limit/i, 'Demasiados intentos. Espera unos minutos e intenta nuevamente.'],
  [/violates foreign key/i, 'El registro está relacionado con otros datos y no puede modificarse así.'],
  [/violates not-null|null value/i, 'Faltan campos obligatorios.'],
];

function extraerMensaje(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message ?? '');
  return '';
}

export function mensajeError(err: unknown, fallback = 'No se pudo completar la acción. Intenta nuevamente.'): string {
  const mensaje = extraerMensaje(err).trim();
  if (!mensaje) return fallback;
  for (const [patron, traduccion] of TRADUCCIONES) {
    if (patron.test(mensaje)) return traduccion;
  }
  // Mensajes de negocio propios (en español, sin detalles técnicos) se muestran tal cual.
  if (TECNICO.some((patron) => patron.test(mensaje))) return fallback;
  if (mensaje.length > 200) return fallback;
  return mensaje;
}
