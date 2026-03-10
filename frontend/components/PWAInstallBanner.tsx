"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Share, X } from "lucide-react";

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{
      outcome: "accepted" | "dismissed";
      platform: string;
    }>;
  }
}

const DISMISS_KEY = "pwa-banner-dismissed";

type InstallMode = "native" | "ios" | null;

function isIOSDevice(userAgent: string) {
  return /iphone|ipad|ipod/i.test(userAgent);
}

function isSafariBrowser(userAgent: string) {
  return /safari/i.test(userAgent) && !/crios|fxios|edgios|opr\//i.test(userAgent);
}

export default function PWAInstallBanner() {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installMode, setInstallMode] = useState<InstallMode>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const wasDismissed = window.localStorage.getItem(DISMISS_KEY) === "true";
    const userAgent = window.navigator.userAgent;
    const shouldShowIOSInstructions = isIOSDevice(userAgent) && isSafariBrowser(userAgent);

    if (isStandalone || wasDismissed) {
      return;
    }

    const showBanner = (mode: Exclude<InstallMode, null>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setInstallMode(mode);
        setIsVisible(true);
      }, 4000);
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      showBanner("native");
    };

    const handleAppInstalled = () => {
      window.localStorage.setItem(DISMISS_KEY, "true");
      deferredPromptRef.current = null;
      setInstallMode(null);
      setIsVisible(false);
    };

    if (shouldShowIOSInstructions) {
      showBanner("ios");
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const dismissBanner = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, "true");
    }
    deferredPromptRef.current = null;
    setInstallMode(null);
    setIsVisible(false);
  };

  const handleInstall = async () => {
    const promptEvent = deferredPromptRef.current;
    if (!promptEvent || isInstalling) {
      return;
    }

    setIsInstalling(true);
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;

      if (outcome === "accepted" && typeof window !== "undefined") {
        window.localStorage.setItem(DISMISS_KEY, "true");
        setInstallMode(null);
        setIsVisible(false);
      }
    } finally {
      deferredPromptRef.current = null;
      setIsInstalling(false);
    }
  };

  const isIOSMode = installMode === "ios";
  const mobileSubtitle = isIOSMode
    ? "Tap Share, then Add to Home Screen."
    : "Study smarter. Anywhere, anytime.";
  const desktopSubtitle = isIOSMode
    ? "Open Safari's Share menu, then tap Add to Home Screen for the full app experience."
    : "Get the full app experience - study offline, get reminders, launch instantly.";
  const mobileButtonLabel = isIOSMode ? "Got it" : isInstalling ? "Installing..." : "Install";
  const desktopButtonLabel = isIOSMode ? "Got it" : isInstalling ? "Installing..." : "Install App";

  return (
    <AnimatePresence>
      {isVisible && installMode ? (
        <>
          <motion.div
            key={`pwa-install-mobile-${installMode}`}
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            className="fixed inset-x-0 bottom-0 z-[90] border-t border-white/10 bg-[#152012]/95 px-4 py-3 shadow-[0_-16px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl md:hidden"
          >
            <div className="mx-auto flex max-w-3xl items-center gap-3">
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-[10px] ring-1 ring-white/10">
                <Image src="/icon-192x192.png" alt="PansGPT" fill sizes="32px" className="object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">Install PansGPT</p>
                <p className="truncate text-xs text-white/65">{mobileSubtitle}</p>
              </div>
              {isIOSMode ? (
                <div className="flex items-center gap-2 shrink-0">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-white/85">
                    <Share className="h-4 w-4" />
                  </div>
                  <button
                    type="button"
                    onClick={dismissBanner}
                    className="shrink-0 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    {mobileButtonLabel}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleInstall()}
                  disabled={isInstalling}
                  className="shrink-0 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {mobileButtonLabel}
                </button>
              )}
              <button
                type="button"
                onClick={dismissBanner}
                aria-label="Dismiss install banner"
                className="shrink-0 rounded-full p-2 text-white/70 transition-colors hover:bg-white/8 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>

          <motion.div
            key={`pwa-install-desktop-${installMode}`}
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="fixed bottom-6 right-6 z-[90] hidden w-[320px] overflow-hidden rounded-[28px] border border-white/10 bg-[#152012]/95 p-5 shadow-[0_22px_55px_rgba(0,0,0,0.35)] backdrop-blur-2xl md:block"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/10">
                <Image src="/icon-192x192.png" alt="PansGPT" fill sizes="48px" className="object-cover" />
              </div>
              <button
                type="button"
                onClick={dismissBanner}
                aria-label="Dismiss install banner"
                className="-mr-1 -mt-1 rounded-full p-2 text-white/55 transition-colors hover:bg-white/8 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-white">Install PansGPT</h3>
              <p className="text-sm leading-6 text-white/70">{desktopSubtitle}</p>
            </div>

            <div className="mt-5 space-y-3">
              {isIOSMode ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85">
                  <Share className="h-4 w-4" />
                  Tap Share, then Add to Home Screen
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleInstall()}
                  disabled={isInstalling}
                  className="w-full rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {desktopButtonLabel}
                </button>
              )}
              <button
                type="button"
                onClick={dismissBanner}
                className="w-full text-center text-sm font-medium text-white/55 transition-colors hover:text-white/80"
              >
                {isIOSMode ? "Got it" : "Not now"}
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
