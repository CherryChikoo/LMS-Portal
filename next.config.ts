import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? {
      exclude: ["error", "warn"],
    } : false,
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'motion', 'recharts'],
  },
  // Enable Turbopack explicitly (Next.js 16 default)
  turbopack: {},
};

export default nextConfig;
