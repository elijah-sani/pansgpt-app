import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import MaintenanceGuard from "@/components/MaintenanceGuard";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProfileGuard from "@/components/ProfileGuard";

const outfit = Outfit({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PansGPT | AI Pharmacy Study Companion",
  description: "Your intelligent study assistant for pharmacy concepts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={outfit.className} suppressHydrationWarning>
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

