import type { Metadata } from "next";
import { Albert_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import MaintenanceGuard from "@/components/MaintenanceGuard";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProfileGuard from "@/components/ProfileGuard";
import { QuizCacheProvider } from "@/lib/QuizCacheContext";
import { ReaderCacheProvider } from "@/lib/ReaderCacheContext";

const albertSans = Albert_Sans({
    subsets: ["latin"],
    variable: "--font-albert-sans",
});

export const metadata: Metadata = {
    title: "PansGPT",
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
            <body className={albertSans.variable} style={{ fontFamily: "'Inter', sans-serif" }} suppressHydrationWarning>
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
                                    <QuizCacheProvider>
                                        {children}
                                    </QuizCacheProvider>
                                </ReaderCacheProvider>
                            </ProfileGuard>
                        </MaintenanceGuard>
                    </ErrorBoundary>
                </ThemeProvider>
            </body>
        </html>
    );
}
