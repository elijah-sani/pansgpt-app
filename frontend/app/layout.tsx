import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import MaintenanceGuard from "@/components/MaintenanceGuard";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProfileGuard from "@/components/ProfileGuard";

export const metadata: Metadata = {
  title: "PansGPT | AI Pharmacy Study Companion",
  description: "Your intelligent study assistant for pharmacy concepts",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PansGPT",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ErrorBoundary>
            <MaintenanceGuard>
              <ProfileGuard>
                {children}
              </ProfileGuard>
            </MaintenanceGuard>
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
