import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// Destino de los links de invitación/recuperación de contraseña que envía
// Supabase Auth. Intercambia el código PKCE por una sesión y manda al
// usuario a definir su contraseña.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/auth/actualizar-password';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link_invalido`);
}
