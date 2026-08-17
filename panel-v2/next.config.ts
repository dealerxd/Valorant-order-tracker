import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The repo root also holds the Python bot, and there is a stray lockfile in
  // the user's home directory; pin the trace root to this app.
  outputFileTracingRoot: __dirname,
  experimental: {
    // Server actions receive screenshot uploads from the board drop zone.
    serverActions: { bodySizeLimit: '8mb' },
  },
};

export default nextConfig;
