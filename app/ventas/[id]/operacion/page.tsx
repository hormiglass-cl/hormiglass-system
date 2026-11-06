import { redirect } from 'next/navigation';

// La ficha completa está archivada en app/ventas/_ficha-archivada (sin ruta) hasta nuevo aviso.
// Todo el trabajo de la oportunidad se hace desde el pipeline de ventas.
export default async function FichaOperacionRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/ventas?oportunidad=${encodeURIComponent(id)}&tab=operacion`);
}
