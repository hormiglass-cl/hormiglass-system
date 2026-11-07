import { redirect } from 'next/navigation';

export default function PlanificacionLegacyRedirectPage() {
  redirect('/ventas?rama=produccion');
}
