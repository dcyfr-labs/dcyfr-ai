import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    dirs: ['app', 'lib', 'scripts'],
  },
};

export default nextConfig;
