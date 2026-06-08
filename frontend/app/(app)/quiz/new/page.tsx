"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NewQuizRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/quiz?new=1");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm text-muted-foreground">
      Opening quiz builder...
    </div>
  );
}
