import { redirect } from 'next/navigation';

export default function ReventaLegacyRedirectPage() {
  redirect('/ventas?rama=reventa');
}
