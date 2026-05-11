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
    default: 'VegaMate - AI Wallpaper Gacha',
    template: '%s | VegaMate',
  },
  description: 'Collect stunning AI-generated wallpapers through daily gacha draws. Draw rare and legendary pieces for your collection.',
  keywords: ['wallpaper', 'AI art', 'gacha', 'collection', 'anime', 'illustration'],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VegaMate',
  },
  openGraph: {
    type: 'website',
    siteName: 'VegaMate',
    title: 'VegaMate - AI Wallpaper Gacha',
    description: 'Collect stunning AI-generated wallpapers through daily gacha draws.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VegaMate - AI Wallpaper Gacha',
    description: 'Collect stunning AI-generated wallpapers through daily gacha draws.',
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
