import { redirect } from 'next/navigation';

// Los recordatorios ahora se gestionan en "Tasks y recordatorios" dentro de cada sociedad.
export default function RecordatoriosPage() {
  redirect('/administracion');
}
