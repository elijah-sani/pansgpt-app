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
          {/* Lightweight SVG icon representing the brand to act as the native PWA OS Splash */}
          <div style={{ backgroundColor: 'rgba(83, 210, 45, 0.1)', padding: '16px', borderRadius: '16px', marginBottom: '20px' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#53d22d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
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