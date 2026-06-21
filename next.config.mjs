/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/manifest.json',
        destination: '/_next/static/manifest.json',
      },
    ]
  },
};

export default nextConfig;
