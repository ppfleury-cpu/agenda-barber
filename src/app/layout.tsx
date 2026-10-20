import type { Metadata, Viewport } from 'next';
import './globals.css';
import { themeCss } from '@/lib/themes';

export const metadata: Metadata = {
  title: { default: 'Agenda Barber', template: '%s · Agenda Barber' },
  description: 'Agenda online para barbearias, salões e profissionais de beleza, com confirmação e lembrete no WhatsApp.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@600;700&display=swap"
        />
        <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
