import { redirect } from 'next/navigation';

/* La asignación de OC vive ahora en la sección /asignaciones; esta ruta se conserva por enlaces antiguos. */
export default async function AsignacionesOrdenCompraRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/asignaciones?oc=${encodeURIComponent(id)}`);
}
