import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { Analytics } from '@vercel/analytics/next';
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
  description: 'Chat with AI companions who send you selfies on their own. Not on demand — they surprise you. Collect rare expressions and outfits.',
  keywords: ['AI companion', 'AI boyfriend', 'AI girlfriend', 'gacha', 'selfie', 'anime companion'],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VegaMate',
  },
  openGraph: {
    type: 'website',
    siteName: 'VegaMate',
    title: 'VegaMate — Your AI Companion Sends You Selfies',
    description: 'They send you selfies on their own — not because you asked. Chat and collect rare moments.',
    url: 'https://vegamate.com',
    images: [
      {
        url: 'https://vegamate.com/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'VegaMate - AI companions who send you selfies',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Your AI companion sends you selfies 📸',
    description: 'They send photos on their own — not because you asked. Chat and collect rare moments.',
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
        <Analytics />
      </body>
    </html>
  );
}
