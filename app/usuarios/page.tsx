'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function UsuariosPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/configuracion');
  }, [router]);

  return (
    <div className="p-8 text-center t-caption">
      Redirigiendo a Configuración...
    </div>
  );
}
