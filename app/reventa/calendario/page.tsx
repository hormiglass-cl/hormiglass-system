import { redirect } from 'next/navigation';

interface CalendarioReventaLegacyRedirectProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CalendarioReventaLegacyRedirectPage({
  searchParams,
}: CalendarioReventaLegacyRedirectProps) {
  const resolved = await searchParams;
  const params = new URLSearchParams();
  params.set('contexto', 'reventa_logistica');

  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === 'string' && value) {
      params.set(key, value);
    } else if (Array.isArray(value) && value[0]) {
      params.set(key, value[0]);
    }
  }

  redirect(`/calendarios/general?${params.toString()}`);
}
