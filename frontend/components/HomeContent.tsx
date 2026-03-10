"use client";

import { useEffect, useState, useMemo } from 'react';
import { BookOpen, ChevronRight, File, Library, FolderOpen, ArrowLeft, User, LogOut, LogIn, LayoutDashboard, PanelLeft } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSidebarTrigger } from '@/app/(app)/layout';

import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useReaderCache, type ReaderDocument } from '@/lib/ReaderCacheContext';

interface PDFDocument {
    id: number;
    created_at: string;
    title: string;
    course_code: string;
    lecturer_name: string;
    topic: string;
    drive_file_id: string;
    file_name: string;
    file_size?: number;
}

export default function HomeContent() {
    const openSidebar = useSidebarTrigger();
    const {
        documents,
        setDocuments,
        hasLoadedDocuments,
        setHasLoadedDocuments,
        setLastOpenedDocument,
    } = useReaderCache();
    const [docs, setDocs] = useState<PDFDocument[]>(documents as PDFDocument[]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [, setMaintenanceMode] = useState(false);

    // Navigation State (URL Driven)
    const router = useRouter();
    const searchParams = useSearchParams();
    const selectedCourse = searchParams.get('course');
    const viewMode = selectedCourse ? 'list' : 'groups';

    // Auth State
    const [user, setUser] = useState<SupabaseUser | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
        // Check System Status
        const checkSystem = async () => {
            try {
                const res = await api.fetch('/sys/status');
                if (res.ok) {
                    const data = await res.json();
                    setMaintenanceMode(data.maintenance_mode);
                }
            } catch (e) {
                console.error("Status Check Failed", e);
            }
        };
        checkSystem();
    }, []);

    // Fetch documents from backend
    const fetchDocs = async () => {
        if (hasLoadedDocuments && documents.length > 0) {
            setDocs(documents as PDFDocument[]);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        const startTime = performance.now();
        console.log("🚀 Starting Document Fetch...");

        try {
            const response = await api.fetch('/documents');

            if (response.status === 401 || response.status === 403) {
                throw new Error('Unauthorized: Please check your API key configuration.');
            }

            if (!response.ok) {
                throw new Error(`Failed to fetch: ${response.statusText}`);
            }

            const data = await response.json();
            const endTime = performance.now();
            console.log(`⏱️ Documents Fetched in ${(endTime - startTime).toFixed(2)}ms`);

            setDocs(data || []);
            setDocuments((data || []) as ReaderDocument[]);
            setHasLoadedDocuments(true);
        } catch (err) {
            console.error('Fetch error:', err);
            setError(err instanceof Error ? err.message : 'Failed to connect to backend.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (hasLoadedDocuments && documents.length > 0) {
            setDocs(documents as PDFDocument[]);
            setLoading(false);
            return;
        }

        void fetchDocs();
    }, [documents, hasLoadedDocuments]);

    // Auth Check with DB Role
    useEffect(() => {
        const getUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const currentUser = session?.user || null;
            setUser(currentUser);

            if (currentUser?.email) {
                const response = await api.get('/me/bootstrap');
                if (response.ok) {
                    const data = await response.json();
                    if (data?.is_admin) {
                        setIsAdmin(true);
                    }
                }
            }
            setAuthLoading(false);
        };
        getUser();
    }, [supabase]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setIsAdmin(false);
        window.location.replace('/login');
    };

    // Grouping Logic
    const courseGroups = useMemo(() => {
        const groups: Record<string, PDFDocument[]> = {};
        docs.forEach(doc => {
            if (!groups[doc.course_code]) {
                groups[doc.course_code] = [];
            }
            groups[doc.course_code].push(doc);
        });
        return groups;
    }, [docs]);

    // Derived Data for Views
    const groupKeys = Object.keys(courseGroups).sort();
    const currentCourseDocs = selectedCourse ? courseGroups[selectedCourse] : [];
    const currentCourseTitle = currentCourseDocs?.length > 0 ? currentCourseDocs[0].title : '';

    // Format file size
    const formatSize = (bytes?: number) => {
        if (!bytes) return '';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <div className="h-full overflow-y-auto bg-background text-foreground transition-colors duration-500">

            {/* Mobile header with sidebar toggle */}
            <div className="md:hidden flex items-center px-4 py-3 border-b border-border bg-card sticky top-0 z-10">
                <button
                    onClick={openSidebar}
                    className="p-2 text-foreground hover:bg-accent rounded-lg transition-colors mr-2"
                >
                    <PanelLeft size={20} />
                </button>
                <span className="text-sm font-semibold text-foreground">My Library</span>
            </div>

            {/* Background Decor */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-y-1/2" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl translate-y-1/2" />
            </div>


            <main className="relative mx-auto max-w-7xl px-6 py-12">

                {/* Navigation / Breadcrumbs */}
                <div className="mb-8">
                    {viewMode === 'list' && (
                        <button
                            onClick={() => router.push('/reader')}
                            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors mb-4"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to Courses
                        </button>
                    )}

                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                        <div>
                            <h2 className={`text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl ${viewMode === 'groups' ? 'hidden md:block' : ''}`}>
                                {viewMode === 'groups' ? 'My Library' : `${selectedCourse}`}
                            </h2>
                            <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
                                {viewMode === 'groups'
                                    ? 'Select a course to view available topics.'
                                    : currentCourseTitle}
                            </p>
                        </div>
                        <div className="hidden md:block">
                            <div className="bg-secondary text-secondary-foreground px-4 py-2 rounded-full text-sm font-medium border border-border/50">
                                {viewMode === 'groups'
                                    ? `${groupKeys.length} Courses`
                                    : `${currentCourseDocs?.length || 0} Topics`}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Error State */}
                {error && (
                    <div className="mb-8 rounded-xl border border-red-200/50 bg-red-50/50 dark:bg-red-900/10 p-4 backdrop-blur-sm animate-in fade-in slide-in-from-top-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full text-red-600 dark:text-red-400">
                                <Library className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-sm font-medium text-red-800 dark:text-red-300">Connection Error</h3>
                                <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
                            </div>
                            <button
                                onClick={fetchDocs}
                                className="px-4 py-2 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                            >
                                Retry
                            </button>
                        </div>
                    </div>
                )}

                {/* Loading State */}
                {loading && (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className="h-48 rounded-2xl bg-muted/50 animate-pulse border border-border"></div>
                        ))}
                    </div>
                )}

                {/* CONTENT AREA */}
                {!loading && docs.length > 0 && (
                    <>
                        {/* VIEW 1: COURSE GROUPS */}
                        {viewMode === 'groups' && (
                            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                                {groupKeys.map((code, idx) => {
                                    const groupDocs = courseGroups[code];
                                    const firstDoc = groupDocs[0];
                                    return (
                                        <button
                                            key={code}
                                            onClick={() => router.push(`/reader?course=${code}`)}
                                            className="group relative text-left w-full"
                                            style={{ animationDelay: `${idx * 50}ms` }}
                                        >
                                            <div className="bg-card border border-border h-full p-6 rounded-2xl shadow-sm hover:shadow-md hover:border-primary/50 hover:-translate-y-1 active:translate-y-0 transition-all duration-300 relative overflow-hidden group">
                                                <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                                                <div className="flex items-start justify-between mb-6">
                                                    <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-300 shadow-sm">
                                                        <FolderOpen className="h-8 w-8 text-primary" />
                                                    </div>
                                                    <span className="px-3 py-1 rounded-full bg-secondary text-xs font-medium text-secondary-foreground border border-border/50">
                                                        {groupDocs.length} Items
                                                    </span>
                                                </div>

                                                <div>
                                                    <h3 className="text-2xl font-bold text-foreground group-hover:text-primary transition-colors mb-1">
                                                        {code}
                                                    </h3>
                                                    <p className="text-sm font-medium text-muted-foreground">
                                                        {firstDoc.title}
                                                    </p>
                                                </div>

                                                <div className="absolute bottom-6 right-6 opacity-0 translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                                                    <ChevronRight className="h-5 w-5 text-primary" />
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* VIEW 2: TOPIC LIST */}
                        {viewMode === 'list' && (
                            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                                {currentCourseDocs.map((doc, idx) => (
                                    <Link
                                        href={`/reader/${doc.drive_file_id}?size=${doc.file_size || ''}&course=${selectedCourse}`}
                                        key={doc.id}
                                        onClick={() => setLastOpenedDocument(doc as ReaderDocument)}
                                        className="group relative"
                                        style={{ animationDelay: `${idx * 50}ms` }}
                                    >
                                        <div className="bg-card border border-border h-full p-6 rounded-2xl shadow-sm hover:shadow-md hover:border-primary/50 hover:-translate-y-1 active:translate-y-0 transition-all duration-300 relative overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                                            <div className="mb-4 flex items-center gap-3">
                                                <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                                                    <File className="h-6 w-6" />
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <h3 className="text-xl font-bold text-card-foreground group-hover:text-primary transition-colors leading-tight">
                                                    {doc.topic}
                                                </h3>

                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <User className="w-4 h-4" />
                                                    <span>{doc.lecturer_name}</span>
                                                </div>

                                                <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                                                    <span>{formatSize(doc.file_size)}</span>
                                                    <span className="uppercase tracking-wider font-medium">{doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'PDF'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* Empty State */}
                {!loading && !error && docs.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="relative mb-6">
                            <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
                            <Library className="relative h-20 w-20 text-muted-foreground/50" />
                        </div>
                        <h3 className="text-2xl font-bold text-foreground">No documents found</h3>
                        <p className="mt-3 text-lg text-muted-foreground max-w-md">
                            Your library is looking a bit empty. Use the Admin Dashboard to upload your first course material!
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}
