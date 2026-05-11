import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'VegaMate - Companion Gacha',
    template: '%s | VegaMate',
  },
  description: 'Chat with anime characters who remember you. Pull gacha for their exclusive photos. Male & female companions available.',
  keywords: ['AI companion', 'AI boyfriend', 'AI girlfriend', 'gacha', 'wallpaper', 'collection'],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VegaMate',
  },
  openGraph: {
    type: 'website',
    siteName: 'VegaMate',
    title: 'VegaMate - Companion Gacha',
    description: 'Chat with anime characters who remember you. Pull gacha for their exclusive photos.',
    url: 'https://vegamate.com',
    images: [
      {
        url: 'https://vegamate.com/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'VegaMate - Companion Gacha with Fantasy and Modern characters',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VegaMate - Companion Gacha',
    description: 'Chat with anime characters who remember you. Pull gacha for their exclusive photos.',
    images: ['https://vegamate.com/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: '#7C3AED',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-dvh bg-background font-sans text-foreground antialiased`}
      >
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
