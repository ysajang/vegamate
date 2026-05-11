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
    default: 'VegaMate - AI Companion Gacha',
    template: '%s | VegaMate',
  },
  description: 'Chat with stunning AI companions. Build intimacy. Pull gacha for their exclusive wallpapers. Male & female characters.',
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
    title: 'VegaMate - AI Companion Gacha',
    description: 'Chat with AI companions, collect their exclusive photos through gacha pulls.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VegaMate - AI Companion Gacha',
    description: 'Chat with AI companions, collect their exclusive photos through gacha pulls.',
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
