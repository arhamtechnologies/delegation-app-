/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  experimental: {
    // Reuse server-rendered pages for quick back/forward and sidebar hops; views
    // refresh themselves in the background when a cached render is older than 10s.
    staleTimes: { dynamic: 30, static: 60 },
  },
  // The service worker must never be cached, or phones keep running an old one.
  async headers() {
    return [{ source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Content-Type', value: 'application/javascript; charset=utf-8' }] }];
  },
};
export default nextConfig;
