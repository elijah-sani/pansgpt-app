"use client";

import { useParams, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const PDFViewer = dynamic(() => import('@/components/PDFViewer'), {
    ssr: false,
    loading: () => (
        <div className="flex h-[100dvh] items-center justify-center bg-background">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
    )
});

export default function ReaderPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const fileId = params.id as string;
    const fileSize = searchParams.get('size') || undefined;

    if (!fileId) {
        return (
            <div className="flex h-[100dvh] items-center justify-center bg-background">
                <p className="text-destructive">No file ID provided</p>
            </div>
        );
    }

    return (
        <main className="h-[100dvh] w-full overflow-hidden bg-background">
            <PDFViewer fileId={fileId} fileSize={fileSize} />
        </main>
    );
}
