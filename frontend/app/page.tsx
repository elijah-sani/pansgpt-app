"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function RootPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let isActive = true;

    const syncRouteWithSession = (hasSession: boolean) => {
      window.localStorage.setItem("pansgpt-auth-hint", hasSession ? "true" : "false");
      router.replace(hasSession ? "/main" : "/login");
    };

    const resolveInitialSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isActive) {
        return;
      }

      syncRouteWithSession(Boolean(session));
      setMounted(true);
    };

    void resolveInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isActive) {
        return;
      }

      syncRouteWithSession(Boolean(session));
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [router]);

  // Return null instead of a spinner to eliminate the "flash of loading" completely.
  // The immediate client-side redirect will seamlessly swap to the correct shell.
  if (!mounted) return null;
  return null;
}
