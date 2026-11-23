import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => new Response(
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', '/politica-de-privacidad'].map((pathname) => `<url><loc>${new URL(pathname, site).href}</loc></url>`).join('')}</urlset>`,
  { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
);
