import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { Analytics } from '@vercel/analytics/next';
import { PixelProvider } from '@/components/analytics/pixel-provider';
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
    default: 'VegaMate - AI Companion',
    template: '%s | VegaMate',
  },
  description: 'Chat with AI characters who message you on their own and send photos as you get to know them. They remember you. Collect rare moments.',
  keywords: ['AI companion', 'AI chat', 'anime characters', 'AI characters', 'chat app', 'companion app'],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VegaMate',
  },
  openGraph: {
    type: 'website',
    siteName: 'VegaMate',
    title: 'VegaMate — AI Characters Who Remember You',
    description: 'They message you first and send photos as you get to know them. Chat and collect rare moments.',
    url: 'https://vegamate.com',
    images: [
      {
        url: 'https://vegamate.com/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'VegaMate - AI characters who chat and send photos',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI characters who remember you',
    description: 'They message you first and send photos as you get to know them. Chat and collect rare moments.',
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
        <Suspense fallback={null}>
          <PixelProvider />
        </Suspense>
        <Toaster position="top-center" richColors closeButton />
        <Analytics />
      </body>
    </html>
  );
}
