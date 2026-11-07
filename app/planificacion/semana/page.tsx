import { redirect } from 'next/navigation';

/** El programa semanal ahora vive en Calendarios → Órdenes de producción (vista Semana). */
export default function ProgramaSemanalLegacyRedirectPage() {
  redirect('/calendarios/general?contexto=ordenes&vista=semana');
}
