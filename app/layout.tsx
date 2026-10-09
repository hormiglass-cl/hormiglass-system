import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../lib/context/AuthContext';
import { AuthGuard } from '../components/AuthGuard';
import { AppShell } from '../components/AppShell';
import { FeedbackProvider } from '../components/ui/feedback';

export const metadata: Metadata = {
  title: 'Hormiglass CRM',
  description: 'CRM corporativo para Sociedad Comercial y de Transportes Valverde e Hijos Ltda.',
  icons: {
    icon: '/logo-favicon.jpeg',
    shortcut: '/logo-favicon.jpeg',
    apple: '/logo-favicon.jpeg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <AuthProvider>
          <AuthGuard>
            <FeedbackProvider>
              <AppShell>{children}</AppShell>
            </FeedbackProvider>
          </AuthGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
