/* Dirección pública del sistema. En localhost se respeta el origen local para poder
   probar; en cualquier otro caso se usa el dominio de producción. */
const PRODUCTION_URL = 'https://portal.hormiglass.cl';

export function siteOrigin(): string {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return window.location.origin;
  }
  return PRODUCTION_URL;
}

/** Destino del botón "Ingresar código" del correo de recuperación / invitación. */
export function recoveryRedirectUrl(): string {
  return `${siteOrigin()}/auth/recuperar?paso=codigo`;
}
