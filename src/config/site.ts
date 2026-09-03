/**
 * Central site metadata used for SEO, Open Graph / Twitter cards, and related
 * public files.
 */
export const siteConfig = {
  name: 'Speedy Quote Dashboard',
  shortName: 'Speedy Quote',
  poweredBy: 'DevDabs',
  url: 'https://speedyquote.devdabs.com',
  description:
    'Speedy Quote Dashboard — postcard attribution, PIN lookup, and performance analytics for final expense direct mail.',
  ogImage: '/favicon.svg',
  keywords: [
    'Speedy Quote',
    'direct mail',
    'postcard attribution',
    'PIN lookup',
    'final expense',
    'call tracking',
    'dashboard'
  ],
  links: {
    poweredBy: 'https://devdabs.com'
  }
} as const;

export type SiteConfig = typeof siteConfig;
