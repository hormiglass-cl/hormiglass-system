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
      <body className="bg-[#f6f8fa] text-[#213343] min-h-screen antialiased font-sans" suppressHydrationWarning>
        <AuthProvider>
          <AuthGuard>
            <div className="flex min-h-screen bg-[#f6f8fa]">
              <Sidebar />
              <div className="flex-1 flex flex-col min-w-0 min-h-screen">
                <Navbar />
                <main className="flex-1 px-4 py-4 sm:px-5 md:px-6 w-full">
                  <div className="max-w-[1800px] mx-auto">
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
