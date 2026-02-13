"use client";

import dynamic from 'next/dynamic';

// ⚡ VERCEL FIX: Dynamically import the home content to bypass SSR pre-rendering
// This prevents browser-only APIs (createBrowserClient, performance.now, etc.) 
// from being executed during Vercel's build-time pre-rendering
const DynamicHomeContent = dynamic(() => import('@/components/HomeContent'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Loading PansGPT Reader...</p>
      </div>
    </div>
  )
});

export default function Home() {
  return <DynamicHomeContent />;
}
