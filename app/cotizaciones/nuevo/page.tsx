import { redirect } from 'next/navigation';

interface NuevoCotizacionRedirectProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NuevaCotizacionRedirectPage({ searchParams }: NuevoCotizacionRedirectProps) {
  const resolved = await searchParams;
  const params = new URLSearchParams();
  params.set('nueva', '1');

  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === 'string' && value) {
      params.set(key, value);
    } else if (Array.isArray(value) && value[0]) {
      params.set(key, value[0]);
    }
  }

  redirect(`/cotizaciones?${params.toString()}`);
}
