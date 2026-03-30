import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const withPWAConfig = withPWA({
  dest: "public",
  register: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  // Prevent automatic reload when network comes back online, which can cause loops on mobile login
  reloadOnOnline: false,
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
    // Disable automatic SW takeover to avoid reload loops on iOS login page
    skipWaiting: false,
    // Do not claim clients automatically; navigation will handle updates gracefully
    clientsClaim: false,
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