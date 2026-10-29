/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  experimental: {
    // Reuse server-rendered pages for quick back/forward and sidebar hops; views
    // refresh themselves in the background when a cached render is older than 10s.
    staleTimes: { dynamic: 30, static: 60 },
  },
};
export default nextConfig;
