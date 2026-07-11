import type { MetadataRoute } from 'next';

const BASE_URL = 'https://vegamate.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/chat',
        '/settings',
        '/gallery',
        '/memories',
        '/onboarding',
        '/payment',
        '/select',
        '/login',
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
