"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on mount with the real
    // persisted session — more reliable than getSession() for redirects.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        router.replace(session ? "/main" : "/login");
      }
    );

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}