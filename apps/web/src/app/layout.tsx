import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { GlobalErrorInit } from '@/components/GlobalErrorInit';
import { ErrorBoundary }   from '@/components/ErrorBoundary';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Alphabot Dashboard',
  description: 'WhatsApp Business Automation Suite',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <GlobalErrorInit />
        <ErrorBoundary name="RootLayout">
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
