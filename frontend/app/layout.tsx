import type { Metadata, Viewport } from "next";
import { Albert_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import MaintenanceGuard from "@/components/MaintenanceGuard";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProfileGuard from "@/components/ProfileGuard";
import { QuizCacheProvider } from "@/lib/QuizCacheContext";
import { ReaderCacheProvider } from "@/lib/ReaderCacheContext";
import { SessionRefresher } from "@/components/SessionRefresher";
import SplashScreenRemover from "@/components/SplashScreenRemover";

const BRAND_COLOR = "#53d22d";

const albertSans = Albert_Sans({
  subsets: ["latin"],
  variable: "--font-albert-sans",
});

export const metadata: Metadata = {
  title: "PansGPT",
  description: "AI-powered study platform for pharmacy students",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PansGPT",
  },
};

export const viewport: Viewport = {
  themeColor: BRAND_COLOR,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning style={{ backgroundColor: "#152012" }}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="PansGPT" />
        {/* Auto-reload when a new service worker takes over (silent update).
            controllerchange fires after skipWaiting + clientsClaim activate
            the new SW — reloading ensures users always get the latest bundle. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.addEventListener('controllerchange', function() {
                  window.location.reload();
                });
              }
            `,
          }}
        />
      </head>
      <body
        className={albertSans.variable}
        style={{ fontFamily: "'Inter', sans-serif" }}
        suppressHydrationWarning
      >
        <div 
          id="pwa-splash" 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#152012',
            transition: 'opacity 0.4s ease-out'
          }}
        >
          {/* The authentic PansGPT SVG Logo injected directly into the HTML to prevent network flashing */}
          <svg width="80" height="80" viewBox="0 0 291.7 312.9" style={{ marginBottom: '20px' }}>
            <g>
              <path d="M198.71,198.83c-2.64,2.51-17.78-19.09-39.65-20.05-23.8-1.05-42.35,22.9-45.12,20.05-2.77-2.84,21.56-20.64,20.99-44.05-.54-22.26-23.3-38.35-20.99-40.72,2.32-2.38,19.09,20.03,41.78,20.21,23.14.18,40.38-22.85,43-20.21,2.5,2.53-18.79,18.04-19.6,40.11-.87,23.72,22.4,42,19.6,44.67Z" fill="#fff"/>
              <path d="M291.7,33.99v230.75c0,2.21-2.68,3.32-4.24,1.76l-32.7-32.7c-3.2-3.2-4.99-7.53-4.99-12.05v-11.76c0-4,4.83-6,7.66-3.17l10.68,10.68c.97.97,2.63.28,2.63-1.09V33.87c0-7.13-5.78-12.9-12.9-12.9H78.99c-2.73,0-4.1,3.31-2.17,5.24l24.61,24.61c1.9,1.9,4.48,2.97,7.17,2.97h133.72c4.12,0,7.45,3.34,7.45,7.45v6.06c0,4.12-3.34,7.45-7.45,7.45H97.65c-1.24,0-2.43-.49-3.31-1.37L30.07,9.11c-3.36-3.36-.98-9.11,3.77-9.11h223.87c18.77,0,33.99,15.22,33.99,33.99Z" fill="#fff"/>
              <path d="M285.72,312.9H87.77c-18.77,0-33.99-15.22-33.99-33.99V107.56c0-2.02-.8-3.97-2.24-5.4l-25.09-25.09c-2.03-2.03-5.5-.59-5.5,2.28v172.3c0,4.12-3.34,7.45-7.45,7.45h-6.06C3.34,259.11,0,255.78,0,251.66V31.02c0-3.71,4.48-5.57,7.11-2.94l65.4,65.4c1.43,1.43,2.24,3.37,2.24,5.4v180.15c0,7.13,5.78,12.9,12.9,12.9h153.67l-30.58-30.58c-1.43-1.43-3.37-2.24-5.4-2.24h-102.17c-4.12,0-7.45-3.34-7.45-7.45v-5.88c0-4.22,3.42-7.63,7.63-7.63h110.66c2.03,0,3.97.81,5.41,2.24l68.06,68.27c1.56,1.57.45,4.24-1.76,4.24Z" fill="#fff"/>
            </g>
          </svg>
          <h1 style={{ color: '#ffffff', fontFamily: "'Inter', sans-serif", fontSize: '28px', fontWeight: '800', margin: 0, letterSpacing: '-0.03em' }}>
            PansGPT
          </h1>
        </div>

        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ErrorBoundary>
            <MaintenanceGuard>
              <ProfileGuard>
                <SessionRefresher />
                <ReaderCacheProvider>
                  <QuizCacheProvider>{children}</QuizCacheProvider>
                </ReaderCacheProvider>
              </ProfileGuard>
            </MaintenanceGuard>
          </ErrorBoundary>
        </ThemeProvider>

        <SplashScreenRemover />
      </body>
    </html>
  );
}