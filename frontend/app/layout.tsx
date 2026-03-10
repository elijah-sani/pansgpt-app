import type { Metadata, Viewport } from "next";
import { Albert_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import MaintenanceGuard from "@/components/MaintenanceGuard";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProfileGuard from "@/components/ProfileGuard";
import { QuizCacheProvider } from "@/lib/QuizCacheContext";
import { ReaderCacheProvider } from "@/lib/ReaderCacheContext";

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
    <html lang="en" suppressHydrationWarning>
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
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ErrorBoundary>
            <MaintenanceGuard>
              <ProfileGuard>
                <ReaderCacheProvider>
                  <QuizCacheProvider>{children}</QuizCacheProvider>
                </ReaderCacheProvider>
              </ProfileGuard>
            </MaintenanceGuard>
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}