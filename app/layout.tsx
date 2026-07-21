import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../lib/context/AuthContext';
import { AuthGuard } from '../components/AuthGuard';
import { Navbar } from '../components/Navbar';
import { Sidebar } from '../components/Sidebar';

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
      <body className="bg-white text-[#363636] min-h-screen antialiased font-sans" suppressHydrationWarning>
        <AuthProvider>
          <AuthGuard>
            <div className="flex min-h-screen bg-white">
              <Sidebar />
              <div className="flex-1 flex flex-col min-w-0 min-h-screen">
                <Navbar />
                <main className="flex-1 p-6 md:p-8 w-full">
                  <div className="max-w-7xl mx-auto">
                    {children}
                  </div>
                </main>
              </div>
            </div>
          </AuthGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
