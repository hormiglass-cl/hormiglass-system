import { redirect } from 'next/navigation';

/** Las carpetas societarias viven ahora en la ficha de cada empresa. */
export default async function AdministracionRedirect({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string; seccion?: string }>;
}) {
  const { empresa, seccion } = await searchParams;
  const slug = empresa === 'comercial' || empresa === 'transportes' || empresa === 'inmobiliaria' ? empresa : 'inmobiliaria';
  redirect(`/caja/configuracion/${slug}${seccion ? `?seccion=${encodeURIComponent(seccion)}` : ''}`);
}
