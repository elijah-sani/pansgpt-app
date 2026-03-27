import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const withPWAConfig = withPWA({
  dest: "public",
  register: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  // Cache the root URL as the app shell so the PWA opens instantly
  cacheStartUrl: true,
  // Unique identifier so the SW distinguishes new builds
  dynamicStartUrl: true,
  fallbacks: {
    document: "/~offline",
  },
  workboxOptions: {
    disableDevLogs: true,
    // New service worker takes over immediately without waiting for
    // all tabs to close — enables silent background updates.
    skipWaiting: true,
    // Claim all open tabs immediately after activation
    clientsClaim: true,
    // Raise the maximum pre-cache file size limit (default 2MB is too small for some JS chunks)
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
  },
});

const nextConfig: NextConfig = {
  turbopack: {},
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    cpus: 1,
    serverActions: {
      allowedOrigins: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",")
        : ["localhost:3000"],
    },
  },
};

export default withPWAConfig(nextConfig);