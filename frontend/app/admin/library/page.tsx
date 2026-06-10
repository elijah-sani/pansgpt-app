'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

import {
    Search, Filter, Plus, FileText, Trash2, Pencil, Square,
    AlertCircle, Loader2,
    UploadCloud, HardDrive, BookOpen, X,
    Sparkles, Clock, MoreVertical, Archive
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { SystemStatusBadge } from '../../../components/SystemStatusBadge';
import { api } from '@/lib/api';
import { getAdminWorkspaceUniversityId } from '@/lib/admin-workspace';
import { fetchBootstrap } from '@/lib/bootstrap-cache';

// --- Types ---
type MaterialStatus = 'active' | 'archived';

interface Document {
    id: string;
    drive_file_id: string;
    course_code: string;
    title: string;
    topic: string;
    lecturer: string;
    date: string;
    file_size: number;
    uploaded_by: {
        name: string; // Initials
        email: string;
    };
    embedding_status: 'pending' | 'processing' | 'completed' | 'failed';
    embedding_progress: number;
    embedding_error?: string; // For partial success or failure details
    ingestion_worker_heartbeat_at?: string | null;
    total_chunks: number;
    target_levels?: string[];
    academic_session?: string;
    semester?: string;
    department?: string;
    faculty?: string;
    material_status?: MaterialStatus;
    source_type?: string;
    version_label?: string;
}

interface AIBadgeConfig {
    style: string;
    icon: LucideIcon;
    text: string;
    tooltip: string;
}

interface StatsCardProps {
    icon: LucideIcon;
    label: string;
    value: string;
    trend?: string;
    sub?: string;
    color: string;
    progress?: number;
}

interface FormInputProps {
    label: string;
    name: string;
    placeholder?: string;
    value: string;
    required?: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

interface MobileQuickStatCardProps {
    icon: LucideIcon;
    label: string;
    value: string;
    color: string;
    bg: string;
}

interface FormSelectProps {
    label: string;
    name: string;
    value: string;
    options: Array<{ value: string; label: string }>;
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}

const MATERIAL_STATUS_OPTIONS = [
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' }
];

const SEMESTER_OPTIONS = [
    { value: '', label: 'Not set' },
    { value: 'first', label: 'First Semester' },
    { value: 'second', label: 'Second Semester' }
];

function normalizeMaterialStatus(value?: string | null): MaterialStatus {
    return value === 'archived' ? 'archived' : 'active';
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

function MaterialStatusBadge({ status }: { status?: MaterialStatus | string | null }) {
    const normalized = normalizeMaterialStatus(status);
    const isArchived = normalized === 'archived';
    return (
        <span
            className={`max-w-full truncate rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                isArchived
                    ? 'border-slate-500/20 bg-slate-500/10 text-slate-500'
                    : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
            }`}
            title={isArchived ? 'Archived' : 'Active'}
        >
            {isArchived ? 'Archived' : 'Active'}
        </span>
    );
}

export default function LibraryPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [editingDoc, setEditingDoc] = useState<Document | null>(null);
    const [mobileDetailsDoc, setMobileDetailsDoc] = useState<Document | null>(null);
    const [mobileMenuDocId, setMobileMenuDocId] = useState<string | null>(null);
    const [desktopMenuDocId, setDesktopMenuDocId] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Document | null>(null); // Store full doc object
    const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());
    const [reembeddingIds, setReembeddingIds] = useState<Set<string>>(new Set());
    const [documents, setDocuments] = useState<Document[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    // Filters
    const [filterLevel, setFilterLevel] = useState('All');
    const [filterSort, setFilterSort] = useState('Newest');
    const [filterStatus, setFilterStatus] = useState<'All' | MaterialStatus>('All');
    const [filterSession, setFilterSession] = useState('All');
    const [filterSemester, setFilterSemester] = useState<'All' | 'first' | 'second'>('All');
    const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
    const [pendingFilterLevel, setPendingFilterLevel] = useState('All');
    const [pendingFilterSort, setPendingFilterSort] = useState('Newest');
    const [pendingFilterSession, setPendingFilterSession] = useState('All');
    const [pendingFilterSemester, setPendingFilterSemester] = useState<'All' | 'first' | 'second'>('All');
    const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
    const [currentAcademicContext, setCurrentAcademicContext] = useState<{ current_academic_session?: string | null; current_semester?: string | null } | null>(null);
    const advancedFiltersRef = useRef<HTMLDivElement | null>(null);
    const statusMenuRef = useRef<HTMLDivElement | null>(null);

    const LEVEL_OPTIONS = ['All', '100', '200', '300', '400', '500'];
    const SORT_OPTIONS = ['Newest', 'Oldest'];
    const STATUS_FILTER_OPTIONS: Array<{ value: 'All' | MaterialStatus; label: string }> = [
        { value: 'All', label: 'All Status' },
        { value: 'active', label: 'Active' },
        { value: 'archived', label: 'Archived' },
    ];
    const sessionOptions = useMemo(
        () => ['All', ...Array.from(new Set(documents.map((doc) => doc.academic_session).filter((value): value is string => Boolean(value && value.trim())))).sort().reverse()],
        [documents]
    );
    const activeFilterChips = useMemo(() => {
        const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
        if (filterStatus !== 'All') chips.push({ key: 'status', label: `Status: ${filterStatus === 'active' ? 'Active' : 'Archived'}`, onClear: () => setFilterStatus('All') });
        if (filterLevel !== 'All') chips.push({ key: 'level', label: `Level: ${filterLevel}`, onClear: () => setFilterLevel('All') });
        if (filterSession !== 'All') chips.push({ key: 'session', label: `Session: ${filterSession}`, onClear: () => setFilterSession('All') });
        if (filterSemester !== 'All') chips.push({ key: 'semester', label: `Semester: ${filterSemester === 'first' ? 'First' : 'Second'}`, onClear: () => setFilterSemester('All') });
        if (filterSort !== 'Newest') chips.push({ key: 'sort', label: `Sort: ${filterSort}`, onClear: () => setFilterSort('Newest') });
        return chips;
    }, [filterStatus, filterLevel, filterSession, filterSemester, filterSort]);

    // We can get user from session here if needed for upload attribution, 
    // or pass it down via context. For now, let's fetch session quickly to get email.
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [canUploadMaterials, setCanUploadMaterials] = useState(false);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);

    useEffect(() => {
        const getSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.email) {
                setUserEmail(session.user.email);
            }
            const bootstrap = await fetchBootstrap();
            setIsSuperAdmin(Boolean(bootstrap?.is_super_admin));
            setCanUploadMaterials(Boolean(bootstrap?.is_super_admin || bootstrap?.is_university_admin));
        };
        getSession();
    }, []);

    // --- Data Fetching ---
    const fetchDocuments = useCallback(async (isSilent = false) => {
        if (!userEmail) return;
        if (isSuperAdmin && !getAdminWorkspaceUniversityId()) {
            setDocuments([]);
            setIsLoadingData(false);
            return;
        }
        if (!isSilent) setIsLoadingData(true);
        try {
            const response = await api.get('/admin/documents');
            if (!response.ok) throw new Error('Failed to fetch documents');
            const payload = await response.json();
            const data = payload?.documents || payload?.data || [];

            const formattedDocs: Document[] = (data || []).map((row: {
                id: string;
                drive_file_id: string;
                course_code: string;
                title: string;
                topic: string;
                lecturer_name: string;
                created_at: string;
                file_size?: number;
                uploaded_by_email?: string;
                embedding_status?: 'pending' | 'processing' | 'completed' | 'failed';
                embedding_progress?: number;
                embedding_error?: string;
                ingestion_worker_heartbeat_at?: string | null;
                total_chunks?: number;
                target_levels?: string[];
                academic_session?: string;
                semester?: string;
                department?: string;
                faculty?: string;
                material_status?: string;
                source_type?: string;
                version_label?: string;
            }) => {
                const status = row.embedding_status || 'pending';
                const progress = status === 'completed' ? 100 : (Number(row.embedding_progress) || 0);
                return {
                    id: row.id,
                    drive_file_id: row.drive_file_id,
                    course_code: row.course_code,
                    title: row.title,
                    topic: row.topic,
                    lecturer: row.lecturer_name, // Map DB column
                    date: new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                    file_size: row.file_size || 0,
                    uploaded_by: {
                        name: (row.uploaded_by_email || 'System').slice(0, 2).toUpperCase(),
                        email: row.uploaded_by_email || 'System'
                    },
                    embedding_status: status,
                    embedding_progress: progress,
                    embedding_error: row.embedding_error,
                    ingestion_worker_heartbeat_at: row.ingestion_worker_heartbeat_at,
                    total_chunks: Number(row.total_chunks) || 0,
                    target_levels: row.target_levels || [],
                    academic_session: row.academic_session || '',
                    semester: normalizeSemester(row.semester),
                    department: row.department || '',
                    faculty: row.faculty || '',
                    material_status: normalizeMaterialStatus(row.material_status),
                    source_type: row.source_type || 'admin',
                    version_label: row.version_label || ''
                };
            });

            setDocuments(formattedDocs);
        } catch (err) {
            console.error("Failed to fetch documents:", err);
        } finally {
            if (!isSilent) setIsLoadingData(false);
        }
    }, [userEmail, isSuperAdmin]);

    useEffect(() => {
        if (userEmail) fetchDocuments();
    }, [userEmail, fetchDocuments]);

    useEffect(() => {
        if (!userEmail) return;
        if (isSuperAdmin && !getAdminWorkspaceUniversityId()) return;
        let cancelled = false;
        api.get('/admin/academic-context')
            .then(async (response) => {
                if (!response.ok || cancelled) return;
                const payload = await response.json();
                const context = payload?.context || null;
                setCurrentAcademicContext(context);
                if (context?.current_academic_session) {
                    setFilterSession(context.current_academic_session);
                }
                const normalizedSemester = normalizeSemester(context?.current_semester);
                if (normalizedSemester) {
                    setFilterSemester(normalizedSemester);
                }
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [userEmail, isSuperAdmin]);

    useEffect(() => {
        if (!isAdvancedFiltersOpen && !isStatusMenuOpen) return;
        const handleOutsideClick = (event: MouseEvent) => {
            const target = event.target as Node;
            const clickedAdvanced = advancedFiltersRef.current?.contains(target);
            const clickedStatus = statusMenuRef.current?.contains(target);
            if (!clickedAdvanced) {
                setIsAdvancedFiltersOpen(false);
            }
            if (!clickedStatus) setIsStatusMenuOpen(false);
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
        };
    }, [isAdvancedFiltersOpen, isStatusMenuOpen]);

    // --- Background Polling for Processing Documents ---
    useEffect(() => {
        const hasProcessingDocs = documents.some(
            doc => doc.embedding_status === 'pending' || doc.embedding_status === 'processing'
        );

        if (!hasProcessingDocs) return;

        const intervalId = setInterval(() => {
            fetchDocuments(true);
        }, 3000); // Check every 3 seconds for smoother updates

        return () => clearInterval(intervalId);
    }, [documents, fetchDocuments]);

    // --- Computed Stats ---
    const totalDocs = documents.length;
    const activeCourses = new Set(documents.map(d => d.course_code)).size;
    const totalStorageBytes = documents.reduce((acc, d) => acc + d.file_size, 0);
    const storageUsedGB = (totalStorageBytes / (1024 * 1024 * 1024)).toFixed(2);
    const storagePercentage = Math.min(100, (totalStorageBytes / (1024 * 1024 * 1024 * 15)) * 100); // 15GB limit
    let storageColor = "bg-cyan-500";
    if (storagePercentage > 90) storageColor = "bg-red-500";
    else if (storagePercentage > 75) storageColor = "bg-amber-500";

    // --- Actions ---
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    // Filtered Docs for Select All
    const filteredDocs = documents
        .filter(doc => {
            const matchesSearch =
                doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                doc.course_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                doc.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
                doc.lecturer.toLowerCase().includes(searchQuery.toLowerCase());

            const matchesLevel = filterLevel === 'All' ||
                (doc.course_code && doc.course_code.match(/\d+/)?.[0]?.startsWith(filterLevel.charAt(0)));
            const matchesStatus = filterStatus === 'All' || normalizeMaterialStatus(doc.material_status) === filterStatus;
            const matchesSession = filterSession === 'All' || doc.academic_session === filterSession;
            const matchesSemester = filterSemester === 'All' || normalizeSemester(doc.semester) === filterSemester;

            return matchesSearch && matchesLevel && matchesStatus && matchesSession && matchesSemester;
        })
        .sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            return filterSort === 'Newest' ? dateB - dateA : dateA - dateB;
        });

    const isAllSelected = filteredDocs.length > 0 && selectedIds.size === filteredDocs.length;

    const toggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredDocs.map(d => d.id)));
        }
    };

    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const openAdvancedFilters = () => {
        setPendingFilterLevel(filterLevel);
        setPendingFilterSort(filterSort);
        setPendingFilterSession(filterSession);
        setPendingFilterSemester(filterSemester);
        setIsAdvancedFiltersOpen(true);
    };

    const applyAdvancedFilters = () => {
        setFilterLevel(pendingFilterLevel);
        setFilterSort(pendingFilterSort);
        setFilterSession(pendingFilterSession);
        setFilterSemester(pendingFilterSemester);
        setIsAdvancedFiltersOpen(false);
    };

    const clearAllFilters = () => {
        setPendingFilterLevel('All');
        setPendingFilterSort('Newest');
        setPendingFilterSession('All');
        setPendingFilterSemester('All');
        setFilterLevel('All');
        setFilterSort('Newest');
        setFilterStatus('All');
        setFilterSession('All');
        setFilterSemester('All');
        setIsAdvancedFiltersOpen(false);
    };


    const handleDelete = async () => {
        if (!deleteTarget) return;

        try {
            // 1. Delete from Backend (which handles both Drive and DB)
            const response = await api.delete(`/admin/documents/${deleteTarget.id}`);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Delete failed');
            }

            // 2. UI Update (Optimistic update or local state filter)
            setDocuments(prev => prev.filter(d => d.id !== deleteTarget.id));
            setDeleteTarget(null);

        } catch (err) {
            console.error("Delete failed:", err);
            alert("Failed to delete document. Check console.");
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        const confirmDelete = window.confirm(`Are you sure you want to delete ${selectedIds.size} documents? This cannot be undone.`);
        if (!confirmDelete) return;

        setIsLoadingData(true); // Re-use loading state for UI feedback
        try {
            // Execute all deletes in parallel
            await Promise.all(Array.from(selectedIds).map(async (id) => {
                const response = await api.delete(`/admin/documents/${id}`);
                if (!response.ok) {
                    console.error(`Failed to delete ${id}`);
                    // We continue even if one fails, to delete as many as possible
                }
            }));

            // Refresh data
            await fetchDocuments();
            setSelectedIds(new Set());

        } catch (err) {
            console.error("Bulk Delete failed:", err);
            alert("Some items may not have been deleted. Check console.");
        } finally {
            setIsLoadingData(false);
        }
    };

    const handleCancelIngestion = async (doc: Document) => {
        if (cancellingIds.has(doc.id)) return;
        setCancellingIds(prev => new Set(prev).add(doc.id));
        try {
            const response = await api.fetch(`/admin/documents/${doc.id}/cancel`, { method: 'POST' });
            if (response.ok) {
                setDocuments(prev => prev.map(d => d.id === doc.id
                    ? { ...d, embedding_status: 'failed', embedding_error: 'Cancelled by admin.' }
                    : d
                ));
            }
        } catch (err) {
            console.error('Cancel ingestion failed:', err);
        } finally {
            setCancellingIds(prev => { const s = new Set(prev); s.delete(doc.id); return s; });
        }
    };

    const handleToggleMaterialStatus = async (doc: Document) => {
        const nextStatus: MaterialStatus = normalizeMaterialStatus(doc.material_status) === 'archived' ? 'active' : 'archived';
        const previousStatus = normalizeMaterialStatus(doc.material_status);
        setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, material_status: nextStatus } : d));
        try {
            const response = await api.patch(`/admin/documents/${doc.id}`, { material_status: nextStatus });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Status update failed');
            }
        } catch (err) {
            console.error('Status update failed:', err);
            setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, material_status: previousStatus } : d));
            alert('Failed to update material status. Please try again.');
        }
    };

    const canShowReembedAction = (doc: Document) => {
        return (
            doc.embedding_status === 'pending' ||
            doc.embedding_status === 'processing' ||
            doc.embedding_status === 'completed' ||
            doc.embedding_status === 'failed' ||
            Boolean((doc.embedding_error || '').trim())
        );
    };

    const isStaleProcessingDocument = (doc: Document) => {
        if (doc.embedding_status !== 'processing' || !doc.ingestion_worker_heartbeat_at) return false;
        const heartbeatTime = new Date(doc.ingestion_worker_heartbeat_at).getTime();
        if (!Number.isFinite(heartbeatTime)) return false;
        return Date.now() - heartbeatTime > 15 * 60 * 1000;
    };

    const canRunReembedDocument = (doc: Document) => {
        return canShowReembedAction(doc)
            && (doc.embedding_status !== 'processing' || isStaleProcessingDocument(doc))
            && !reembeddingIds.has(doc.id);
    };

    const getReembedActionLabel = (doc: Document) => {
        if (doc.embedding_status === 'processing' && isStaleProcessingDocument(doc)) return 'Retry stale processing';
        if (doc.embedding_status === 'processing') return 'Processing…';
        if (reembeddingIds.has(doc.id)) return 'Restarting ingestion...';
        if (doc.embedding_status === 'completed') return 'Re-process';
        return 'Retry Processing';
    };

    const handleReembedDocument = async (doc: Document) => {
        if (!canRunReembedDocument(doc)) return;
        const isStaleRetry = isStaleProcessingDocument(doc);
        const confirmed = window.confirm(isStaleRetry
            ? 'Retry stale processing for this document? The previous worker appears inactive. A new ingestion run will invalidate the old worker and rebuild existing embeddings from the stored file.'
            : 'Rebuild AI processing for this document? Existing embeddings will be deleted and rebuilt from the stored file.'
        );
        if (!confirmed) return;

        setReembeddingIds(prev => new Set(prev).add(doc.id));
        setDocuments(prev => prev.map(d => d.id === doc.id ? {
            ...d,
            embedding_status: 'processing',
            embedding_progress: 0,
            embedding_error: undefined,
        } : d));
        try {
            const retryUrl = isStaleRetry
                ? `/admin/documents/${doc.id}/reembed?allow_stale_processing_retry=true`
                : `/admin/documents/${doc.id}/reembed`;
            const response = await api.fetch(retryUrl, { method: 'POST' });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to restart ingestion');
            }
        } catch (err) {
            console.error('Re-embed failed:', err);
            const message = err instanceof Error ? err.message : 'Failed to restart ingestion. Please try again.';
            setDocuments(prev => prev.map(d => d.id === doc.id ? {
                ...d,
                embedding_status: doc.embedding_status,
                embedding_progress: doc.embedding_progress,
                embedding_error: doc.embedding_error,
            } : d));
            alert(message);
        } finally {
            setReembeddingIds(prev => {
                const next = new Set(prev);
                next.delete(doc.id);
                return next;
            });
        }
    };

    if (!userEmail) return null; // Wait for session fetch

    return (
        <div className="w-full min-h-screen space-y-8 overflow-x-hidden pb-24 md:px-6 md:pt-6 animate-in fade-in duration-500">
            {/* Header */}
            <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-2xl font-bold text-foreground">Library Management</h2>
                    </div>
                    <p className="text-muted-foreground">
                        {currentAcademicContext
                            ? `Organize course materials for ${currentAcademicContext.current_academic_session || 'current session'} • ${formatSemester(currentAcademicContext.current_semester) || 'current semester'}.`
                            : 'Organize course materials, track storage, and manage document access permissions.'}
                    </p>
                </div>
                <div className="hidden items-center gap-4 md:flex">
                    <SystemStatusBadge />
                </div>
            </header>

            {/* Stats Ribbon (Real Data) */}
            <div className="mb-8 hidden grid-cols-1 gap-4 sm:grid-cols-2 md:grid md:grid-cols-3 md:gap-6">
                <StatsCard icon={FileText} label="Total Documents" value={totalDocs.toLocaleString()} trend="+--" color="bg-blue-500" />
                <StatsCard icon={BookOpen} label="Active Courses" value={activeCourses.toLocaleString()} sub="Unique Codes" color="bg-purple-500" />
                <StatsCard icon={HardDrive} label="Storage Used" value={`${storageUsedGB} GB`} sub="of 15 GB Plan" color={storageColor} progress={storagePercentage} />
            </div>
            <div className="grid grid-cols-2 gap-3 md:hidden">
                <MobileQuickStatCard icon={FileText} label="Documents" value={totalDocs.toLocaleString()} color="text-blue-500" bg="bg-blue-500/10" />
                <MobileQuickStatCard icon={BookOpen} label="Courses" value={activeCourses.toLocaleString()} color="text-purple-500" bg="bg-purple-500/10" />
                <MobileQuickStatCard icon={HardDrive} label="Storage" value={`${storageUsedGB} GB`} color="text-cyan-500" bg="bg-cyan-500/10" />
                <MobileQuickStatCard icon={Sparkles} label="Processed" value={`${documents.filter((doc) => doc.embedding_status === 'completed').length}`} color="text-emerald-500" bg="bg-emerald-500/10" />
            </div>

            {/* Toolbar */}
            <div className="mb-6 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2 bg-card border border-border rounded-xl px-4 py-2.5 focus-within:border-primary/50 transition-colors">
                        <Search className="w-4 h-4 text-muted-foreground" />
                        <input type="text" placeholder="Search documents..." className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground/70 text-foreground" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                    <div className="relative shrink-0" ref={statusMenuRef}>
                        <button
                            type="button"
                            onClick={() => setIsStatusMenuOpen((prev) => !prev)}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
                            aria-expanded={isStatusMenuOpen}
                            aria-label="Filter by material status"
                            title="Status filter"
                        >
                            <Archive className="h-4 w-4" />
                        </button>
                        {isStatusMenuOpen && (
                            <div className="absolute right-0 top-12 z-40 w-44 rounded-xl border border-border bg-card p-2 shadow-2xl ring-1 ring-black/10">
                                {STATUS_FILTER_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => {
                                            setFilterStatus(opt.value);
                                            setIsStatusMenuOpen(false);
                                        }}
                                        className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                            filterStatus === opt.value ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="relative shrink-0" ref={advancedFiltersRef}>
                        <button type="button" onClick={() => isAdvancedFiltersOpen ? setIsAdvancedFiltersOpen(false) : openAdvancedFilters()} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-foreground transition-colors hover:bg-muted" aria-expanded={isAdvancedFiltersOpen} aria-label="Open advanced filters" title="Advanced filters">
                            <Filter className="h-4 w-4 text-muted-foreground" />
                        </button>
                        {isAdvancedFiltersOpen && (
                            <div className="absolute right-0 top-12 z-40 w-72 rounded-xl border border-border bg-card p-3 shadow-2xl ring-1 ring-black/10">
                                <div className="space-y-3">
                                    <div>
                                        <label className="mb-1 block text-xs text-muted-foreground">Level</label>
                                        <select value={pendingFilterLevel} onChange={(e) => setPendingFilterLevel(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                                            {LEVEL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt === 'All' ? 'All Levels' : `${opt} Level`}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs text-muted-foreground">Session</label>
                                        <select value={pendingFilterSession} onChange={(e) => setPendingFilterSession(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                                            {sessionOptions.map(opt => <option key={opt} value={opt}>{opt === 'All' ? 'All Sessions' : opt}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs text-muted-foreground">Semester</label>
                                        <select value={pendingFilterSemester} onChange={(e) => setPendingFilterSemester(e.target.value as 'All' | 'first' | 'second')} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                                            <option value="All">All Semesters</option>
                                            <option value="first">First Semester</option>
                                            <option value="second">Second Semester</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs text-muted-foreground">Sort</label>
                                        <select value={pendingFilterSort} onChange={(e) => setPendingFilterSort(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                                            {SORT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center justify-between gap-2">
                                    <button type="button" onClick={clearAllFilters} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted">Clear all</button>
                                    <button type="button" onClick={applyAdvancedFilters} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Apply</button>
                                </div>
                            </div>
                        )}
                    </div>
                    {canUploadMaterials ? (
                    <div className="shrink-0">
                        <button onClick={() => setIsUploadModalOpen(true)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] hover:bg-primary/90 active:scale-[0.98]" aria-label="Upload material" title="Upload material">
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                    ) : null}
                </div>
                {activeFilterChips.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                        {activeFilterChips.map((chip) => (
                            <button key={chip.key} onClick={chip.onClear} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground hover:bg-muted">
                                <span>{chip.label}</span>
                                <X className="h-3 w-3" />
                            </button>
                        ))}
                        <button onClick={clearAllFilters} className="text-xs text-muted-foreground underline-offset-2 hover:underline">Clear all filters</button>
                    </div>
                )}
            </div>

            {/* Data Table */}
            <div className="space-y-4 md:hidden">
                {isLoadingData ? (
                    <div className="rounded-2xl border border-border bg-card px-6 py-14 text-center text-muted-foreground">
                        <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" />
                        Loading library data...
                    </div>
                ) : filteredDocs.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-card px-6 py-14 text-center text-muted-foreground">
                        No documents found.
                    </div>
                ) : (
                    filteredDocs.map((doc) => (
                        <article key={doc.id} className="relative rounded-2xl border border-border bg-card p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{doc.course_code}</p>
                                        <AIBadge
                                            status={doc.embedding_status}
                                            progress={doc.embedding_progress}
                                            error={doc.embedding_error}
                                            compact
                                        />
                                    </div>
                                    <h3 className="mt-1 min-w-0 break-words text-base font-semibold text-foreground">{doc.title}</h3>
                                    <p className="mt-1 break-words text-sm text-muted-foreground">{doc.lecturer}</p>
                                </div>
                                <button
                                    onClick={() => setMobileMenuDocId((prev) => (prev === doc.id ? null : doc.id))}
                                    className="rounded-lg border border-border p-2 text-muted-foreground"
                                    aria-label="Open actions"
                                >
                                    <MoreVertical className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="hidden">
                                <span className="rounded-full border border-secondary/30 bg-secondary/20 px-3 py-1 text-xs font-medium text-secondary-foreground">
                                    {doc.topic}
                                </span>
                                <AIBadge
                                    status={doc.embedding_status}
                                    progress={doc.embedding_progress}
                                    error={doc.embedding_error}
                                />
                            </div>

                            <div className="hidden">
                                <div>
                                    <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Date</p>
                                    <p className="mt-1 text-foreground">{doc.date}</p>
                                </div>
                                <div>
                                    <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Levels</p>
                                    <p className="mt-1 break-words text-foreground">{doc.target_levels?.join(', ') || 'All'}</p>
                                </div>
                            </div>

                            <div className="hidden">
                                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Academic Meta</p>
                                <p className="mt-1 break-words text-sm text-foreground">
                                    {[doc.academic_session, formatSemester(doc.semester), doc.department, doc.faculty].filter(Boolean).join(' • ') || 'Not set'}
                                </p>
                            </div>

                            <div className="hidden">
                                <MaterialStatusBadge status={doc.material_status} />
                            </div>

                            <div className="mt-3 flex items-center justify-between gap-3">
                                <span className="truncate text-xs text-muted-foreground">{doc.topic}</span>
                            </div>
                            {mobileMenuDocId === doc.id ? (
                                <div className="absolute right-3 top-12 z-20 min-w-36 rounded-xl border border-border bg-background p-1.5 shadow-lg">
                                    <button
                                        onClick={() => {
                                            setMobileDetailsDoc(doc);
                                            setMobileMenuDocId(null);
                                        }}
                                        className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted"
                                    >
                                        View details
                                    </button>
                                    <button
                                        onClick={() => {
                                            setEditingDoc(doc);
                                            setMobileMenuDocId(null);
                                        }}
                                        className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted"
                                    >
                                        Edit
                                    </button>
                                    {canShowReembedAction(doc) && (
                                        <button
                                            onClick={() => {
                                                void handleReembedDocument(doc);
                                                setMobileMenuDocId(null);
                                            }}
                                            disabled={!canRunReembedDocument(doc)}
                                            className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                                        >
                                            {getReembedActionLabel(doc)}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => {
                                            void handleToggleMaterialStatus(doc);
                                            setMobileMenuDocId(null);
                                        }}
                                        className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted"
                                    >
                                        {normalizeMaterialStatus(doc.material_status) === 'archived' ? 'Restore to Active' : 'Archive'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setDeleteTarget(doc);
                                            setMobileMenuDocId(null);
                                        }}
                                        className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-destructive hover:bg-destructive/10"
                                    >
                                        Delete
                                    </button>
                                </div>
                            ) : null}
                        </article>
                    ))
                )}
            </div>

            <div className="hidden min-h-[400px] overflow-hidden rounded-2xl border border-border bg-card backdrop-blur-sm md:block">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] table-fixed text-left text-sm">
                        <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase tracking-wider text-xs font-semibold">
                            <tr>
                                <th className="px-6 py-4 whitespace-nowrap w-4">
                                    <div className="flex items-center">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50 bg-card cursor-pointer"
                                            checked={isAllSelected}
                                            onChange={toggleSelectAll}
                                        />
                                    </div>
                                </th>
                                <th className="w-[30%] px-4 py-4 whitespace-nowrap">Material</th>
                                <th className="w-[14%] px-4 py-4 whitespace-nowrap">Lecturer</th>
                                <th className="w-[14%] px-4 py-4 whitespace-nowrap">AI Status</th>
                                <th className="w-[18%] px-4 py-4 whitespace-nowrap">Access</th>
                                <th className="w-[12%] px-4 py-4 whitespace-nowrap">Uploaded</th>
                                <th className="w-[12%] px-4 py-4 text-right whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {isLoadingData ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-20 text-center text-muted-foreground">
                                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
                                        Loading library data...
                                    </td>
                                </tr>
                            ) : filteredDocs.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-20 text-center text-slate-500">
                                        No documents found.
                                    </td>
                                </tr>
                            ) : (
                                filteredDocs.map((doc, index) => (
                                    <motion.tr
                                        key={doc.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                        className={`hover:bg-muted/50 transition-colors group ${selectedIds.has(doc.id) ? 'bg-primary/5' : ''}`}
                                    >
                                        <td className="px-6 py-4">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50 bg-card cursor-pointer"
                                                checked={selectedIds.has(doc.id)}
                                                onChange={() => toggleSelect(doc.id)}
                                            />
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="min-w-0">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-primary">
                                                        {doc.course_code}
                                                    </span>
                                                    <span className="truncate text-xs text-muted-foreground" title={doc.topic}>
                                                        {doc.topic || 'No topic'}
                                                    </span>
                                                </div>
                                                <div className="mt-1 truncate text-sm font-semibold text-foreground" title={doc.title}>
                                                    {doc.title}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-muted-foreground">
                                            <div className="truncate" title={doc.lecturer}>{doc.lecturer}</div>
                                        </td>

                                        <td className="px-4 py-4">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <AIBadge
                                                    status={doc.embedding_status}
                                                    progress={doc.embedding_progress}
                                                    error={doc.embedding_error}
                                                />
                                                <span className="truncate text-[11px] text-muted-foreground">
                                                    {doc.embedding_status === 'completed'
                                                        ? `${doc.total_chunks.toLocaleString()} chunks`
                                                        : doc.embedding_status === 'processing'
                                                            ? `${Math.round(doc.embedding_progress || 0)}%`
                                                            : doc.embedding_status}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex min-w-0 flex-wrap gap-1">
                                                <MaterialStatusBadge status={doc.material_status} />
                                            </div>
                                            <div className="mt-1 truncate text-[11px] text-muted-foreground">
                                                {[doc.source_type, doc.version_label].filter(Boolean).join(' • ')}
                                            </div>
                                            <div className="mt-1 truncate text-[11px] text-muted-foreground">
                                                {[doc.academic_session, formatSemester(doc.semester)].filter(Boolean).join(' • ') || 'No session set'}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-muted-foreground">
                                            <div className="truncate" title={doc.date}>{doc.date}</div>
                                            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px]">
                                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-bold" title={doc.uploaded_by.email}>
                                                    {doc.uploaded_by.name}
                                                </span>
                                                <span className="truncate" title={doc.uploaded_by.email}>{doc.uploaded_by.email}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <div className="relative flex items-center justify-end">
                                                <button
                                                    onClick={() => setDesktopMenuDocId((prev) => (prev === doc.id ? null : doc.id))}
                                                    className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted"
                                                    title="Open actions"
                                                    aria-label="Open actions"
                                                >
                                                    <MoreVertical className="h-4 w-4" />
                                                </button>
                                                {desktopMenuDocId === doc.id && (
                                                    <div className="absolute right-0 top-11 z-30 min-w-44 rounded-xl border border-border bg-background p-1.5 text-left shadow-lg">
                                                        <button
                                                            onClick={() => {
                                                                setMobileDetailsDoc(doc);
                                                                setDesktopMenuDocId(null);
                                                            }}
                                                            className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted"
                                                        >
                                                            View details
                                                        </button>
                                                        {doc.embedding_status === 'processing' && (
                                                            <button
                                                                onClick={() => {
                                                                    void handleCancelIngestion(doc);
                                                                    setDesktopMenuDocId(null);
                                                                }}
                                                                disabled={cancellingIds.has(doc.id)}
                                                                className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                                                            >
                                                                {cancellingIds.has(doc.id) ? 'Cancelling...' : 'Cancel ingestion'}
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                setEditingDoc(doc);
                                                                setDesktopMenuDocId(null);
                                                            }}
                                                            className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted"
                                                        >
                                                            Edit
                                                        </button>
                                                        {canShowReembedAction(doc) && (
                                                            <button
                                                                onClick={() => {
                                                                    void handleReembedDocument(doc);
                                                                    setDesktopMenuDocId(null);
                                                                }}
                                                                disabled={!canRunReembedDocument(doc)}
                                                                className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                                                            >
                                                                {getReembedActionLabel(doc)}
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                void handleToggleMaterialStatus(doc);
                                                                setDesktopMenuDocId(null);
                                                            }}
                                                            className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted"
                                                        >
                                                            {normalizeMaterialStatus(doc.material_status) === 'archived' ? 'Restore to Active' : 'Archive'}
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setDeleteTarget(doc);
                                                                setDesktopMenuDocId(null);
                                                            }}
                                                            className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-destructive hover:bg-destructive/10"
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bulk Actions Floating Bar */}
            <AnimatePresence>
                {selectedIds.size > 0 && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40"
                    >
                        <div className="bg-card text-card-foreground px-6 py-3 rounded-full shadow-2xl shadow-black/50 flex items-center gap-6 border border-primary/30 backdrop-blur-md">
                            <span className="font-bold text-sm whitespace-nowrap text-foreground flex items-center gap-2">
                                <span className="bg-primary/20 text-primary px-2 py-0.5 rounded text-xs border border-primary/30">{selectedIds.size}</span>
                                <span className="text-muted-foreground">selected</span>
                            </span>
                            <div className="h-4 w-px bg-border"></div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setSelectedIds(new Set())}
                                    className="px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleBulkDelete}
                                    className="px-4 py-1.5 text-xs font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-destructive/20"
                                >
                                    <Trash2 className="w-3 h-3" />
                                    Delete
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modals */}
            <AnimatePresence>
                {isUploadModalOpen && (
                    <UploadModal
                        isOpen={isUploadModalOpen}
                        onClose={() => setIsUploadModalOpen(false)}
                        userEmail={userEmail || ''}
                        isSuperAdmin={isSuperAdmin}
                        onSuccess={() => fetchDocuments()} // Refresh data
                    />
                )}
                {deleteTarget && (
                    <DeleteModal
                        isOpen={!!deleteTarget}
                        onClose={() => setDeleteTarget(null)}
                        onConfirm={handleDelete}
                    />
                )}
                {editingDoc && (
                    <EditDocumentModal
                        doc={editingDoc}
                        isOpen={!!editingDoc}
                        onClose={() => setEditingDoc(null)}
                        onUpdate={(updatedDoc) => {
                            setDocuments(prev => prev.map(d => d.id === updatedDoc.id ? { ...d, ...updatedDoc } : d));
                            setEditingDoc(null);
                        }}
                    />
                )}
                {mobileDetailsDoc && (
                    <MobileDocumentDetailsModal
                        doc={mobileDetailsDoc}
                        onClose={() => setMobileDetailsDoc(null)}
                    />
                )}
            </AnimatePresence>
        </div >
    );
}

// --- Sub-Components ---
function AIBadge({ status, progress, error, compact = false }: { status: string, progress: number, error?: string; compact?: boolean }) {
    // 1. Determine State
    let state = status;
    if (status === 'completed' && error) {
        state = 'completed_with_errors';
    }

    // 2. Render Check
    if (state === 'pending') {
        return (
            <div className={`flex items-center gap-1 bg-gray-50 text-gray-500 border border-gray-200 rounded-full ${compact ? 'px-1.5 py-0.5' : 'px-2 py-0.5'}`} title="Queued for AI Training">
                <Clock className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
            </div>
        );
    }

    if (state === 'processing') {
        const percentage = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
        return (
            <div className={`flex items-center gap-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-full ${compact ? 'px-1.5 py-0.5' : 'px-2 py-0.5'}`} title={`Training: ${percentage}%`}>
                <Loader2 className={`${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} animate-spin`} />
                <span className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-bold`}>{percentage}%</span>
            </div>
        );
    }

    // 3. Static States
    const configs: Record<string, AIBadgeConfig> = {
        'completed': {
            style: 'bg-amber-100 text-amber-700 border-amber-300',
            icon: Sparkles,
            text: 'AI',
            tooltip: 'Document is fully trained and searchable.'
        },
        'completed_with_errors': {
            style: 'bg-orange-100 text-orange-700 border-orange-300',
            icon: AlertCircle, // Warning Triangle replacement
            text: 'Partial',
            tooltip: 'Some chunks failed to process. Check content.'
        },
        'failed': {
            style: 'bg-red-100 text-red-700 border-red-300',
            icon: X, // X Circle replacement
            text: 'Failed',
            tooltip: 'AI Training Failed. ' + (error || '')
        }
    };

    const config = configs[state] || configs['failed'];
    const Icon = config.icon;

    return (
        <div className="group/badge relative flex items-center justify-center">
            <div className={`flex items-center gap-1 border rounded-full shadow-sm cursor-help ${compact ? 'px-1.5 py-0.5' : 'px-2 py-0.5'} ${config.style}`}>
                <Icon className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
                {/* Optional text if space permits, user asked for icon mostly but style implies pill */}
            </div>
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/90 text-white text-[10px] rounded opacity-0 group-hover/badge:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                {config.tooltip}
                {state === 'completed_with_errors' && error && (
                    <span className="block text-[9px] opacity-70 mt-1 max-w-[200px] whitespace-normal text-left">{error.slice(0, 100)}...</span>
                )}
            </div>
        </div>
    );
}

// SidebarItem moved to layout.tsx
function StatsCard({ icon: Icon, label, value, trend, sub, color, progress }: StatsCardProps) {
    return (
        <div className="rounded-2xl border border-border bg-background/90 p-4 transition-colors hover:border-primary/30 hover:bg-muted/40 relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
                <div className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${color.replace('bg-', 'border-')}/20 ${color.replace('bg-', 'bg-')}/10 ${color.replace('bg-', 'text-')}`}>
                    <Icon className="w-5 h-5" />
                </div>
                {trend && <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-1 rounded-full">{trend}</span>}
            </div>
            <div>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-lg font-bold text-foreground">{value}</span>
                </div>
                {sub && <p className="text-xs text-muted-foreground font-medium mt-1">{sub}</p>}

                {progress && (
                    <div className="mt-3 h-1.5 w-full bg-secondary/50 rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${progress}%` }} />
                    </div>
                )}
            </div>
        </div>
    );
}

function MobileQuickStatCard({ icon: Icon, label, value, color, bg }: MobileQuickStatCardProps) {
    return (
        <div className="rounded-2xl border border-border bg-background/90 p-4">
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${bg} ${color}`}>
                <Icon className="h-4 w-4" />
            </div>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
        </div>
    );
}

function MobileDocumentDetailsModal({ doc, onClose }: { doc: Document; onClose: () => void }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[65] bg-black/60 p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 16, opacity: 0 }}
                className="mx-auto mt-16 w-full max-w-md rounded-2xl border border-border bg-background p-5 md:max-w-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <h3 className="text-base font-bold text-foreground">{doc.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{doc.course_code} - {doc.lecturer}</p>
                <div className="mt-4 space-y-2 text-sm">
                    <p><span className="text-muted-foreground">Topic:</span> {doc.topic}</p>
                    <p><span className="text-muted-foreground">Date:</span> {doc.date}</p>
                    <p><span className="text-muted-foreground">Levels:</span> {doc.target_levels?.join(', ') || 'All'}</p>
                    <p><span className="text-muted-foreground">Academic:</span> {[doc.academic_session, formatSemester(doc.semester), doc.department, doc.faculty].filter(Boolean).join(' - ') || 'Not set'}</p>
                    <p><span className="text-muted-foreground">Status:</span> {normalizeMaterialStatus(doc.material_status) === 'archived' ? 'Archived' : 'Active'}</p>
                    <p><span className="text-muted-foreground">Source:</span> {[doc.source_type, doc.version_label].filter(Boolean).join(' - ') || 'Not set'}</p>
                    <p><span className="text-muted-foreground">AI:</span> {doc.embedding_status}{doc.embedding_status === 'completed' ? ` - ${doc.total_chunks.toLocaleString()} chunks` : ''}</p>
                    {doc.embedding_error ? <p><span className="text-muted-foreground">AI error:</span> {doc.embedding_error}</p> : null}
                    <p><span className="text-muted-foreground">Uploaded by:</span> {doc.uploaded_by.email}</p>
                </div>
                <button onClick={onClose} className="mt-5 w-full rounded-xl border border-border py-2 text-sm font-semibold text-foreground">
                    Close
                </button>
            </motion.div>
        </motion.div>
    );
}


function UploadModal({ onClose, userEmail, isSuperAdmin, onSuccess }: { isOpen: boolean, onClose: () => void, userEmail: string, isSuperAdmin: boolean, onSuccess: () => void }) {
    const [isLoading, setIsLoading] = useState(false);
    const [isTraining, setIsTraining] = useState(false); // New State for AI Training
    const [trainingProgress, setTrainingProgress] = useState(0);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState('');
    const workspaceUniversityId = isSuperAdmin ? getAdminWorkspaceUniversityId() : '';
    const [formData, setFormData] = useState({
        title: '',
        course_code: '',
        lecturer: '',
        topic: '',
        academic_session: '',
        semester: '',
        department: '',
        faculty: '',
        material_status: 'active',
    });
    const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
    const LEVEL_CHOICES = ['100lvl', '200lvl', '300lvl', '400lvl', '500lvl', '600lvl'];

    useEffect(() => {
        let cancelled = false;
        if (isSuperAdmin && !workspaceUniversityId) {
            return () => {
                cancelled = true;
            };
        }
        api.get('/admin/academic-context')
            .then(async (response) => {
                if (!response.ok || cancelled) return;
                const payload = await response.json();
                const context = payload?.context;
                if (!context) return;
                setFormData(prev => ({
                    ...prev,
                    academic_session: prev.academic_session || context.current_academic_session || '',
                    semester: prev.semester || normalizeSemester(context.current_semester),
                }));
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [isSuperAdmin, workspaceUniversityId]);

    const toggleLevel = (level: string) => {
        setSelectedLevels(prev =>
            prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]
        );
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setFileName(e.target.files[0].name);
            setError('');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        const file = fileInputRef.current?.files?.[0];
        if (!file) {
            setError('Please select a PDF file.');
            setIsLoading(false);
            return;
        }
        const selectedWorkspaceUniversityId = getAdminWorkspaceUniversityId();
        if (isSuperAdmin && !selectedWorkspaceUniversityId) {
            setError('Enter a university workspace from the Super Admin portal before uploading.');
            setIsLoading(false);
            return;
        }

        try {
            const data = new FormData();
            data.append('file', file);
            data.append('title', formData.title);
            data.append('course_code', formData.course_code);
            data.append('lecturer', formData.lecturer);
            data.append('topic', formData.topic);
            if (formData.academic_session) data.append('academic_session', formData.academic_session);
            if (formData.semester) data.append('semester', formData.semester);
            if (formData.department) data.append('department', formData.department);
            if (formData.faculty) data.append('faculty', formData.faculty);
            data.append('material_status', formData.material_status);
            if (userEmail) data.append('uploaded_by', userEmail);
            if (isSuperAdmin) data.append('university_id', selectedWorkspaceUniversityId);
            if (selectedLevels.length > 0) data.append('target_levels', JSON.stringify(selectedLevels));

            // Step 1: Upload File
            const response = await api.post('/admin/upload', data);

            if (!response.ok) {
                const payload = await response.json().catch(() => null);
                throw new Error(payload?.detail || payload?.message || 'Upload failed');
            }

            const result = await response.json();
            const documentId = result.document_id ?? result.supabase_record?.[0]?.id;

            if (documentId) {
                // Step 2: Switch to Training Mode
                setIsLoading(false);
                setIsTraining(true);

                // Step 3: Start Polling Validation
                let isLocalComplete = false; // Guard to prevent multiple refreshes from race conditions
                let consecutiveFailures = 0;
                const maxConsecutiveFailures = 3;

                const stopPollingWithFailure = (message: string) => {
                    if (isLocalComplete) return;
                    isLocalComplete = true;
                    clearInterval(pollInterval);
                    setIsTraining(false);
                    setError(message);
                };

                const pollInterval = setInterval(async () => {
                    if (isLocalComplete) return;

                    try {
                        const statusRes = await api.fetch(`/admin/documents/${documentId}/status`);

                        if (statusRes.ok) {
                            consecutiveFailures = 0;
                            const statusData = await statusRes.json();

                            // Double check after await
                            if (isLocalComplete) return;

                            // Backend sends embedding_progress as percentage (0-100).
                            const percentage = Math.max(
                                0,
                                Math.min(100, Math.round(Number(statusData.progress) || 0))
                            );

                            // Visual Smoothing: Don't jump backwards
                            setTrainingProgress(prev => Math.max(prev, percentage));

                            if (statusData.status === 'completed') {
                                isLocalComplete = true; // Lock immediately
                                clearInterval(pollInterval);
                                setTrainingProgress(100);
                                setTimeout(() => {
                                    setIsTraining(false);
                                    setIsSuccess(true);
                                    finishUpload();
                                }, 800);
                            } else if (statusData.status === 'failed') {
                                isLocalComplete = true; // Lock immediately
                                clearInterval(pollInterval);
                                setError(`AI Training Failed: ${statusData.error || 'Unknown error'}`);
                                setIsTraining(false);
                            }
                        } else {
                            consecutiveFailures += 1;
                            if (statusRes.status >= 500) {
                                stopPollingWithFailure('Upload/Processing Failed: Server error while checking training status.');
                                return;
                            }
                            if (consecutiveFailures >= maxConsecutiveFailures) {
                                stopPollingWithFailure('Upload/Processing Failed: Unable to retrieve training status after multiple attempts.');
                            }
                        }
                    } catch (err) {
                        console.error("Polling error:", err);
                        consecutiveFailures += 1;
                        if (consecutiveFailures >= maxConsecutiveFailures) {
                            stopPollingWithFailure('Upload/Processing Failed: Network error while checking training status.');
                        }
                    }
                }, 3000);
            } else {
                // Fallback for no document ID (shouldn't happen)
                setIsLoading(false);
                setIsSuccess(true);
                finishUpload();
            }

        } catch (error: unknown) {
            setIsLoading(false);
            setIsTraining(false);
            setError(error instanceof Error ? error.message : 'Something went wrong.');
        }
    };

    const finishUpload = () => {
        // Auto close and refresh after animation
        setTimeout(() => {
            onSuccess(); // Trigger refresh
            onClose();
            // Reset states after close
            setTimeout(() => {
                setIsSuccess(false);
                setFormData({
                    title: '',
                    course_code: '',
                    lecturer: '',
                    topic: '',
                    academic_session: '',
                    semester: '',
                    department: '',
                    faculty: '',
                    material_status: 'active',
                });
                setFileName('');
                setTrainingProgress(0);
                setSelectedLevels([]);
            }, 300);
        }, 1500);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-background shadow-2xl md:max-h-none max-h-[84vh]"
            >
                {isTraining && (
                    <button
                        type="button"
                        onClick={() => {
                            onSuccess();
                            onClose();
                        }}
                        title="Minimize"
                        aria-label="Minimize"
                        className="absolute top-3 right-3 z-20 h-8 w-8 rounded-md border border-border bg-background/90 text-lg leading-none font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                        -
                    </button>
                )}

                {/* Header - Only hide if success/training to focus properly */}
                {!isSuccess && !isTraining && (
                    <div className="flex justify-between items-center px-5 py-4 border-b border-border bg-muted/30">
                        <h3 className="text-base font-bold text-foreground tracking-wide">UPLOAD NEW MATERIAL</h3>
                        <button onClick={onClose} disabled={isLoading} className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                )}

                <AnimatePresence mode="wait">
                    {/* STATE A: FORM */}
                    {!isLoading && !isSuccess && !isTraining && (
                        <motion.form
                            key="form"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -20 }}
                            onSubmit={handleSubmit}
                            className="space-y-4 overflow-y-auto p-4 md:p-5"
                        >
                            {isSuperAdmin ? (
                                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-medium text-amber-700 dark:text-amber-300">
                                    You are uploading as Super Admin into the active university workspace.
                                </div>
                            ) : null}

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                                <FormInput label="Course Code" name="course_code" placeholder="e.g. CS101" value={formData.course_code} required onChange={handleInputChange} />
                                <FormInput label="Course Title" name="title" placeholder="e.g. Intro to AI" value={formData.title} required onChange={handleInputChange} />
                                <FormInput label="Lecturer" name="lecturer" placeholder="e.g. Dr. Vance" value={formData.lecturer} required onChange={handleInputChange} />
                                <FormInput label="Topic" name="topic" placeholder="e.g. Neural Nets" value={formData.topic} required onChange={handleInputChange} />
                                <FormInput label="Academic Session" name="academic_session" placeholder="e.g. 2024/2025" value={formData.academic_session} onChange={handleInputChange} />
                                <FormSelect label="Semester" name="semester" value={formData.semester} options={SEMESTER_OPTIONS} onChange={(e) => setFormData({ ...formData, semester: normalizeSemester(e.target.value) })} />
                                <FormInput label="Department" name="department" placeholder="e.g. Computer Science" value={formData.department} onChange={handleInputChange} />
                                <FormInput label="Faculty" name="faculty" placeholder="e.g. Science" value={formData.faculty} onChange={handleInputChange} />
                                <FormSelect label="Material Status" name="material_status" value={formData.material_status} options={MATERIAL_STATUS_OPTIONS} onChange={(e) => setFormData({ ...formData, material_status: normalizeMaterialStatus(e.target.value) })} />
                            </div>

                            {/* Target Level Selector */}
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">Target Academic Levels</label>
                                <p className="text-[10px] text-muted-foreground/70 mb-2">Leave all unchecked for universal access</p>
                                <div className="flex flex-wrap gap-2">
                                    {LEVEL_CHOICES.map(level => (
                                        <button
                                            key={level}
                                            type="button"
                                            onClick={() => toggleLevel(level)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${selectedLevels.includes(level)
                                                ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20'
                                                : 'bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                                                }`}
                                        >
                                            {level}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Drop Zone */}
                            <div className="relative group cursor-pointer">
                                <input
                                    type="file"
                                    accept=".pdf,application/pdf"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
                                />
                                <div className={`h-28 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all duration-300
                                    ${fileName ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/30 group-hover:border-primary/30 group-hover:bg-muted/50'}
                                `}>
                                    <div className="p-3 rounded-full bg-background mb-2 group-hover:-translate-y-1 transition-transform duration-300 shadow-sm border border-border">
                                        <UploadCloud className={`w-6 h-6 ${fileName ? 'text-primary' : 'text-muted-foreground'}`} />
                                    </div>
                                    <p className="text-sm font-medium text-foreground">
                                        {fileName || "Drag & drop PDF here or browse"}
                                    </p>
                                    {!fileName && <p className="text-xs text-muted-foreground mt-1">Maximum file size 50MB</p>}
                                </div>
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                                    <AlertCircle className="w-4 h-4" />
                                    {error}
                                </div>
                            )}

                            <div className="flex justify-end gap-2 pt-1">
                                <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                                    Cancel
                                </button>
                                <button type="submit" className="rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-95">
                                    Confirm Upload
                                </button>
                            </div>
                        </motion.form>
                    )}

                    {/* STATE B: UPLOADING */}
                    {isLoading && (
                        <motion.div
                            key="uploading"
                            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }}
                            className="flex flex-col items-center justify-center h-80 text-center p-8"
                        >
                            <div className="relative w-20 h-20 mb-6">
                                <div className="absolute inset-0 border-4 border-muted rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
                                <UploadCloud className="absolute inset-0 m-auto w-8 h-8 text-primary animate-pulse" />
                            </div>
                            <h4 className="text-xl font-bold text-foreground mb-2">Uploading Document...</h4>
                            <p className="text-muted-foreground text-sm">Saving securely to cloud storage.</p>
                        </motion.div>
                    )}

                    {/* STATE B.5: TRAINING AI */}
                    {isTraining && (
                        <motion.div
                            key="training"
                            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }}
                            className="flex flex-col items-center justify-center h-80 text-center p-8 w-full max-w-sm mx-auto"
                        >
                            <div className="relative w-full mb-6">
                                <div className="flex justify-between text-xs font-bold uppercase tracking-widest mb-2">
                                    <span className="text-primary flex items-center gap-2">
                                        <Sparkles className="w-3 h-3" />
                                        Training AI Model
                                    </span>
                                    <span className="text-foreground">{trainingProgress}%</span>
                                </div>
                                <div className="h-3 w-full bg-muted/50 rounded-full overflow-hidden border border-border/50">
                                    <motion.div
                                        className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${trainingProgress}%` }}
                                        transition={{ type: "spring", stiffness: 50, damping: 20 }}
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground mt-3 font-mono">
                                    Processing chunks...
                                </p>
                            </div>
                        </motion.div>
                    )}

                    {/* STATE C: SUCCESS */}
                    {isSuccess && (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center justify-center h-80 text-center p-8"
                        >
                            <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mb-6 shadow-2xl shadow-green-500/20">
                                <motion.svg
                                    viewBox="0 0 24 24"
                                    className="w-12 h-12 text-green-500"
                                    initial={{ pathLength: 0, opacity: 0 }}
                                    animate={{ pathLength: 1, opacity: 1 }}
                                    transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
                                >
                                    <motion.path
                                        fill="none"
                                        strokeWidth="3"
                                        stroke="currentColor"
                                        d="M5 13l4 4L19 7"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </motion.svg>
                            </div>
                            <h4 className="text-2xl font-bold text-foreground mb-2">AI Ready!</h4>
                            <p className="text-muted-foreground text-sm">Document uploaded and trained successfully.</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </motion.div>
    );
}

// Helper Component for Inputs
function FormInput({ label, name, placeholder, value, onChange, required = false }: FormInputProps) {
    return (
        <div className="space-y-2 group">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest group-focus-within:text-primary transition-colors ml-1">
                {label}
            </label>
            <input
                name={name}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                required={required}
                className="w-full bg-muted/50 border border-border text-foreground text-sm rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:bg-background focus:shadow-[0_0_15px_color-mix(in_srgb,var(--primary),transparent_90%)] transition-all placeholder:text-muted-foreground/70"
            />
        </div>
    );
}

function FormSelect({ label, name, value, options, onChange }: FormSelectProps) {
    return (
        <div className="space-y-2 group">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest group-focus-within:text-primary transition-colors ml-1">
                {label}
            </label>
            <select
                name={name}
                value={value}
                onChange={onChange}
                className="w-full bg-muted/50 border border-border text-foreground text-sm rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:bg-background transition-all"
            >
                {options.map((option) => (
                    <option key={option.value || option.label} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

function DeleteModal({ onClose, onConfirm }: { isOpen: boolean, onClose: () => void, onConfirm: () => Promise<void> }) {
    const [isDeleting, setIsDeleting] = useState(false);

    const handleConfirm = async () => {
        setIsDeleting(true);
        try {
            await onConfirm();
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="w-full max-w-md bg-background border border-destructive/30 rounded-2xl shadow-2xl p-6 relative overflow-hidden"
            >
                <div className="absolute top-0 left-0 w-full h-1 bg-destructive" />
                <div className="flex gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                        {isDeleting ? (
                            <Loader2 className="w-6 h-6 text-destructive animate-spin" />
                        ) : (
                            <AlertCircle className="w-6 h-6 text-destructive" />
                        )}
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-foreground mb-1">Delete Document?</h3>
                        <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                            Are you sure you want to permanently delete this file? This action
                            <span className="font-bold text-destructive"> cannot be undone</span>.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                disabled={isDeleting}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={isDeleting}
                                className="px-4 py-2 rounded-lg text-sm font-bold bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isDeleting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Deleting...
                                    </>
                                ) : (
                                    'Delete Permanently'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

function EditDocumentModal({ onClose, doc, onUpdate }: { isOpen: boolean, onClose: () => void, doc: Document, onUpdate: (d: Document) => void }) {
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: doc.title || '',
        course_code: doc.course_code || '',
        topic: doc.topic || '',
        lecturer: doc.lecturer || '',
        academic_session: doc.academic_session || '',
        semester: normalizeSemester(doc.semester),
        department: doc.department || '',
        faculty: doc.faculty || '',
        material_status: doc.material_status || 'active',
        version_label: doc.version_label || ''
    });
    const [editLevels, setEditLevels] = useState<string[]>(doc.target_levels || []);
    const LEVEL_CHOICES = ['100lvl', '200lvl', '300lvl', '400lvl', '500lvl', '600lvl'];

    const toggleEditLevel = (level: string) => {
        setEditLevels(prev =>
            prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const response = await api.patch(`/admin/documents/${doc.id}`, {
                title: formData.title,
                course_code: formData.course_code,
                topic: formData.topic,
                lecturer_name: formData.lecturer,
                target_levels: editLevels,
                academic_session: formData.academic_session || null,
                semester: normalizeSemester(formData.semester) || null,
                department: formData.department || null,
                faculty: formData.faculty || null,
                material_status: formData.material_status,
                version_label: formData.version_label || null
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Failed to update document');
            }

            // Optimistic Update
            onUpdate({
                ...doc,
                ...{
                    title: formData.title,
                    course_code: formData.course_code,
                    topic: formData.topic,
                    lecturer_name: formData.lecturer
                },
                lecturer: formData.lecturer, // Fix frontend mapping
                course_code: formData.course_code,
                target_levels: editLevels,
                academic_session: formData.academic_session,
                semester: normalizeSemester(formData.semester),
                department: formData.department,
                faculty: formData.faculty,
                material_status: normalizeMaterialStatus(formData.material_status),
                version_label: formData.version_label
            });

            // Optional: Success Toast could go here if we had a toaster context
            // alert('Updated successfully'); 

        } catch (err) {
            console.error(err);
            alert('Failed to update document');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="w-full max-w-md bg-background border border-border rounded-2xl shadow-2xl overflow-hidden"
            >
                <div className="flex justify-between items-center px-5 py-4 border-b border-border bg-muted/30">
                    <h3 className="text-base font-bold text-foreground">EDIT METADATA</h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <FormInput label="Course Code" name="course_code" value={formData.course_code} required onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, course_code: e.target.value })} />
                            <FormInput label="Topic" name="topic" value={formData.topic} required onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, topic: e.target.value })} />
                        </div>
                        <FormInput label="Course Title" name="title" value={formData.title} required onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, title: e.target.value })} />
                        <FormInput label="Lecturer" name="lecturer" value={formData.lecturer} required onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, lecturer: e.target.value })} />
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <FormInput label="Academic Session" name="academic_session" value={formData.academic_session} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, academic_session: e.target.value })} />
                            <FormSelect label="Semester" name="semester" value={formData.semester} options={SEMESTER_OPTIONS} onChange={(e) => setFormData({ ...formData, semester: normalizeSemester(e.target.value) })} />
                            <FormInput label="Department" name="department" value={formData.department} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, department: e.target.value })} />
                            <FormInput label="Faculty" name="faculty" value={formData.faculty} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, faculty: e.target.value })} />
                            <FormSelect label="Material Status" name="material_status" value={formData.material_status} options={MATERIAL_STATUS_OPTIONS} onChange={(e) => setFormData({ ...formData, material_status: normalizeMaterialStatus(e.target.value) })} />
                            <FormInput label="Version Label" name="version_label" value={formData.version_label} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, version_label: e.target.value })} />
                        </div>
                        {/* Target Level Selector */}
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">Target Academic Levels</label>
                            <p className="text-[10px] text-muted-foreground/70 mb-2">Leave all unchecked for universal access</p>
                            <div className="flex flex-wrap gap-2">
                                {LEVEL_CHOICES.map(level => (
                                    <button
                                        key={level}
                                        type="button"
                                        onClick={() => toggleEditLevel(level)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${editLevels.includes(level)
                                            ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20'
                                            : 'bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                                            }`}
                                    >
                                        {level}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
                        <button type="submit" disabled={isLoading} className="px-4 py-2 rounded-lg text-sm font-bold bg-green-600 text-white hover:bg-green-700 shadow-lg shadow-green-600/20 disabled:opacity-50">
                            {isLoading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </motion.div>
    );
}
