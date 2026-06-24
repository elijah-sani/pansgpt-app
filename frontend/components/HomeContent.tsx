"use client";

import { useEffect, useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import { 
    CheckCircle2, 
    ChevronRight, 
    File, 
    Library, 
    FolderOpen, 
    ArrowLeft, 
    User, 
    PanelLeft, 
    Search,
    Clock,
    LayoutGrid,
    List,
    RefreshCw,
    X,
    Info,
    BookOpen,
    FileText,
    Eye,
    Star,
    MoreVertical,
    Loader2
} from 'lucide-react';

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
    course_title?: string;
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
    updated_at?: string;
}

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

// Get the date grouping label for recent list
function getRelativeDateGroup(updatedAtStr?: string): 'Today' | 'Yesterday' | 'In 7 days' | 'Earlier' {
    if (!updatedAtStr) return 'Earlier';
    const date = new Date(updatedAtStr);
    const text = new Date();
    
    const today = new Date(text.getFullYear(), text.getMonth(), text.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    if (date >= today) return 'Today';
    if (date >= yesterday) return 'Yesterday';
    if (date >= sevenDaysAgo) return 'In 7 days';
    return 'Earlier';
}

// Mock slide thumbnail component (Bright white background to pop in dark mode, matching the reference screenshot)
function DocumentThumbnail({ doc }: { doc: PDFDocument }) {
    const fileName = doc.file_name.toLowerCase();
    const isPPT = fileName.includes('ppt') || fileName.includes('pptx');
    
    const isPCP = doc.course_code.toLowerCase().includes('pcp');
    const isPCL = doc.course_code.toLowerCase().includes('pcl');
    
    if (isPPT) {
        // Presentation mockup slide: always white bg to match WPS green/blue slides
        const isGreen = isPCP || doc.id % 2 === 0;
        const bannerColor = isGreen ? 'bg-[#7eb282]' : 'bg-[#4f81bd]';
        const titleColor = isGreen ? 'text-primary' : 'text-[#1f497d]';
        const slideSub = isGreen ? 'Supply Chain Management' : 'Pharmacy Operations';
        
        return (
            <div className="relative w-full h-full bg-white flex overflow-hidden select-none">
                {/* Left panel band */}
                <div className={`w-[24%] h-full shrink-0 flex flex-col justify-end p-2 ${bannerColor}`}>
                    <div className="w-full h-0.5 bg-white/50 rounded-sm mb-0.5" />
                    <div className="w-2/3 h-0.5 bg-white/50 rounded-sm" />
                </div>
                
                {/* Main center area */}
                <div className="flex-1 flex flex-col justify-between p-2.5 relative bg-white">
                    {/* Header course code */}
                    <div className="text-[7.5px] font-extrabold text-[#777] text-left">
                        {doc.course_code}
                    </div>
                    
                    {/* Center slide title */}
                    <div className="flex-1 flex flex-col justify-center items-center text-center">
                        <span className={`text-[10px] font-extrabold leading-tight line-clamp-3 text-center px-1 tracking-tight ${titleColor}`}>
                            {doc.topic}
                        </span>
                    </div>
                    
                    {/* Footer text */}
                    <div className="text-[6px] text-right font-bold text-zinc-400 truncate mt-auto">
                        {slideSub}
                    </div>
                </div>
            </div>
        );
    }
    
    // PDF mockup: always bright white page layout
    const isBlue = isPCL;
    const bulletColor = isBlue ? 'bg-[#5c8bc4]' : 'bg-primary';
    return (
        <div className="relative w-full h-full bg-white flex flex-col p-2.5 select-none">
            {/* Header representation */}
            <div className="flex items-center gap-1 border-b border-zinc-200 pb-1 shrink-0">
                <div className={`w-1.5 h-1.5 rounded-full ${bulletColor}`} />
                <span className="text-[6.5px] font-extrabold text-zinc-500 truncate">{doc.course_code}</span>
            </div>
            {/* Body lines & text */}
            <div className="flex-1 flex gap-2 pt-1.5 min-h-0">
                {/* Left Page column */}
                <div className="flex-1 flex flex-col gap-1.5">
                    <span className="text-[9.5px] font-extrabold text-zinc-800 line-clamp-3 leading-snug tracking-tight text-left">
                        {doc.topic}
                    </span>
                    <div className="w-full h-0.5 bg-zinc-200 rounded-sm" />
                    <div className="w-5/6 h-0.5 bg-zinc-200 rounded-sm" />
                </div>
                {/* Right Page column */}
                <div className="w-[45%] flex flex-col gap-1 border-l border-zinc-100 pl-1.5 shrink-0">
                    <div className="w-full h-1 bg-zinc-200 rounded-sm" />
                    <div className="w-full h-0.5 bg-zinc-200 rounded-sm" />
                    <div className="w-full h-0.5 bg-zinc-200 rounded-sm" />
                    <div className="w-2/3 h-0.5 bg-zinc-200 rounded-sm" />
                </div>
            </div>
        </div>
    );
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
    
    // Progress: drive_file_id -> { current_page, total_pages, updated_at }
    const [progressMap, setProgressMap] = useState<Record<string, DocumentProgress>>({});

    // Starred documents (stored locally in client for native-like interaction)
    const [starredIds, setStarredIds] = useState<string[]>([]);

    // Navigation State (URL Driven)
    const router = useRouter();
    const searchParams = useSearchParams();
    
    const activeCourse = searchParams.get('course') || null;
    const activeTab = searchParams.get('tab') || (activeCourse ? 'courses' : 'recent');
    const searchQueryParam = searchParams.get('q') || '';
    
    const [searchQuery, setSearchQuery] = useState(searchQueryParam);
    const [sessionFilter, setSessionFilter] = useState('All');
    const [semesterFilter, setSemesterFilter] = useState<'All' | 'first' | 'second'>('All');
    const [currentAcademicContext, setCurrentAcademicContext] = useState<{ current_academic_session?: string | null; current_semester?: string | null } | null>(null);
    const [mounted, setMounted] = useState(false);

    // View layout: 'grid' by default for replica match
    const [viewStyle, setViewStyle] = useState<'list' | 'grid'>('grid');
    const [showMobileFilters, setShowMobileFilters] = useState(false);
    
    // Selected document details sidebar
    const [selectedDoc, setSelectedDoc] = useState<PDFDocument | null>(null);
    const [loadingDocId, setLoadingDocId] = useState<string | null>(null);

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

    useEffect(() => {
        setMounted(true);
        setLoadingDocId(null);
    }, []);

    // Load starred document ids
    useEffect(() => {
        const stored = localStorage.getItem('starred_docs');
        if (stored) {
            try {
                setStarredIds(JSON.parse(stored));
            } catch (e) {}
        }
    }, []);

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
                .select('document_id, current_page, total_pages, updated_at')
                .eq('user_id', user.id)
                .in('document_id', fileIds);

            if (pgError || !data) return;

            const map: Record<string, DocumentProgress> = {};
            for (const row of data) {
                map[row.document_id as string] = {
                    current_page: row.current_page as number,
                    total_pages: row.total_pages as number,
                    updated_at: row.updated_at as string,
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

    const isArchivedDocument = (doc: PDFDocument) => String(doc.material_status || '').toLowerCase() === 'archived';

    const sessionOptions = useMemo(
        () => ['All', ...Array.from(new Set(docs.map((doc) => doc.academic_session).filter((value): value is string => Boolean(value && value.trim())))).sort().reverse()],
        [docs]
    );

    // List of unique course codes for sidebar folder view
    const courseFolders = useMemo(() => {
        const folders = Array.from(new Set(docs.map(d => d.course_code).filter(Boolean)));
        return folders.sort();
    }, [docs]);

    const activeCourseTitle = useMemo(() => {
        if (!activeCourse) return null;
        const matchingDoc = docs.find((d) => d.course_code === activeCourse);
        return matchingDoc?.title || null;
    }, [docs, activeCourse]);

    // Partition logic:
    // Recent: documents that have progress recorded (sorted by updated_at desc), filtered by academic period
    const recentDocs = useMemo(() => {
        return docs
            .filter(doc => {
                if (!progressMap[doc.drive_file_id]) return false;
                const matchesSession = sessionFilter === 'All' || doc.academic_session === sessionFilter;
                const matchesSemester = semesterFilter === 'All' || normalizeSemester(doc.semester) === semesterFilter;
                return matchesSession && matchesSemester;
            })
            .sort((a, b) => {
                const tA = new Date(progressMap[a.drive_file_id]?.updated_at || 0).getTime();
                const tB = new Date(progressMap[b.drive_file_id]?.updated_at || 0).getTime();
                return tB - tA;
            });
    }, [docs, progressMap, sessionFilter, semesterFilter]);

    // Other Documents: active documents that don't have progress recorded, filtered by academic period
    const otherDocs = useMemo(() => {
        return docs.filter(doc => {
            if (isArchivedDocument(doc)) return false;
            
            // Check session and semester filters
            const matchesSession = sessionFilter === 'All' || doc.academic_session === sessionFilter;
            const matchesSemester = semesterFilter === 'All' || normalizeSemester(doc.semester) === semesterFilter;
            if (!matchesSession || !matchesSemester) return false;

            // Exclude already opened / recent ones
            return !progressMap[doc.drive_file_id];
        });
    }, [docs, progressMap, sessionFilter, semesterFilter]);

    // Course documents: all documents belonging to a selected course, filtered by academic period
    const selectedCourseDocs = useMemo(() => {
        if (!activeCourse) return [];
        return docs.filter(doc => {
            if (doc.course_code !== activeCourse) return false;
            const matchesSession = sessionFilter === 'All' || doc.academic_session === sessionFilter;
            const matchesSemester = semesterFilter === 'All' || normalizeSemester(doc.semester) === semesterFilter;
            return matchesSession && matchesSemester;
        });
    }, [docs, activeCourse, sessionFilter, semesterFilter]);

    // Filter lists by Search query
    const filterListBySearch = (list: PDFDocument[]) => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return list;
        return list.filter(doc => 
            doc.title?.toLowerCase().includes(query) ||
            doc.topic?.toLowerCase().includes(query) ||
            doc.lecturer_name?.toLowerCase().includes(query) ||
            doc.course_code?.toLowerCase().includes(query) ||
            doc.file_name?.toLowerCase().includes(query)
        );
    };

    const displayRecentDocs = useMemo(() => filterListBySearch(recentDocs), [recentDocs, searchQuery]);
    const displayOtherDocs = useMemo(() => filterListBySearch(otherDocs), [otherDocs, searchQuery]);
    const displayCourseDocs = useMemo(() => filterListBySearch(selectedCourseDocs), [selectedCourseDocs, searchQuery]);
    const starredDocs = useMemo(() => {
        return docs.filter(doc => {
            if (!starredIds.includes(doc.drive_file_id)) return false;
            const matchesSession = sessionFilter === 'All' || doc.academic_session === sessionFilter;
            const matchesSemester = semesterFilter === 'All' || normalizeSemester(doc.semester) === semesterFilter;
            return matchesSession && matchesSemester;
        });
    }, [docs, starredIds, sessionFilter, semesterFilter]);
    const displayStarredDocs = useMemo(() => filterListBySearch(starredDocs), [starredDocs, searchQuery]);

    const displaySearchDocs = useMemo(() => {
        return filterListBySearch(docs);
    }, [docs, searchQuery]);

    const displaySearchCourses = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return [];
        return courseFolders.filter(folder => 
            folder.toLowerCase().includes(query)
        );
    }, [courseFolders, searchQuery]);

    const currentCourseDocs = useMemo(() => {
        return displayCourseDocs.filter(doc => !isArchivedDocument(doc));
    }, [displayCourseDocs]);

    const pastCourseDocs = useMemo(() => {
        return displayCourseDocs.filter(doc => isArchivedDocument(doc));
    }, [displayCourseDocs]);

    // Group Recent Documents by chronological groups
    const recentGroups = useMemo(() => {
        const groups: Record<'Today' | 'Yesterday' | 'In 7 days' | 'Earlier', PDFDocument[]> = {
            'Today': [],
            'Yesterday': [],
            'In 7 days': [],
            'Earlier': []
        };
        displayRecentDocs.forEach(doc => {
            const grp = getRelativeDateGroup(progressMap[doc.drive_file_id]?.updated_at);
            groups[grp].push(doc);
        });
        return groups;
    }, [displayRecentDocs, progressMap]);

    // Format file size helper
    const formatSize = (bytes?: number) => {
        if (!bytes) return '—';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    // Nav helpers
    const selectTab = (tab: string) => {
        setSelectedDoc(null);
        router.push(`/reader?tab=${tab}`);
    };

    const selectCourse = (code: string) => {
        setSelectedDoc(null);
        router.push(`/reader?course=${code}`);
    };

    const selectDocument = (doc: PDFDocument) => {
        setSelectedDoc(doc);
    };

    const handleOpenReader = (doc: PDFDocument) => {
        setLoadingDocId(doc.drive_file_id);
        setLastOpenedDocument(doc as ReaderDocument);
        router.push(`/reader/${doc.drive_file_id}?size=${doc.file_size || ''}&course=${doc.course_code || ''}`);
    };

    // Toggle star local storage state
    const toggleStar = (e: React.MouseEvent, driveFileId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setStarredIds(prev => {
            const next = prev.includes(driveFileId) ? prev.filter(id => id !== driveFileId) : [...prev, driveFileId];
            localStorage.setItem('starred_docs', JSON.stringify(next));
            return next;
        });
    };

    // Calculate dynamic document stats per course code for sidebar pills
    const courseStats = useMemo(() => {
        const stats: Record<string, number> = {};
        docs.forEach(doc => {
            if (doc.course_code) {
                stats[doc.course_code] = (stats[doc.course_code] || 0) + 1;
            }
        });
        return stats;
    }, [docs]);

    const getFileIconColor = (fileName: string) => {
        const ext = fileName.split('.').pop()?.toLowerCase();
        if (ext === 'pdf') return 'bg-primary/10 text-primary border-primary/20';
        if (['doc', 'docx'].includes(ext || '')) return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
        if (['ppt', 'pptx'].includes(ext || '')) return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
        return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
    };

    const getFileLetterIcon = (fileName: string) => {
        const ext = fileName.split('.').pop()?.toLowerCase();
        if (ext === 'pdf') return 'D';
        if (['ppt', 'pptx'].includes(ext || '')) return 'P';
        return 'W';
    };

    const getFileLetterBg = (fileName: string) => {
        const ext = fileName.split('.').pop()?.toLowerCase();
        if (ext === 'pdf') return 'bg-primary text-primary-foreground';
        if (['ppt', 'pptx'].includes(ext || '')) return 'bg-primary/90 text-primary-foreground';
        return 'bg-[#0f62fe] text-white';
    };

    return (
        <div className="flex h-screen w-full overflow-hidden bg-background text-foreground transition-colors duration-500">
            {/* 1. LEFT LOCAL SIDEBAR - DESKTOP ONLY */}
            <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-border/60 bg-card/35 backdrop-blur-md">
                {/* Title */}
                <div className="px-6 py-5 border-b border-border/40 flex items-center gap-3">
                    <Library className="h-6 w-6 text-primary animate-pulse" />
                    <span className="text-lg font-bold tracking-wide font-outfit">My Library</span>
                </div>

                {/* Main Sections */}
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
                    <div className="space-y-1">
                        <button
                            onClick={() => selectTab('recent')}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                                activeTab === 'recent' 
                                    ? 'bg-primary/10 text-primary shadow-sm' 
                                    : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                            }`}
                        >
                            <Clock className="h-4.5 w-4.5" />
                            <span>Recent Documents</span>
                        </button>
                    </div>

                    {/* Dynamic Courses folders */}
                    <div className="space-y-2">
                        <div className="px-3 text-xs font-semibold tracking-wider text-muted-foreground/60 uppercase">
                            Courses
                        </div>
                        <div className="space-y-1 max-h-[350px] overflow-y-auto pr-1">
                            {courseFolders.map(folder => (
                                <button
                                    key={folder}
                                    onClick={() => selectCourse(folder)}
                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                                        activeCourse === folder 
                                            ? 'bg-primary/10 text-primary shadow-sm' 
                                            : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <BookOpen className="h-4.5 w-4.5" />
                                        <span className="truncate max-w-[130px]">{folder}</span>
                                    </div>
                                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                                        {courseStats[folder] || 0}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </aside>

            {/* 2. MAIN WORKSPACE */}
            <section className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
                {/* Mobile top bar */}
                <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border/40 bg-card sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={openSidebar}
                            className="p-2 text-foreground hover:bg-accent rounded-lg transition-colors"
                        >
                            <PanelLeft size={20} />
                        </button>
                        <span className="text-base font-bold tracking-tight">Library</span>
                    </div>
                </div>

                {/* Main Content Scroll Container */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    
                    {/* DESKTOP HEADER ROW */}
                    <div className="hidden md:flex px-6 py-5 border-b border-border/40 bg-card/20 flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl font-outfit">
                                    {activeTab === 'recent' && 'Recent'}
                                    {activeTab === 'starred' && 'Starred Documents'}
                                    {activeTab === 'other' && 'Other Documents'}
                                    {activeCourse && (
                                        <>
                                            {activeCourse}
                                            {activeCourseTitle && (
                                                <span className="ml-2.5">
                                                    · {activeCourseTitle}
                                                </span>
                                            )}
                                        </>
                                    )}
                                </h1>
                                <button
                                    onClick={fetchDocs}
                                    className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors ml-1"
                                    title="Reload Documents"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                </button>
                            </div>

                            {/* View style toggle */}
                            <div className="flex items-center bg-muted/60 p-1 rounded-xl">
                                <button
                                    onClick={() => setViewStyle('list')}
                                    className={`p-1.5 rounded-lg transition-all ${viewStyle === 'list' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    <List className="h-4.5 w-4.5" />
                                </button>
                                <button
                                    onClick={() => setViewStyle('grid')}
                                    className={`p-1.5 rounded-lg transition-all ${viewStyle === 'grid' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    <LayoutGrid className="h-4.5 w-4.5" />
                                </button>
                            </div>
                        </div>

                        {/* Search & Academic period filters */}
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="relative flex-1 max-w-md">
                                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search documents or courses..."
                                    className="w-full rounded-xl bg-card border border-border/40 py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <select
                                    value={sessionFilter}
                                    onChange={(e) => setSessionFilter(e.target.value)}
                                    className="rounded-xl border border-border/40 bg-card py-2 px-3 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20"
                                >
                                    {sessionOptions.map((session) => (
                                        <option key={session} value={session}>{session === 'All' ? 'All Sessions' : session}</option>
                                    ))}
                                </select>
                                <select
                                    value={semesterFilter}
                                    onChange={(e) => setSemesterFilter(e.target.value as 'All' | 'first' | 'second')}
                                    className="rounded-xl border border-border/40 bg-card py-2 px-3 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20"
                                >
                                    <option value="All">All Semesters</option>
                                    <option value="first">First Semester</option>
                                    <option value="second">Second Semester</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* MOBILE REPLICA TOP LAYOUT (EXACT IMAGE ORDER: SEARCH, FILTERS, PANEL, TABS, ACTIONS, GRID) */}
                    <div className="md:hidden flex-1 flex flex-col bg-background pt-4 gap-3.5 overflow-y-auto">
                        {/* 1. Top Search Bar: wide, dark grey, rounded-corner search input field with double-horizontal scanner icon */}
                        <div className="px-4 flex gap-2.5 items-center">
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search documents or courses..."
                                    className="w-full rounded-full bg-surface-secondary border-none py-2.5 px-4 text-base text-foreground placeholder:text-muted-foreground outline-none focus:ring-0 focus:border-none"
                                />
                            </div>
                        </div>

                        {/* Filter panel when Filter icon is toggled */}
                        {showMobileFilters && (
                            <div className="px-4 animate-in slide-in-from-top-1 duration-150">
                                <div className="flex items-center gap-3 p-3 bg-surface-secondary rounded-2xl border border-border/40">
                                    <select
                                        value={sessionFilter}
                                        onChange={(e) => setSessionFilter(e.target.value)}
                                        className="flex-1 rounded-xl border border-border/40 bg-surface-primary py-2 px-3 text-xs font-bold text-foreground outline-none"
                                    >
                                        {sessionOptions.map((session) => (
                                            <option key={session} value={session}>{session === 'All' ? 'All Sessions' : session}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={semesterFilter}
                                        onChange={(e) => setSemesterFilter(e.target.value as 'All' | 'first' | 'second')}
                                        className="flex-1 rounded-xl border border-border/40 bg-surface-primary py-2 px-3 text-xs font-bold text-foreground outline-none"
                                    >
                                        <option value="All">All Semesters</option>
                                        <option value="first">First Semester</option>
                                        <option value="second">Second Semester</option>
                                    </select>
                                </div>
                            </div>
                        )}                        {/* Main documents panel wrapper - rounded top container enclosing tabs and list */}
                        <div className="flex-1 bg-surface-primary rounded-t-[28px] border-t border-border/40 mt-1 flex flex-col pb-8 overflow-y-auto">
                            {searchQuery.trim() ? (
                                /* GLOBAL SEARCH RESULTS VIEW FOR MOBILE */
                                <div className="flex-1 px-4 py-5 flex flex-col gap-6 animate-in fade-in duration-150">
                                    <div className="flex items-center justify-between pl-1">
                                        <span className="text-[13px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                                            Search Results
                                        </span>
                                        <div className="flex items-center gap-3.5 text-muted-foreground">
                                            {/* Layout Switcher */}
                                            <button 
                                                onClick={() => setViewStyle(prev => prev === 'grid' ? 'list' : 'grid')}
                                                className="p-1 hover:text-foreground transition-colors"
                                                title="Switch layout"
                                            >
                                                {viewStyle === 'grid' ? (
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <line x1="8" y1="6" x2="21" y2="6"/>
                                                        <line x1="8" y1="12" x2="21" y2="12"/>
                                                        <line x1="8" y1="18" x2="21" y2="18"/>
                                                        <rect x="3" y="5" width="2" height="2" rx="0.5"/>
                                                        <rect x="3" y="11" width="2" height="2" rx="0.5"/>
                                                        <rect x="3" y="15" width="2" height="2" rx="0.5"/>
                                                    </svg>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <rect x="3" y="3" width="7" height="7"/>
                                                        <rect x="14" y="3" width="7" height="7"/>
                                                        <rect x="14" y="14" width="7" height="7"/>
                                                        <rect x="3" y="14" width="7" height="7"/>
                                                    </svg>
                                                )}
                                            </button>
                                            <button
                                                onClick={() => setSearchQuery("")}
                                                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                                                title="Clear search"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                    
                                    {/* Matching Courses */}
                                    {displaySearchCourses.length > 0 && (
                                        <div className="space-y-3">
                                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60 pl-1">
                                                Courses ({displaySearchCourses.length})
                                            </span>
                                            <div className="grid grid-cols-2 gap-3.5">
                                                {displaySearchCourses.map(folder => (
                                                    <div
                                                        key={`search-mob-folder-card-${folder}`}
                                                        onClick={() => {
                                                            selectCourse(folder);
                                                            setSearchQuery("");
                                                        }}
                                                        className="flex flex-col p-4 rounded-2xl border border-border/80 bg-surface-secondary hover:bg-surface-secondary/80 cursor-pointer transition-all duration-150 group"
                                                    >
                                                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-3 group-hover:scale-105 transition-transform">
                                                            <FolderOpen className="h-5 w-5" />
                                                        </div>
                                                        <span className="text-sm font-extrabold text-foreground group-hover:text-primary transition-colors">
                                                            {folder}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground mt-1">
                                                            {courseStats[folder] || 0} {courseStats[folder] === 1 ? 'document' : 'documents'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Matching Documents */}
                                    <div className="space-y-3 flex-1">
                                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60 pl-1">
                                            Documents ({displaySearchDocs.length})
                                        </span>
                                        {displaySearchDocs.length > 0 ? (
                                            renderCollection(displaySearchDocs)
                                        ) : (
                                            displaySearchCourses.length === 0 && (
                                                <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground flex flex-col items-center justify-center py-12">
                                                    <Search className="h-8 w-8 mb-2 opacity-35" />
                                                    <p className="font-semibold text-foreground">No matches found</p>
                                                    <p className="text-xs text-muted-foreground/80 mt-1">Try searching for another term.</p>
                                                </div>
                                            )
                                        )}
                                    </div>
                                </div>
                            ) : (
                                /* NORMAL TABBED CONTENT FOR MOBILE */
                                <>
                                    {/* 2. View Tab Bar: Tab header inside a rounded content panel */}
                                    <div className="flex gap-8 px-6 pt-5 pb-3">
                                        <button 
                                            onClick={() => selectTab('recent')}
                                            className="relative pb-2"
                                        >
                                            <span className={`text-base transition-all ${activeTab === 'recent' ? 'font-bold text-foreground' : 'font-normal text-muted-foreground'}`}>
                                                Recent
                                            </span>
                                            {activeTab === 'recent' && (
                                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[3px] bg-primary rounded-full" />
                                            )}
                                        </button>
                                        <button 
                                            onClick={() => selectTab('courses')}
                                            className="relative pb-2"
                                        >
                                            <span className={`text-base transition-all ${activeTab === 'courses' ? 'font-bold text-foreground' : 'font-normal text-muted-foreground'}`}>
                                                Courses
                                            </span>
                                            {activeTab === 'courses' && (
                                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[3px] bg-primary rounded-full" />
                                            )}
                                        </button>
                                    </div>

                                    {/* Main Listings inside mobile wrapper */}
                                    <div className="flex-1 px-4 py-2">
                                        {loading ? (
                                            <div className="grid grid-cols-2 gap-3.5 py-4">
                                                {[1, 2, 3, 4].map(i => (
                                                    <div key={i} className="aspect-[4/3] rounded-xl bg-surface-secondary/40 animate-pulse"></div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="space-y-6">
                                                {/* TAB 1: RECENT GROUP */}
                                                {activeTab === 'recent' && (
                                                    <div className="space-y-6">
                                                        {/* Mobile Recent Actions Row */}
                                                        <div className="flex items-center justify-between pl-1">
                                                            <span className="text-[13px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                                                                Recent Documents
                                                            </span>
                                                            <div className="flex items-center gap-3.5 text-muted-foreground">
                                                                {/* Toggle Grid/List */}
                                                                <button 
                                                                    onClick={() => setViewStyle(prev => prev === 'grid' ? 'list' : 'grid')}
                                                                    className="p-1 hover:text-foreground transition-colors"
                                                                    title="Switch layout"
                                                                >
                                                                    {viewStyle === 'grid' ? (
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                            <line x1="8" y1="6" x2="21" y2="6"/>
                                                                            <line x1="8" y1="12" x2="21" y2="12"/>
                                                                            <line x1="8" y1="18" x2="21" y2="18"/>
                                                                            <rect x="3" y="5" width="2" height="2" rx="0.5"/>
                                                                            <rect x="3" y="11" width="2" height="2" rx="0.5"/>
                                                                            <rect x="3" y="15" width="2" height="2" rx="0.5"/>
                                                                        </svg>
                                                                    ) : (
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                            <rect x="3" y="3" width="7" height="7"/>
                                                                            <rect x="14" y="3" width="7" height="7"/>
                                                                            <rect x="14" y="14" width="7" height="7"/>
                                                                            <rect x="3" y="14" width="7" height="7"/>
                                                                        </svg>
                                                                    )}
                                                                </button>
                                                                {/* Filter Toggle */}
                                                                <button
                                                                    onClick={() => setShowMobileFilters(prev => !prev)}
                                                                    className={`p-1 hover:text-foreground transition-all ${
                                                                        showMobileFilters ? 'text-primary' : 'text-muted-foreground'
                                                                    }`}
                                                                    title="Toggle Filters"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {Object.entries(recentGroups).map(([dateGroup, items]) => 
                                                            items.length > 0 ? (
                                                                <div key={dateGroup} className="space-y-3.5">
                                                                    <div className="flex items-center justify-between pl-1">
                                                                        <span className="text-[13px] font-semibold text-muted-foreground/80">
                                                                            {dateGroup}
                                                                        </span>
                                                                    </div>
                                                                    {renderCollection(items)}
                                                                </div>
                                                            ) : null
                                                        )}
                                                        {recentDocs.length === 0 && (
                                                            <div className="rounded-2xl border border-dashed border-border/60 p-6 text-center bg-card/25 shadow-sm flex flex-col items-center justify-center">
                                                                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-4">
                                                                    <BookOpen className="h-6 w-6 text-primary" />
                                                                </div>
                                                                <h4 className="text-[15px] font-bold text-foreground">Welcome to your Library</h4>
                                                                <p className="text-xs text-muted-foreground mt-1.5 max-w-[240px] leading-relaxed mx-auto">
                                                                    Your recently read documents will appear here. Tap the button below to browse your courses.
                                                                </p>
                                                                <button
                                                                    onClick={() => selectTab('courses')}
                                                                    className="mt-4 bg-primary text-primary-foreground text-xs font-bold px-4 py-2 rounded-xl shadow hover:bg-primary/95 transition-all"
                                                                >
                                                                    Browse Course Folders
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* TAB 2: COURSES SYSTEM */}
                                                {activeTab === 'courses' && (
                                                    <div className="space-y-4">
                                                        {!activeCourse ? (
                                                            // Course folders list/grid
                                                            <div className="space-y-3.5">
                                                                <div className="flex items-center justify-between pl-1">
                                                                    <span className="text-[13px] font-medium text-muted-foreground">
                                                                        All Courses
                                                                    </span>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-3.5">
                                                                    {courseFolders.map(folder => (
                                                                        <div
                                                                            key={`mob-folder-card-${folder}`}
                                                                            onClick={() => selectCourse(folder)}
                                                                            className="flex flex-col p-4 rounded-2xl border border-border/80 bg-surface-secondary hover:bg-surface-secondary/80 cursor-pointer transition-all duration-150 group"
                                                                        >
                                                                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-3 group-hover:scale-105 transition-transform">
                                                                                <FolderOpen className="h-5 w-5" />
                                                                            </div>
                                                                            <span className="text-sm font-extrabold text-foreground group-hover:text-primary transition-colors">
                                                                                {folder}
                                                                            </span>
                                                                            <span className="text-xs text-muted-foreground mt-1">
                                                                                {courseStats[folder] || 0} {courseStats[folder] === 1 ? 'document' : 'documents'}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                {courseFolders.length === 0 && (
                                                                    <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                                                                        No courses found.
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            // Documents under the selected course
                                                            <div className="space-y-3.5">
                                                                <div className="flex items-center justify-between pl-1">
                                                                    <button
                                                                        onClick={() => router.push('/reader?tab=courses')}
                                                                        className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
                                                                    >
                                                                        <ArrowLeft className="h-3.5 w-3.5" />
                                                                        <span>Back to Courses</span>
                                                                    </button>
                                                                    <div className="flex items-center gap-3.5 text-muted-foreground">
                                                                        <button 
                                                                            onClick={() => setViewStyle(prev => prev === 'grid' ? 'list' : 'grid')}
                                                                            className="p-1 hover:text-foreground transition-colors"
                                                                        >
                                                                            {viewStyle === 'grid' ? (
                                                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                                    <line x1="8" y1="6" x2="21" y2="6"/>
                                                                                    <line x1="8" y1="12" x2="21" y2="12"/>
                                                                                    <line x1="8" y1="18" x2="21" y2="18"/>
                                                                                    <rect x="3" y="5" width="2" height="2" rx="0.5"/>
                                                                                    <rect x="3" y="11" width="2" height="2" rx="0.5"/>
                                                                                    <rect x="3" y="15" width="2" height="2" rx="0.5"/>
                                                                                </svg>
                                                                            ) : (
                                                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                                    <rect x="3" y="3" width="7" height="7"/>
                                                                                    <rect x="14" y="3" width="7" height="7"/>
                                                                                    <rect x="14" y="14" width="7" height="7"/>
                                                                                    <rect x="3" y="14" width="7" height="7"/>
                                                                                </svg>
                                                                            )}
                                                                        </button>
                                                                        {/* Filter Toggle beside list/grid toggle inside Course */}
                                                                        <button
                                                                            onClick={() => setShowMobileFilters(prev => !prev)}
                                                                            className={`p-1 hover:text-foreground transition-all ${
                                                                                showMobileFilters ? 'text-primary' : 'text-muted-foreground'
                                                                            }`}
                                                                            title="Toggle Filters"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                                                                            </svg>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                <h3 className="text-sm font-bold text-foreground pl-1 mb-2">
                                                                    {activeCourse}
                                                                    {activeCourseTitle && (
                                                                        <span className="ml-1.5">
                                                                            · {activeCourseTitle}
                                                                        </span>
                                                                    )}
                                                                </h3>
                                                                <div className="space-y-5">
                                                                    {currentCourseDocs.length > 0 && (
                                                                        <div className="space-y-2">
                                                                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground pl-1">
                                                                                Current Materials
                                                                            </span>
                                                                            {renderCollection(currentCourseDocs)}
                                                                        </div>
                                                                    )}
                                                                    {pastCourseDocs.length > 0 && (
                                                                        <div className="space-y-2">
                                                                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground pl-1">
                                                                                Past Materials
                                                                            </span>
                                                                            {renderCollection(pastCourseDocs)}
                                                                        </div>
                                                                    )}
                                                                    {currentCourseDocs.length === 0 && pastCourseDocs.length === 0 && (
                                                                        <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                                                                            No materials found in this course.
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* DESKTOP MAIN WINDOW VIEWS */}
                    <div className="hidden md:block flex-1 overflow-y-auto px-6 py-4">
                        {loading && (
                            <div className="grid grid-cols-2 gap-6 md:grid-cols-5 py-8">
                                {[1, 2, 3, 4, 5].map(i => (
                                    <div key={i} className="h-32 rounded-2xl bg-muted/65 animate-pulse"></div>
                                ))}
                            </div>
                        )}

                        {!loading && !error && (
                            searchQuery.trim() ? (
                                /* GLOBAL SEARCH RESULTS VIEW FOR DESKTOP */
                                <div className="space-y-6 animate-in fade-in duration-150">
                                    <div className="flex items-center justify-between border-b border-border/40 pb-3">
                                        <h2 className="text-xl font-bold tracking-tight text-foreground font-outfit">
                                            Search Results
                                        </h2>
                                        <button
                                            onClick={() => setSearchQuery("")}
                                            className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                            <span>Clear Search</span>
                                        </button>
                                    </div>

                                    {/* Matching Courses */}
                                    {displaySearchCourses.length > 0 && (
                                        <div className="space-y-3">
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 pl-1">
                                                Courses ({displaySearchCourses.length})
                                            </h3>
                                            <div className="grid grid-cols-2 gap-3.5 md:grid-cols-5">
                                                {displaySearchCourses.map(folder => (
                                                    <div
                                                        key={`search-folder-card-${folder}`}
                                                        onClick={() => {
                                                            selectCourse(folder);
                                                            setSearchQuery("");
                                                        }}
                                                        className="flex flex-col p-4 rounded-2xl border border-border/80 bg-surface-secondary hover:bg-surface-secondary/80 cursor-pointer transition-all duration-150 group"
                                                    >
                                                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-3 group-hover:scale-105 transition-transform">
                                                            <FolderOpen className="h-5 w-5" />
                                                        </div>
                                                        <span className="text-sm font-extrabold text-foreground group-hover:text-primary transition-colors">
                                                            {folder}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground mt-1">
                                                            {courseStats[folder] || 0} {courseStats[folder] === 1 ? 'document' : 'documents'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Matching Documents */}
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 pl-1">
                                            Documents ({displaySearchDocs.length})
                                        </h3>
                                        {displaySearchDocs.length > 0 ? (
                                            renderCollection(displaySearchDocs)
                                        ) : (
                                            displaySearchCourses.length === 0 && (
                                                <div className="rounded-2xl border border-dashed border-border/80 p-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center">
                                                    <Search className="h-10 w-10 mb-2 opacity-35" />
                                                    <p className="font-semibold text-foreground">No matches found</p>
                                                    <p className="text-xs text-muted-foreground/80 mt-1">Try checking your spelling or search for another term.</p>
                                                </div>
                                            )
                                        )}
                                    </div>
                                </div>
                            ) : docs.length > 0 ? (
                                /* NORMAL TABBED CONTENT FOR DESKTOP */
                                <div className="space-y-6 animate-in fade-in">
                                    {activeTab === 'recent' && (
                                        recentDocs.length > 0 ? (
                                            <div className="space-y-6">
                                                {Object.entries(recentGroups).map(([dateGroup, items]) => {
                                                    if (items.length === 0) return null;
                                                    return (
                                                        <div key={dateGroup} className="space-y-2">
                                                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 pl-1">
                                                                {dateGroup}
                                                            </h3>
                                                            {renderCollection(items)}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            /* Desktop empty state for first-time user */
                                            <div className="flex flex-col items-center justify-center border border-dashed border-border/80 rounded-2xl p-12 text-center max-w-xl mx-auto my-12 bg-card/25 shadow-sm">
                                                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-5 shadow-inner">
                                                    <BookOpen className="h-8 w-8 text-primary animate-pulse" />
                                                </div>
                                                <h3 className="text-xl font-bold tracking-tight text-foreground font-outfit">Welcome to your PansGPT Library</h3>
                                                <p className="text-sm text-muted-foreground mt-2 max-w-sm leading-relaxed">
                                                    Your recently read course materials will appear here once you open them. Select a course from the sidebar to browse your documents.
                                                </p>
                                                {courseFolders.length > 0 && (
                                                    <button
                                                        onClick={() => selectCourse(courseFolders[0])}
                                                        className="mt-6 inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-5 py-2.5 rounded-xl hover:bg-primary/95 shadow-md active:scale-[0.98] transition-all"
                                                    >
                                                        <span>Explore Courses</span>
                                                        <ChevronRight className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        )
                                    )}

                                    {activeTab === 'starred' && (
                                        <div className="space-y-2">
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 pl-1">
                                                Starred Documents
                                            </h3>
                                            {displayStarredDocs.length > 0 ? (
                                                renderCollection(displayStarredDocs)
                                            ) : (
                                                <div className="rounded-2xl border border-dashed border-border/80 p-8 text-center text-sm text-zinc-500">
                                                    No starred documents yet.
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {activeTab === 'other' && (
                                        <div className="space-y-2">
                                            {renderCollection(displayOtherDocs)}
                                        </div>
                                    )}

                                    {activeCourse && (
                                        <div className="space-y-6">
                                            {currentCourseDocs.length > 0 && (
                                                <div className="space-y-2">
                                                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/85 pl-1">
                                                        Current Materials
                                                    </h3>
                                                    {renderCollection(currentCourseDocs)}
                                                </div>
                                            )}
                                            {pastCourseDocs.length > 0 && (
                                                <div className="space-y-2">
                                                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/85 pl-1">
                                                        Past Materials
                                                    </h3>
                                                    {renderCollection(pastCourseDocs)}
                                                </div>
                                            )}
                                            {currentCourseDocs.length === 0 && pastCourseDocs.length === 0 && (
                                                <div className="rounded-2xl border border-dashed border-border/80 p-8 text-center text-sm text-muted-foreground">
                                                    No materials found in this course.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-dashed border-border/80 p-12 text-center text-sm text-muted-foreground">
                                    No documents found.
                                </div>
                            )
                        )}
                    </div>
                </div>
            </section>

            {/* 3. RIGHT DETAILS SIDEBAR - DESKTOP ONLY */}
            <aside className="hidden xl:flex flex-col w-80 shrink-0 border-l border-border/60 bg-card/35 backdrop-blur-md overflow-y-auto">
                {selectedDoc ? (
                    <div className="p-6 flex flex-col h-full">
                        {/* Header Details */}
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">File Information</h3>
                            <button
                                onClick={() => setSelectedDoc(null)}
                                className="p-1 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X className="h-4.5 w-4.5" />
                            </button>
                        </div>

                        {/* Large Preview */}
                        <div className="flex flex-col items-center justify-center p-8 bg-muted/30 border border-border/40 rounded-2xl mb-6 text-center">
                            <div className="w-full aspect-[4/3] rounded-xl overflow-hidden shadow-sm">
                                <DocumentThumbnail doc={selectedDoc} />
                            </div>
                        </div>

                        {/* Title and stats */}
                        <div className="space-y-4 flex-1">
                            <div>
                                <h2 className="text-lg font-bold tracking-tight text-foreground leading-tight font-outfit">{selectedDoc.topic}</h2>
                                <p className="text-xs text-muted-foreground mt-1 truncate">{selectedDoc.title}</p>
                            </div>

                            <hr className="border-border/40" />

                            <div className="space-y-2.5 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Course Code</span>
                                    <span className="font-semibold">{selectedDoc.course_code}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Lecturer</span>
                                    <span className="font-semibold">{selectedDoc.lecturer_name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">File Size</span>
                                    <span className="font-semibold">{formatSize(selectedDoc.file_size)}</span>
                                </div>
                                {selectedDoc.academic_session && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Session</span>
                                        <span className="font-semibold">{selectedDoc.academic_session}</span>
                                    </div>
                                )}
                                {selectedDoc.semester && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Semester</span>
                                        <span className="font-semibold">{formatSemester(selectedDoc.semester)}</span>
                                    </div>
                                )}
                            </div>

                            <hr className="border-border/40" />

                            {progressMap[selectedDoc.drive_file_id] && (
                                <div className="space-y-2">
                                    <span className="text-xs text-muted-foreground font-semibold">READING PROGRESS</span>
                                    {(() => {
                                        const prog = progressMap[selectedDoc.drive_file_id];
                                        const pct = Math.round((prog.current_page / prog.total_pages) * 100);
                                        return (
                                            <div className="space-y-1.5">
                                                <div className="flex justify-between text-xs font-semibold">
                                                    <span>{pct}% complete</span>
                                                    <span>{prog.current_page} / {prog.total_pages} pages</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                                    <div 
                                                        className="h-full bg-primary rounded-full transition-all duration-300"
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>

                        {/* Action CTA */}
                        <div className="mt-8">
                            <button
                                onClick={() => handleOpenReader(selectedDoc)}
                                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold py-3 px-4 rounded-xl shadow-md hover:bg-primary/95 transition-all active:scale-[0.98]"
                            >
                                <Eye className="h-4.5 w-4.5" />
                                <span>Open Document</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                        <div className="w-12 h-12 rounded-xl border border-dashed border-border/80 flex items-center justify-center text-muted-foreground mb-4">
                            <Info className="h-5 w-5 opacity-60" />
                        </div>
                        <h4 className="text-sm font-bold text-foreground font-outfit">Document Details</h4>
                        <p className="text-xs mt-1.5 max-w-[190px] leading-relaxed">Select a document card from the library to view detailed metadata and your reading progress here.</p>
                    </div>
                )}
            </aside>
        </div>
    );

    // Responsive Collection Renderer supporting list and grid toggle layouts
    function renderCollection(items: PDFDocument[]) {
        const isStarred = (fileId: string) => starredIds.includes(fileId);

        return (
            <>
                {viewStyle === 'grid' ? (
                    /* 2-COLUMN GRID ON MOBILE, 5-COLUMN GRID ON DESKTOP */
                    <div className="grid grid-cols-2 gap-3.5 md:grid-cols-5">
                        {items.map((item) => {
                            const hasStarred = isStarred(item.drive_file_id);
                            return (
                                <div
                                    key={item.id}
                                    onClick={() => {
                                        if (window.innerWidth >= 768) {
                                            selectDocument(item);
                                        } else {
                                            handleOpenReader(item);
                                        }
                                    }}
                                    className={`group flex flex-col rounded-xl border transition-all duration-150 cursor-pointer overflow-hidden ${
                                        selectedDoc?.id === item.id ? 'border-primary bg-primary/[0.015]' : 'border-border/80 bg-surface-secondary hover:bg-surface-secondary/80'
                                    }`}
                                >
                                    {/* Thumbnail box with star icon - NO INNER CARD PADDING */}
                                    <div className="relative w-full aspect-[4/3] overflow-hidden shrink-0 border-b border-zinc-850">
                                        <DocumentThumbnail doc={item} />
                                        
                                        {/* Star icon at the top-right corner of thumbnail */}
                                        <button
                                            onClick={(e) => toggleStar(e, item.drive_file_id)}
                                            className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors backdrop-blur-[2px]"
                                        >
                                            <Star 
                                                className="h-3.5 w-3.5" 
                                                fill={hasStarred ? "#fbbc05" : "none"} 
                                                stroke={hasStarred ? "#fbbc05" : "currentColor"} 
                                            />
                                        </button>
                                    </div>
 
                                    {/* Card metadata line - Padded bottom section */}
                                    <div className="flex items-center justify-between py-2 px-2.5 min-w-0 gap-1.5 bg-surface-secondary/40">
                                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                            {/* Standardized document icon / loader */}
                                            <span className="w-4.5 h-4.5 flex items-center justify-center rounded-md shrink-0 border border-primary/20 bg-primary/10 text-primary select-none">
                                                {loadingDocId === item.drive_file_id ? (
                                                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                                ) : (
                                                    <FileText className="h-3 w-3" />
                                                )}
                                            </span>
                                            <span className="text-[11px] font-bold text-foreground leading-tight line-clamp-2 flex-1 group-hover:text-primary transition-colors">
                                                {item.topic}
                                            </span>
                                        </div>
                                        
                                        {/* Three vertical dots menu options */}
                                        <button className="text-muted-foreground/75 hover:text-foreground shrink-0 p-0.5">
                                            <MoreVertical className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* WPS LIST VIEW - No outer border card wrapper on mobile */
                    <div className="overflow-hidden">
                        {/* Desktop labels */}
                        <div className="hidden md:grid grid-cols-[1.5fr_1fr_1fr_0.6fr] gap-4 px-4 py-3 border-b border-border/40 text-xs font-semibold text-muted-foreground uppercase">
                            <span>Name</span>
                            <span>Lecturer</span>
                            <span>Last Opened</span>
                            <span className="text-right">Size</span>
                        </div>
                        
                        <div className="divide-y divide-border/20">
                            {items.map((item) => {
                                const prog = progressMap[item.drive_file_id];
                                const hasStarred = isStarred(item.drive_file_id);
                                return (
                                    <div key={item.id}>
                                        {/* Mobile view layout - simplified, matching image exactly */}
                                        <div
                                            onClick={() => handleOpenReader(item)}
                                            className="md:hidden flex items-center justify-between py-3.5 px-3 cursor-pointer transition-all active:bg-accent/40"
                                        >
                                            <div className="flex items-center gap-3.5 min-w-0">
                                                {/* Standardized document icon / loader - w-10 h-10 */}
                                                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-primary/20 bg-primary/10 text-primary shadow-sm select-none">
                                                    {loadingDocId === item.drive_file_id ? (
                                                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                                    ) : (
                                                        <FileText className="h-5 w-5" />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex flex-col gap-0.5">
                                                    <h4 className="text-[14px] font-bold text-foreground truncate leading-tight">
                                                        {item.topic}
                                                    </h4>
                                                    <div className="flex items-center gap-2.5 text-[11px] font-medium text-muted-foreground/80">
                                                        <span>
                                                            {item.created_at 
                                                                ? new Date(item.created_at).toISOString().split('T')[0] 
                                                                : (prog?.updated_at ? new Date(prog.updated_at).toISOString().split('T')[0] : '2026-06-19')}
                                                        </span>
                                                        <span>{formatSize(item.file_size)}</span>
                                                        <span className="truncate max-w-[120px]">{item.lecturer_name ? `From ${item.lecturer_name}` : 'From iPhone'}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Reading progress circle */}
                                            {prog && prog.total_pages > 0 && (
                                                <div className="shrink-0 flex items-center justify-center pl-3">
                                                    {(() => {
                                                        const pct = Math.round((prog.current_page / prog.total_pages) * 100);
                                                        const size = 32;
                                                        const strokeWidth = 2.5;
                                                        const center = size / 2;
                                                        const r = (size - strokeWidth) / 2 - 2;
                                                        const circumference = 2 * Math.PI * r;
                                                        const strokeDashoffset = circumference - (pct / 100) * circumference;

                                                        return (
                                                            <div className="relative flex items-center justify-center w-8 h-8" title={`${pct}% read`}>
                                                                <svg className="w-8 h-8 transform -rotate-90">
                                                                    <circle
                                                                        className="text-muted/20"
                                                                        strokeWidth={strokeWidth}
                                                                        stroke="currentColor"
                                                                        fill="transparent"
                                                                        r={r}
                                                                        cx={center}
                                                                        cy={center}
                                                                    />
                                                                    <circle
                                                                        className="text-primary transition-all duration-300"
                                                                        strokeWidth={strokeWidth}
                                                                        strokeDasharray={`${circumference} ${circumference}`}
                                                                        style={{ strokeDashoffset }}
                                                                        strokeLinecap="round"
                                                                        stroke="currentColor"
                                                                        fill="transparent"
                                                                        r={r}
                                                                        cx={center}
                                                                        cy={center}
                                                                    />
                                                                </svg>
                                                                <span className="absolute text-[8px] font-extrabold text-foreground">
                                                                    {pct}
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            )}
                                        </div>

                                        {/* Desktop view layout - preserved */}
                                        <div
                                            onClick={() => {
                                                if (window.innerWidth >= 768) {
                                                    selectDocument(item);
                                                } else {
                                                    handleOpenReader(item);
                                                }
                                            }}
                                            className={`hidden md:grid md:grid-cols-[1.5fr_1fr_1fr_0.6fr] gap-2 md:gap-4 px-4 py-3 cursor-pointer transition-all duration-150 hover:bg-accent/40 group ${
                                                selectedDoc?.id === item.id ? 'bg-primary/5 border-l-4 border-primary pl-3' : ''
                                            }`}
                                        >
                                            {/* Left Side: Icon + Title */}
                                            <div className="flex items-center justify-between md:contents">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    {/* Standardized document icon / loader */}
                                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-primary/20 bg-primary/10 text-primary shadow-sm select-none">
                                                        {loadingDocId === item.drive_file_id ? (
                                                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                                        ) : (
                                                            <FileText className="h-5 w-5" />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className="text-sm font-semibold truncate group-hover:text-primary transition-colors pr-2">
                                                            {item.topic}
                                                        </h4>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase shrink-0">
                                                                {item.course_code}
                                                            </span>
                                                            {prog && (
                                                                <span className="text-[10px] text-muted-foreground font-medium truncate">
                                                                    Page {prog.current_page}/{prog.total_pages} ({Math.round((prog.current_page / prog.total_pages) * 100)}%)
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Star action (Mobile only inline) */}
                                                <button 
                                                    onClick={(e) => toggleStar(e, item.drive_file_id)}
                                                    className="md:hidden text-muted-foreground hover:text-[#fbbc05] p-1.5"
                                                >
                                                    <Star className="h-4 w-4" fill={hasStarred ? "#fbbc05" : "none"} stroke={hasStarred ? "#fbbc05" : "currentColor"} />
                                                </button>
                                            </div>

                                            {/* Lecturer column */}
                                            <div className="flex items-center text-xs md:text-sm text-muted-foreground min-w-0 md:pl-0 pl-9">
                                                <span className="truncate">{item.lecturer_name}</span>
                                            </div>

                                            {/* Last Opened column */}
                                            <div className="text-xs md:text-sm text-muted-foreground md:pl-0 pl-9">
                                                {prog?.updated_at 
                                                    ? new Date(prog.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) 
                                                    : 'Unread'}
                                            </div>

                                            {/* Size column */}
                                            <div className="text-xs md:text-sm text-muted-foreground md:text-right font-medium md:pl-0 pl-9 md:block flex justify-between">
                                                <span className="md:hidden text-muted-foreground font-normal">Size: </span>
                                                <span>{formatSize(item.file_size)}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </>
        );
    }
}
