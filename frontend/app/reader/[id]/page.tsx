"use client";

import { useParams, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useReaderCache } from '@/lib/ReaderCacheContext';
import LocalErrorBoundary from '@/components/LocalErrorBoundary';
import ErrorRecoveryView from '@/components/ErrorRecoveryView';

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
    const { documents, setLastOpenedDocument } = useReaderCache();

    useEffect(() => {
        if (!fileId || documents.length === 0) {
            return;
        }

        const matchingDocument = documents.find((document) => document.drive_file_id === fileId);
        if (matchingDocument) {
            setLastOpenedDocument(matchingDocument);
        }
    }, [documents, fileId, setLastOpenedDocument]);

    if (!fileId) {
        return (
            <div className="flex h-[100dvh] items-center justify-center bg-background">
                <p className="text-destructive">No file ID provided</p>
            </div>
        );
    }

    return (
        <main className="h-[100dvh] w-full overflow-hidden bg-background">
            <LocalErrorBoundary
                boundaryName="pdf-viewer"
                fallback={({ error, retry }) => (
                    <ErrorRecoveryView
                        title="Reader failed to load"
                        description="The document viewer hit an unexpected problem. Retry the viewer or return to the reader home."
                        errorMessage={error.message}
                        retryLabel="Refresh Page"
                        onRetry={() => window.location.reload()}
                        secondaryLabel="Back"
                        onSecondaryAction={() => window.location.assign('/reader')}
                    />
                )}
            >
                <PDFViewer fileId={fileId} fileSize={fileSize} />
            </LocalErrorBoundary>
        </main>
    );
}
