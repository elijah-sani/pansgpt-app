"use client";
import { Suspense } from "react";
import HomeContent from "@/components/HomeContent";

export default function ReaderIndexPage() {
    return (
        <Suspense fallback={<div className="h-full bg-background" />}>
            <HomeContent />
        </Suspense>
    );
}
