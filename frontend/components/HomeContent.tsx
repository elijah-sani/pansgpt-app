"use client";

import { useEffect, useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import { CheckCircle2, ChevronRight, File, Library, FolderOpen, ArrowLeft, User, PanelLeft, Search } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSidebarTrigger } from '@/lib/sidebar-controls';

import { api } from '@/lib/api';
import { clearAdminWorkspaceUniversity } from '@/lib/admin-workspace';
import { supabase } from '@/lib/supabase';
import { useReaderCache, type ReaderDocument } from '@/lib/ReaderCacheContext';
import { fetchBootstrap } from '@/lib/bootstrap-cache';

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
    material_status?: 'active' | 'archived' | string;
    academic_session?: string;
    semester?: string;
}

interface DocumentProgress {
    current_page: number;
    total_pages: number;
}

const groupDocumentsByCourse = (sourceDocs: PDFDocument[]) => {
    const groups: Record<string, PDFDocument[]> = {};
    sourceDocs.forEach(doc => {
        if (!groups[doc.course_code]) {
            groups[doc.course_code] = [];
        }
        groups[doc.course_code].push(doc);
    });
    return groups;
};

const filterCourseGroupKeys = (
    keys: string[],
    groups: Record<string, PDFDocument[]>,
    normalizedQuery: string
) => {
    if (!normalizedQuery) return keys;

    return keys.filter((code) => {
        const groupDocs = groups[code] || [];
        return groupDocs.some((doc) =>
            code.toLowerCase().includes(normalizedQuery) ||
            doc.title?.toLowerCase().includes(normalizedQuery) ||
            doc.topic?.toLowerCase().includes(normalizedQuery) ||
            doc.lecturer_name?.toLowerCase().includes(normalizedQuery) ||
            doc.file_name?.toLowerCase().includes(normalizedQuery)
        );
    });
};

function normalizeSemester(value?: string | null): '' | 'first' | 'second' {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (['first', 'first semester', '1st', '1st semester'].includes(raw)) return 'first';
    if (['second', 'second semester', '2nd', '2nd semester'].includes(raw)) return 'second';
    return '';
}

function formatSemester(value?: string | null): string {
    const normalized = normalizeSemester(value);
    if (normalized === 'first') return 'First Semester';
    if (normalized === 'second') return 'Second Semester';
    return '';
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
    // Progress: drive_file_id â†’ { current_page, total_pages }
    const [progressMap, setProgressMap] = useState<Record<string, DocumentProgress>>({});

    // Navigation State (URL Driven)
    const router = useRouter();
    const searchParams = useSearchParams();
    const selectedCourse = searchParams.get('course');
    const searchQueryParam = searchParams.get('q') || '';
    const viewMode = selectedCourse ? 'list' : 'groups';
    const [searchQuery, setSearchQuery] = useState(searchQueryParam);
    const [sessionFilter, setSessionFilter] = useState('All');
    const [semesterFilter, setSemesterFilter] = useState<'All' | 'first' | 'second'>('All');
    const [currentAcademicContext, setCurrentAcademicContext] = useState<{ current_academic_session?: string | null; current_semester?: string | null } | null>(null);
    const [mounted, setMounted] = useState(false);

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

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        let cancelled = false;
        fetchBootstrap().then((bootstrap) => {
            if (cancelled) return;
            const context = bootstrap?.academic_context || null;
            setCurrentAcademicContext(context);
            if (context?.current_academic_session) {
                setSessionFilter(context.current_academic_session);
            }
            const normalized = normalizeSemester(context?.current_semester);
            if (normalized) {
                setSemesterFilter(normalized);
            }
        }).catch(() => {});
        return () => {
            cancelled = true;
        };
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
        console.log("ðŸš€ Starting Document Fetch...");

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
            console.log(`â±ï¸ Documents Fetched in ${(endTime - startTime).toFixed(2)}ms`);

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

    // Batch-fetch reading progress for all loaded documents in a single query
    useEffect(() => {
        if (!user || docs.length === 0) return;

        const fileIds = docs.map((d) => d.drive_file_id);

        const fetchProgress = async () => {
            const { data, error: pgError } = await supabase
                .from('document_progress')
                .select('document_id, current_page, total_pages')
                .eq('user_id', user.id)
                .in('document_id', fileIds);

            if (pgError || !data) return;

            const map: Record<string, DocumentProgress> = {};
            for (const row of data) {
                map[row.document_id as string] = {
                    current_page: row.current_page as number,
                    total_pages: row.total_pages as number,
                };
            }
            setProgressMap(map);
        };

        void fetchProgress();
    }, [user, docs]);

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
        clearAdminWorkspaceUniversity();
        await supabase.auth.signOut();
        setUser(null);
        setIsAdmin(false);
        window.location.replace('/login');
    };

    const isArchivedDocument = (doc: PDFDocument) => String(doc.material_status || '').toLowerCase() === 'archived';
    const sessionOptions = useMemo(
        () => ['All', ...Array.from(new Set(docs.map((doc) => doc.academic_session).filter((value): value is string => Boolean(value && value.trim())))).sort().reverse()],
        [docs]
    );
    const filteredByAcademicPeriod = useMemo(
        () => docs.filter((doc) => {
            const matchesSession = sessionFilter === 'All' || doc.academic_session === sessionFilter;
            const matchesSemester = semesterFilter === 'All' || normalizeSemester(doc.semester) === semesterFilter;
            return matchesSession && matchesSemester;
        }),
        [docs, semesterFilter, sessionFilter]
    );
    const hasActiveDocumentsOutsideCurrentFilter = useMemo(
        () => docs.some((doc) => !isArchivedDocument(doc)),
        [docs]
    );

    const currentDocs = useMemo(() => filteredByAcademicPeriod.filter((doc) => !isArchivedDocument(doc)), [filteredByAcademicPeriod]);
    const pastDocs = useMemo(() => docs.filter((doc) => isArchivedDocument(doc)), [docs]);

    // Grouping Logic
    const currentCourseGroups = useMemo(() => groupDocumentsByCourse(currentDocs), [currentDocs]);
    const pastCourseGroups = useMemo(() => groupDocumentsByCourse(pastDocs), [pastDocs]);
    const allCourseGroups = useMemo(() => groupDocumentsByCourse(docs), [docs]);

    // Derived Data for Views
    const currentGroupKeys = Object.keys(currentCourseGroups).sort();
    const pastGroupKeys = Object.keys(pastCourseGroups).sort();
    
    // Docs for the selected course (all active and archived docs for this course)
    const courseDocs = useMemo(() => selectedCourse ? allCourseGroups[selectedCourse] || [] : [], [selectedCourse, allCourseGroups]);

    // Filter courseDocs by academic period for current docs
    const currentCourseDocs = useMemo(() => {
        return courseDocs.filter((doc) => {
            if (isArchivedDocument(doc)) return false;
            const matchesSession = sessionFilter === 'All' || doc.academic_session === sessionFilter;
            const matchesSemester = semesterFilter === 'All' || normalizeSemester(doc.semester) === semesterFilter;
            return matchesSession && matchesSemester;
        });
    }, [courseDocs, sessionFilter, semesterFilter]);

    // Filter courseDocs by archived status for past docs (past docs are NOT filtered by session/semester filters)
    const pastCourseDocs = useMemo(() => {
        return courseDocs.filter((doc) => isArchivedDocument(doc));
    }, [courseDocs]);

    const currentCourseTitle = useMemo(() => {
        if (currentCourseDocs?.length > 0) return currentCourseDocs[0].title;
        if (pastCourseDocs?.length > 0) return pastCourseDocs[0].title;
        return '';
    }, [currentCourseDocs, pastCourseDocs]);

    const normalizedQuery = searchQuery.trim().toLowerCase();

    const filteredCurrentGroupKeys = useMemo(
        () => filterCourseGroupKeys(currentGroupKeys, currentCourseGroups, normalizedQuery),
        [currentCourseGroups, currentGroupKeys, normalizedQuery]
    );
    const filteredPastGroupKeys = useMemo(
        () => filterCourseGroupKeys(pastGroupKeys, pastCourseGroups, normalizedQuery),
        [pastCourseGroups, pastGroupKeys, normalizedQuery]
    );
    const filteredGroupCount = filteredCurrentGroupKeys.length;

    // Filtered Docs for course detail list view
    const filteredCurrentCourseDocs = useMemo(() => {
        if (!normalizedQuery) return currentCourseDocs;
        return currentCourseDocs.filter((doc) =>
            doc.topic?.toLowerCase().includes(normalizedQuery) ||
            doc.title?.toLowerCase().includes(normalizedQuery) ||
            doc.lecturer_name?.toLowerCase().includes(normalizedQuery) ||
            doc.file_name?.toLowerCase().includes(normalizedQuery) ||
            doc.course_code?.toLowerCase().includes(normalizedQuery)
        );
    }, [currentCourseDocs, normalizedQuery]);

    const filteredPastCourseDocs = useMemo(() => {
        if (!normalizedQuery) return pastCourseDocs;
        return pastCourseDocs.filter((doc) =>
            doc.topic?.toLowerCase().includes(normalizedQuery) ||
            doc.title?.toLowerCase().includes(normalizedQuery) ||
            doc.lecturer_name?.toLowerCase().includes(normalizedQuery) ||
            doc.file_name?.toLowerCase().includes(normalizedQuery) ||
            doc.course_code?.toLowerCase().includes(normalizedQuery)
        );
    }, [pastCourseDocs, normalizedQuery]);

    const filteredCourseDocs = useMemo(
        () => [...filteredCurrentCourseDocs, ...filteredPastCourseDocs],
        [filteredCurrentCourseDocs, filteredPastCourseDocs]
    );

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
            <div className="md:hidden flex items-center px-4 py-3 shadow-sm bg-card sticky top-0 z-10">
                <button
                    onClick={openSidebar}
                    className="p-2 text-foreground hover:bg-accent rounded-lg transition-colors mr-2"
                >
                    <PanelLeft size={20} />
                </button>
                <span className="text-sm font-semibold text-foreground">My Library</span>
            </div>


            <main className="relative mx-auto max-w-7xl px-6 pt-5 pb-12 md:py-12">

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
                                    : mounted ? currentCourseTitle : ''}
                            </p>
                        </div>
                        <div className="flex flex-col gap-3 md:flex-row md:items-center">
                            <div className="relative">
                                <label htmlFor="study-search" className="sr-only">Search library</label>
                                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    id="study-search"
                                    type="text"
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                    placeholder={viewMode === 'groups' ? 'Search courses...' : 'Search topics...'}
                                    className="w-full min-w-0 rounded-xl bg-card py-2.5 pl-10 pr-4 text-[16px] text-foreground placeholder:text-muted-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20 md:w-[340px]"
                                />
                            </div>
                            <div className="flex gap-2">
                                <label className="sr-only" htmlFor="session-filter">Academic session</label>
                                <select
                                    id="session-filter"
                                    value={sessionFilter}
                                    onChange={(event) => setSessionFilter(event.target.value)}
                                    className="min-w-0 flex-1 rounded-xl bg-card pl-3 pr-10 py-2.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20 md:w-40"
                                >
                                    {sessionOptions.map((session) => (
                                        <option key={session} value={session}>{session === 'All' ? 'All Sessions' : session}</option>
                                    ))}
                                </select>
                                <label className="sr-only" htmlFor="semester-filter">Semester</label>
                                <select
                                    id="semester-filter"
                                    value={semesterFilter}
                                    onChange={(event) => setSemesterFilter(event.target.value as 'All' | 'first' | 'second')}
                                    className="min-w-0 flex-1 rounded-xl bg-card pl-3 pr-10 py-2.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20 md:w-44"
                                >
                                    <option value="All">All Semesters</option>
                                    <option value="first">First Semester</option>
                                    <option value="second">Second Semester</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Error State */}
                {error && (
                    <div className="mb-8 rounded-xl bg-red-50/50 dark:bg-red-900/10 p-4 backdrop-blur-sm animate-in fade-in slide-in-from-top-4">
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
                            <div key={i} className="h-48 rounded-2xl bg-muted/50 animate-pulse"></div>
                        ))}
                    </div>
                )}

                {/* CONTENT AREA */}
                {!loading && docs.length > 0 && (normalizedQuery === '' || (viewMode === 'groups' && filteredGroupCount > 0) || (viewMode === 'list' && filteredCourseDocs.length > 0)) && (
                    <>
                        {currentAcademicContext && currentDocs.length === 0 && hasActiveDocumentsOutsideCurrentFilter && (sessionFilter !== 'All' || semesterFilter !== 'All') && (
                            <div className="mb-8 rounded-2xl border border-border bg-card px-5 py-4">
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">No current-context materials found</p>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            Showing the configured academic context by default. You can switch to all active materials.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSessionFilter('All');
                                            setSemesterFilter('All');
                                        }}
                                        className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                                    >
                                        Show all active materials
                                    </button>
                                </div>
                            </div>
                        )}
                        {/* VIEW 1: COURSE GROUPS */}
                        {viewMode === 'groups' && (
                            <div className="space-y-10">
                                <MaterialSection
                                    title="Current Materials"
                                    emptyText="No current materials yet."
                                    groupKeys={filteredCurrentGroupKeys}
                                    groups={currentCourseGroups}
                                    router={router}
                                />
                            </div>
                        )}

                        {/* VIEW 2: TOPIC LIST */}
                        {viewMode === 'list' && (
                            <div className="space-y-10">
                                <TopicSection
                                    title="Current Materials"
                                    emptyText="No current materials yet."
                                    docs={filteredCurrentCourseDocs}
                                    selectedCourse={selectedCourse}
                                    progressMap={progressMap}
                                    formatSize={formatSize}
                                    setLastOpenedDocument={setLastOpenedDocument}
                                />
                                <TopicSection
                                    title="Past Materials"
                                    emptyText="No past materials yet."
                                    docs={filteredPastCourseDocs}
                                    selectedCourse={selectedCourse}
                                    progressMap={progressMap}
                                    formatSize={formatSize}
                                    setLastOpenedDocument={setLastOpenedDocument}
                                    archived
                                />
                            </div>
                        )}
                    </>
                )}

                {/* Search empty state */}
                {!loading && !error && docs.length > 0 && normalizedQuery !== '' && (
                    ((viewMode === 'groups' && filteredGroupCount === 0) ||
                        (viewMode === 'list' && filteredCourseDocs.length === 0))
                ) && (
                    <div className="flex flex-col items-center justify-center rounded-2xl bg-card px-6 py-16 text-center">
                        <Search className="mb-3 h-6 w-6 text-muted-foreground" />
                        <p className="text-base font-semibold text-foreground">No matches found</p>
                        <p className="mt-1 text-sm text-muted-foreground">Try a different keyword.</p>
                    </div>
                )}

                {/* Empty State */}
                {!loading && !error && docs.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="relative mb-6">
                            <div className="absolute inset-0 bg-muted/60 blur-2xl rounded-full" />
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

function MaterialSection({
    title,
    emptyText,
    groupKeys,
    groups,
    router,
    archived = false,
}: {
    title: string;
    emptyText: string;
    groupKeys: string[];
    groups: Record<string, PDFDocument[]>;
    router: { push: (href: string) => void };
    archived?: boolean;
}) {
    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-bold text-foreground">{title}</h3>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                    {groupKeys.length} Courses
                </span>
            </div>
            {groupKeys.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
                    {emptyText}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {groupKeys.map((code, idx) => {
                        const groupDocs = groups[code];
                        const firstDoc = groupDocs[0];
                        return (
                            <button
                                key={`${title}-${code}`}
                                onClick={() => router.push(`/reader?course=${code}`)}
                                className="group relative w-full text-left"
                                style={{ animationDelay: `${idx * 50}ms` }}
                            >
                                <div className="relative h-full overflow-hidden rounded-2xl bg-card p-6 shadow-sm transition-all duration-300 touch-manipulation hover:-translate-y-1 hover:shadow-md active:-translate-y-1 active:shadow-md">
                                    <div className="mb-6 flex items-start justify-between">
                                        <div className="rounded-xl bg-secondary p-3 text-secondary-foreground shadow-sm transition-transform duration-300 group-hover:scale-110">
                                            <FolderOpen className="h-8 w-8" />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {archived && (
                                                <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                    Past
                                                </span>
                                            )}
                                            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                                                {groupDocs.length} Items
                                            </span>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="mb-1 text-2xl font-bold text-foreground transition-colors group-hover:text-primary">
                                            {code}
                                        </h4>
                                        <p className="text-sm font-medium text-muted-foreground">
                                            {firstDoc.title}
                                        </p>
                                        <p className="mt-2 text-xs font-medium text-muted-foreground">
                                            {[firstDoc.academic_session, formatSemester(firstDoc.semester)].filter(Boolean).join(' • ') || 'No session set'}
                                        </p>
                                    </div>

                                    <div className="absolute bottom-6 right-6 translate-x-4 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
                                        <ChevronRight className="h-5 w-5 text-primary" />
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

function TopicSection({
    title,
    emptyText,
    docs,
    selectedCourse,
    progressMap,
    formatSize,
    setLastOpenedDocument,
    archived = false,
}: {
    title: string;
    emptyText: string;
    docs: PDFDocument[];
    selectedCourse: string | null;
    progressMap: Record<string, DocumentProgress>;
    formatSize: (bytes?: number) => string;
    setLastOpenedDocument: Dispatch<SetStateAction<ReaderDocument | null>>;
    archived?: boolean;
}) {
    const [isOpen, setIsOpen] = useState(!archived);

    return (
        <section className="space-y-4">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between gap-3 w-full text-left group hover:opacity-85 transition-opacity"
            >
                <div className="flex items-center gap-2">
                    <ChevronRight className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-90' : ''} group-hover:text-primary`} />
                    <h3 className="text-xl font-bold text-foreground">{title}</h3>
                </div>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                    {docs.length} Topics
                </span>
            </button>
            {isOpen && (
                <>
                    {docs.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
                            {emptyText}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                            {docs.map((doc, idx) => {
                                const prog = progressMap[doc.drive_file_id];
                                const pct = prog && prog.total_pages > 0
                                    ? Math.min(100, Math.round((prog.current_page / prog.total_pages) * 100))
                                    : 0;
                                const isComplete = pct >= 100;

                                return (
                                    <Link
                                        href={`/reader/${doc.drive_file_id}?size=${doc.file_size || ''}&course=${selectedCourse || ''}`}
                                        key={doc.id}
                                        onClick={() => setLastOpenedDocument(doc as ReaderDocument)}
                                        className="group relative"
                                        style={{ animationDelay: `${idx * 50}ms` }}
                                    >
                                        <div className="relative h-full overflow-hidden rounded-2xl bg-card p-6 shadow-sm transition-all duration-300 touch-manipulation hover:-translate-y-1 hover:shadow-md active:-translate-y-1 active:shadow-md">
                                            {pct > 0 && (
                                                <div
                                                    className="pointer-events-none absolute inset-y-0 left-0 bg-muted/60"
                                                    style={
                                                        {
                                                            '--progress-pct': `${pct}%`,
                                                            animation: 'progress-fill-in 900ms cubic-bezier(0.22, 1, 0.36, 1) 80ms both',
                                                        } as React.CSSProperties
                                                    }
                                                />
                                            )}

                                            <div className="relative mb-4 flex items-center gap-3">
                                                <div className="rounded-lg bg-secondary p-2.5 text-secondary-foreground">
                                                    <File className="h-6 w-6" />
                                                </div>
                                                {archived ? (
                                                    <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                        Past
                                                    </span>
                                                ) : isComplete ? (
                                                    <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                        Complete
                                                    </span>
                                                ) : null}
                                            </div>

                                            <div className="relative space-y-3">
                                                <h4 className="text-xl font-bold leading-tight text-card-foreground transition-colors group-hover:text-primary">
                                                    {doc.topic}
                                                </h4>

                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <User className="h-4 w-4" />
                                                    <span>{doc.lecturer_name}</span>
                                                </div>
                                                <p className="text-xs font-medium text-muted-foreground">
                                                    {[doc.academic_session, formatSemester(doc.semester)].filter(Boolean).join(' • ') || 'No session set'}
                                                </p>

                                                <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
                                                    <span>{formatSize(doc.file_size)}</span>
                                                    {prog && prog.total_pages > 0 && !isComplete ? (
                                                        <span className="font-medium tabular-nums">
                                                            {prog.current_page}&thinsp;/&thinsp;{prog.total_pages} pages
                                                        </span>
                                                    ) : (
                                                        <span className="font-medium uppercase tracking-wider">{doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'PDF'}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
