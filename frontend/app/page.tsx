"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function RootPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // 1. Optimistic cold-start hint check
    const hint = window.localStorage.getItem("pansgpt-auth-hint");
    if (hint === "true") {
      router.replace("/main");
    } else if (hint === "false") {
      router.replace("/login");
    }

    // 2. Real auth state sync
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          window.localStorage.setItem("pansgpt-auth-hint", "true");
          // If we didn't have a hint, redirect now
          if (hint !== "true") router.replace("/main");
        } else {
          window.localStorage.setItem("pansgpt-auth-hint", "false");
          if (hint !== "false") router.replace("/login");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [router]);

  // Return null instead of a spinner to eliminate the "flash of loading" completely.
  // The immediate client-side redirect will seamlessly swap to the correct shell.
  if (!mounted) return null;
  return null;
}