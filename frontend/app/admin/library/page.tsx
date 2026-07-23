'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

import {
    Search, Filter, Plus, FileText, Trash2, Pencil, Square,
    AlertCircle, Loader2,
    UploadCloud, HardDrive, BookOpen, X,
    Sparkles, Clock, MoreVertical, Archive, ArrowLeft,
    ChevronDown, ChevronRight, Library, RefreshCw
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { SystemStatusBadge } from '../../../components/SystemStatusBadge';
import { api } from '@/lib/api';
import { getAdminWorkspaceUniversityId, subscribeToAdminWorkspaceChanges } from '@/lib/admin-workspace';
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
    sections_status?: 'pending' | 'processing' | 'completed' | 'failed'; // [SECTION RETRY]
    sections_error?: string | null; // [SECTION RETRY]
    ingestion_worker_heartbeat_at?: string | null;
    total_chunks: number;
    target_levels?: string[];
    academic_session?: string;
    semester?: string;
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
    { value: 'archived', label: 'Past Materials' }
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

function buildUploadFormData(context?: { current_academic_session?: string | null; current_semester?: string | null } | null) {
    return {
        title: '',
        course_code: '',
        lecturer: '',
        topic: '',
        academic_session: context?.current_academic_session || '',
        semester: normalizeSemester(context?.current_semester),
        material_status: 'active' as MaterialStatus,
    };
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
            title={isArchived ? 'Past Material' : 'Active'}
        >
            {isArchived ? 'Past Material' : 'Active'}
        </span>
    );
}

export default function LibraryPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [editingDoc, setEditingDoc] = useState<Document | null>(null);
    const [mobileDetailsDoc, setMobileDetailsDoc] = useState<Document | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Document | null>(null); // Store full doc object
    const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());
    const [reembeddingIds, setReembeddingIds] = useState<Set<string>>(new Set());
    const [documents, setDocuments] = useState<Document[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    // Filters & Scope
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
    const [workspaceScopeVersion, setWorkspaceScopeVersion] = useState(0);
    const advancedFiltersRef = useRef<HTMLDivElement | null>(null);
    const statusMenuRef = useRef<HTMLDivElement | null>(null);

    // Dynamic states for Left Sidebar collapsible groups & active Course Folder selection
    const [activeCourse, setActiveCourse] = useState<string | null>(null);
    const [expandedLevels, setExpandedLevels] = useState<Record<string, boolean>>({
        '100': true,
        '200': true,
        '300': true,
        '400': true,
        '500': true,
        '600': true,
        'Other': false,
    });

    // Active document selection state for Right Details Sidebar on desktop
    const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);

    // Mobile tabs state
    const [activeMobileTab, setActiveMobileTab] = useState<'materials' | 'courses'>('materials');

    const LEVEL_OPTIONS = ['All', '100', '200', '300', '400', '500', '600'];
    const SORT_OPTIONS = ['Newest', 'Oldest'];
    const STATUS_FILTER_OPTIONS: Array<{ value: 'All' | MaterialStatus; label: string }> = [
        { value: 'All', label: 'All Status' },
        { value: 'active', label: 'Active' },
        { value: 'archived', label: 'Past Materials' },
    ];

    const sessionOptions = useMemo(
        () => ['All', ...Array.from(new Set(documents.map((doc) => doc.academic_session).filter((value): value is string => Boolean(value && value.trim())))).sort().reverse()],
        [documents]
    );

    const activeFilterChips = useMemo(() => {
        const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
        if (filterStatus !== 'All') chips.push({ key: 'status', label: `Status: ${filterStatus === 'active' ? 'Active' : 'Past Materials'}`, onClear: () => setFilterStatus('All') });
        if (filterLevel !== 'All') chips.push({ key: 'level', label: `Level: ${filterLevel}`, onClear: () => setFilterLevel('All') });
        if (filterSession !== 'All') chips.push({ key: 'session', label: `Session: ${filterSession}`, onClear: () => setFilterSession('All') });
        if (filterSemester !== 'All') chips.push({ key: 'semester', label: `Semester: ${filterSemester === 'first' ? 'First' : 'Second'}`, onClear: () => setFilterSemester('All') });
        if (filterSort !== 'Newest') chips.push({ key: 'sort', label: `Sort: ${filterSort}`, onClear: () => setFilterSort('Newest') });
        if (activeCourse !== null) chips.push({ key: 'course', label: `Course: ${activeCourse}`, onClear: () => setActiveCourse(null) });
        return chips;
    }, [filterStatus, filterLevel, filterSession, filterSemester, filterSort, activeCourse]);

    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [canUploadMaterials, setCanUploadMaterials] = useState(false);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [adminLevel, setAdminLevel] = useState('');

    useEffect(() => {
        const getSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.email) {
                setUserEmail(session.user.email);
            }
            const bootstrap = await fetchBootstrap();
            setIsSuperAdmin(Boolean(bootstrap?.is_super_admin));
            setCanUploadMaterials(Boolean(bootstrap?.is_super_admin || bootstrap?.is_university_admin));
            setAdminLevel((bootstrap?.profile?.level || '').trim());
        };
        getSession();
    }, []);

    useEffect(() => subscribeToAdminWorkspaceChanges(() => {
        setWorkspaceScopeVersion((prev) => prev + 1);
    }), []);

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
                sections_status?: 'pending' | 'processing' | 'completed' | 'failed';
                sections_error?: string;
                ingestion_worker_heartbeat_at?: string | null;
                total_chunks?: number;
                target_levels?: string[];
                academic_session?: string;
                semester?: string;
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
                    lecturer: row.lecturer_name,
                    date: new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                    file_size: row.file_size || 0,
                    uploaded_by: {
                        name: (row.uploaded_by_email || 'System').slice(0, 2).toUpperCase(),
                        email: row.uploaded_by_email || 'System'
                    },
                    embedding_status: status,
                    embedding_progress: progress,
                    embedding_error: row.embedding_error,
                    sections_status: row.sections_status,
                    sections_error: row.sections_error,
                    ingestion_worker_heartbeat_at: row.ingestion_worker_heartbeat_at,
                    total_chunks: Number(row.total_chunks) || 0,
                    target_levels: row.target_levels || [],
                    academic_session: row.academic_session || '',
                    semester: normalizeSemester(row.semester),
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
    }, [userEmail, isSuperAdmin, workspaceScopeVersion]);

    useEffect(() => {
        if (userEmail) fetchDocuments();
    }, [userEmail, fetchDocuments]);

    useEffect(() => {
        if (!userEmail) {
            setCurrentAcademicContext(null);
            return;
        }
        if (isSuperAdmin && !getAdminWorkspaceUniversityId()) {
            setCurrentAcademicContext(null);
            setFilterSession('All');
            setFilterSemester('All');
            setPendingFilterSession('All');
            setPendingFilterSemester('All');
            return;
        }
        let cancelled = false;
        api.get('/admin/academic-context')
            .then(async (response) => {
                if (!response.ok || cancelled) return;
                const payload = await response.json();
                const context = payload?.context || null;
                const nextSession = context?.current_academic_session || 'All';
                const nextSemester = normalizeSemester(context?.current_semester) || 'All';
                setCurrentAcademicContext(context);
                setFilterSession(nextSession);
                setFilterSemester(nextSemester);
                setPendingFilterSession(nextSession);
                setPendingFilterSemester(nextSemester);
            })
            .catch(() => {
                if (cancelled) return;
                setCurrentAcademicContext(null);
            });
        return () => {
            cancelled = true;
        };
    }, [userEmail, isSuperAdmin, workspaceScopeVersion]);

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
            // [SECTION RETRY] Include section processing states in background polling
            doc => doc.embedding_status === 'pending' || doc.embedding_status === 'processing' || doc.sections_status === 'pending' || doc.sections_status === 'processing'
        );

        if (!hasProcessingDocs) return;

        const intervalId = setInterval(() => {
            fetchDocuments(true);
        }, 3000);

        return () => clearInterval(intervalId);
    }, [documents, fetchDocuments]);

    // --- Stats & Space Calculations ---
    const totalDocs = documents.length;
    const activeCourses = new Set(documents.map(d => d.course_code)).size;
    const totalStorageBytes = documents.reduce((acc, d) => acc + d.file_size, 0);
    const storageUsedGB = (totalStorageBytes / (1024 * 1024 * 1024)).toFixed(2);
    const storagePercentage = Math.min(100, (totalStorageBytes / (1024 * 1024 * 1024 * 15)) * 100);
    let storageColor = "bg-cyan-500";
    if (storagePercentage > 90) storageColor = "bg-red-500";
    else if (storagePercentage > 75) storageColor = "bg-amber-500";

    // --- Course stats and collapsible level tree ---
    const courseStats = useMemo(() => {
        const stats: Record<string, number> = {};
        documents.forEach(doc => {
            const docStatus = normalizeMaterialStatus(doc.material_status);
            if (filterStatus !== 'All' && docStatus !== filterStatus) {
                return;
            }
            if (doc.course_code) {
                stats[doc.course_code] = (stats[doc.course_code] || 0) + 1;
            }
        });
        return stats;
    }, [documents, filterStatus]);

    const getCourseLevel = (courseCode: string): string => {
        const match = courseCode.match(/\d+/);
        if (match) {
            const firstDigit = match[0].charAt(0);
            if (['1', '2', '3', '4', '5'].includes(firstDigit)) {
                return `${firstDigit}00`;
            }
        }
        return 'Other';
    };

    const coursesByLevel = useMemo(() => {
        const grouped: Record<string, string[]> = {
            '100': [],
            '200': [],
            '300': [],
            '400': [],
            '500': [],
            '600': [],
            'Other': []
        };
        
        const uniqueCourses = Array.from(new Set(
            documents
                .filter(doc => {
                    if (filterStatus === 'All') return true;
                    return normalizeMaterialStatus(doc.material_status) === filterStatus;
                })
                .map(doc => doc.course_code)
                .filter(Boolean)
        )).sort();

        uniqueCourses.forEach(courseCode => {
            const lvl = getCourseLevel(courseCode);
            if (grouped[lvl]) {
                grouped[lvl].push(courseCode);
            } else {
                grouped['Other'].push(courseCode);
            }
        });

        return grouped;
    }, [documents, filterStatus]);

    const levelStats = useMemo(() => {
        const stats: Record<string, number> = {
            '100': 0, '200': 0, '300': 0, '400': 0, '500': 0, '600': 0, 'Other': 0
        };
        Object.entries(coursesByLevel).forEach(([level, courseCodes]) => {
            courseCodes.forEach(code => {
                stats[level] += (courseStats[code] || 0);
            });
        });
        return stats;
    }, [coursesByLevel, courseStats]);

    // --- Actions & Filters ---
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const filteredDocs = useMemo(() => {
        return documents
            .filter(doc => {
                const matchesSearch =
                    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    doc.course_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    doc.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    doc.lecturer.toLowerCase().includes(searchQuery.toLowerCase());

                const matchesStatus = filterStatus === 'All' || normalizeMaterialStatus(doc.material_status) === filterStatus;
                const matchesCourse = !activeCourse || doc.course_code === activeCourse;

                const matchesLevel = filterLevel === 'All' ||
                    (doc.course_code && doc.course_code.match(/\d+/)?.[0]?.startsWith(filterLevel.charAt(0)));
                const matchesSession = filterSession === 'All' || doc.academic_session === filterSession;
                const matchesSemester = filterSemester === 'All' || normalizeSemester(doc.semester) === filterSemester;

                return matchesSearch && matchesStatus && matchesCourse && matchesLevel && matchesSession && matchesSemester;
            })
            .sort((a, b) => {
                const dateA = new Date(a.date).getTime();
                const dateB = new Date(b.date).getTime();
                return filterSort === 'Newest' ? dateB - dateA : dateA - dateB;
            });
    }, [documents, searchQuery, filterStatus, activeCourse, filterLevel, filterSession, filterSemester, filterSort]);

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
        setActiveCourse(null);
        setIsAdvancedFiltersOpen(false);
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;

        try {
            const response = await api.delete(`/admin/documents/${deleteTarget.id}`);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Delete failed');
            }

            setDocuments(prev => prev.filter(d => d.id !== deleteTarget.id));
            if (selectedDoc?.id === deleteTarget.id) {
                setSelectedDoc(null);
            }
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

        setIsLoadingData(true);
        try {
            await Promise.all(Array.from(selectedIds).map(async (id) => {
                const response = await api.delete(`/admin/documents/${id}`);
                if (!response.ok) {
                    console.error(`Failed to delete ${id}`);
                }
            }));

            await fetchDocuments();
            setSelectedIds(new Set());
            setSelectedDoc(null);

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
                const updateStatus = (target: Partial<Document>) => {
                    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, ...target } : d));
                    if (selectedDoc?.id === doc.id) {
                        setSelectedDoc(prev => prev ? { ...prev, ...target } : null);
                    }
                    if (mobileDetailsDoc?.id === doc.id) {
                        setMobileDetailsDoc(prev => prev ? { ...prev, ...target } : null);
                    }
                };
                updateStatus({
                    embedding_status: 'failed',
                    embedding_error: 'Cancelled by admin.'
                });
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
        
        const updateStatus = (status: MaterialStatus) => {
            setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, material_status: status } : d));
            if (selectedDoc?.id === doc.id) {
                setSelectedDoc(prev => prev ? { ...prev, material_status: status } : null);
            }
            if (mobileDetailsDoc?.id === doc.id) {
                setMobileDetailsDoc(prev => prev ? { ...prev, material_status: status } : null);
            }
        };

        updateStatus(nextStatus);

        try {
            const response = await api.patch(`/admin/documents/${doc.id}`, { material_status: nextStatus });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Status update failed');
            }
        } catch (err) {
            console.error('Status update failed:', err);
            updateStatus(previousStatus);
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
        
        const updateDocState = (updated: Partial<Document>) => {
            setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, ...updated } : d));
            if (selectedDoc?.id === doc.id) {
                setSelectedDoc(prev => prev ? { ...prev, ...updated } : null);
            }
            if (mobileDetailsDoc?.id === doc.id) {
                setMobileDetailsDoc(prev => prev ? { ...prev, ...updated } : null);
            }
        };

        updateDocState({
            embedding_status: 'processing',
            embedding_progress: 0,
            embedding_error: undefined,
        });

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
            updateDocState({
                embedding_status: doc.embedding_status,
                embedding_progress: doc.embedding_progress,
                embedding_error: doc.embedding_error,
            });
            alert(message);
        } finally {
            setReembeddingIds(prev => {
                const next = new Set(prev);
                next.delete(doc.id);
                return next;
            });
        }
    };

    // [SECTION RETRY] Helpers for retrying section outline generation
    const canShowRetrySections = (doc: Document) => {
        return doc.sections_status === 'failed' && doc.embedding_status === 'completed';
    };

    const canRunRetrySections = (doc: Document) => {
        return doc.sections_status === 'failed' && doc.embedding_status === 'completed';
    };

    const handleRetrySections = async (doc: Document) => {
        if (!canRunRetrySections(doc)) return;
        const confirmed = window.confirm(
            'Regenerate the section outline for this document? This will create new explanations and quiz questions for each section using the already-processed content. It will not affect embeddings or search.'
        );
        if (!confirmed) return;

        const updateDocState = (updated: Partial<Document>) => {
            setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, ...updated } : d));
            if (selectedDoc?.id === doc.id) {
                setSelectedDoc(prev => prev ? { ...prev, ...updated } : null);
            }
            if (mobileDetailsDoc?.id === doc.id) {
                setMobileDetailsDoc(prev => prev ? { ...prev, ...updated } : null);
            }
        };

        updateDocState({
            sections_status: 'processing',
            sections_error: undefined,
        });

        try {
            const response = await api.fetch(`/admin/documents/${doc.id}/retry-sections`, { method: 'POST' });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to restart section outline generation');
            }
        } catch (err) {
            console.error('Retry sections failed:', err);
            const message = err instanceof Error ? err.message : 'Failed to restart section outline generation. Please try again.';
            updateDocState({
                sections_status: doc.sections_status,
                sections_error: doc.sections_error,
            });
            alert(message);
        }
    };

    return (
        <div className="w-full flex flex-1 min-h-0 flex-col overflow-hidden animate-in fade-in duration-500 lg:h-screen lg:min-h-0 lg:overflow-hidden lg:pb-0">
            {/* Desktop Panel Workspace */}
            <div className="hidden lg:flex flex-row flex-1 items-stretch overflow-hidden bg-background h-screen border-t border-border/20">
                {/* COLUMN 1: LEFT SUB-SIDEBAR (Full height) */}
                <aside className="w-64 shrink-0 border-r border-border/60 bg-card/35 backdrop-blur-md flex flex-col h-full overflow-hidden select-none">
                    {/* Library Header */}
                    <div className="px-6 py-5 border-b border-border/40 flex items-center gap-3 shrink-0">
                        <Library className="h-6 w-6 text-primary" />
                        <span className="text-lg font-bold tracking-wide font-outfit text-foreground">Library</span>
                    </div>

                    {/* Scrollable Sidebar Content */}
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
                        {/* View Scopes */}
                        <div className="space-y-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 pl-2">
                                View Scope
                            </span>
                            <div className="flex flex-col gap-1">
                                <button
                                    type="button"
                                    onClick={() => setFilterStatus('All')}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-between ${
                                        filterStatus === 'All'
                                            ? 'bg-primary/10 text-primary shadow-sm'
                                            : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                                    }`}
                                >
                                    <span>All Materials</span>
                                    <span className="text-[10px] bg-muted/80 text-muted-foreground px-2 py-0.5 rounded-full font-bold">
                                        {documents.length}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFilterStatus('active')}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-between ${
                                        filterStatus === 'active'
                                            ? 'bg-primary/10 text-primary shadow-sm'
                                            : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                                    }`}
                                >
                                    <span>Active</span>
                                    <span className="text-[10px] bg-muted/80 text-muted-foreground px-2 py-0.5 rounded-full font-bold">
                                        {documents.filter(d => normalizeMaterialStatus(d.material_status) === 'active').length}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFilterStatus('archived')}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-between ${
                                        filterStatus === 'archived'
                                            ? 'bg-primary/10 text-primary shadow-sm'
                                            : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                                    }`}
                                >
                                    <span>Past Materials</span>
                                    <span className="text-[10px] bg-muted/80 text-muted-foreground px-2 py-0.5 rounded-full font-bold">
                                        {documents.filter(d => normalizeMaterialStatus(d.material_status) === 'archived').length}
                                    </span>
                                </button>
                            </div>
                        </div>

                        {/* Course Directory (Collapsible Level Folders) */}
                        <div className="space-y-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 pl-2">
                                Course Directory
                            </span>
                            <div className="space-y-1">
                                {Object.entries(coursesByLevel).map(([level, courseCodes]) => {
                                    const isExpanded = !!expandedLevels[level];
                                    const totalCount = levelStats[level] || 0;

                                    return (
                                        <div key={level} className="space-y-1">
                                            <button
                                                type="button"
                                                onClick={() => setExpandedLevels(prev => ({ ...prev, [level]: !prev[level] }))}
                                                className="w-full flex items-center justify-between px-2 py-2 rounded-xl text-[11px] font-extrabold text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                                    <span>{level === 'Other' ? 'Other Levels' : `${level} Level`}</span>
                                                </div>
                                                <span className="bg-muted text-[10px] px-2 py-0.5 rounded-full font-bold">
                                                    {totalCount}
                                                </span>
                                            </button>
                                            
                                            {isExpanded && (
                                                <div className="pl-3.5 space-y-0.5 border-l border-border/50 ml-3.5 mt-0.5">
                                                    {courseCodes.length > 0 ? (
                                                        courseCodes.map(code => {
                                                            const count = courseStats[code] || 0;
                                                            return (
                                                                <button
                                                                    key={code}
                                                                    type="button"
                                                                    onClick={() => setActiveCourse(activeCourse === code ? null : code)}
                                                                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-between ${
                                                                        activeCourse === code
                                                                            ? 'bg-primary/10 text-primary shadow-sm font-bold'
                                                                            : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <BookOpen className="h-3.5 w-3.5" />
                                                                        <span className="truncate max-w-[100px]">{code}</span>
                                                                    </div>
                                                                    <span className="text-[9px] bg-muted/65 text-muted-foreground px-1.5 py-0.5 rounded-full">
                                                                        {count}
                                                                    </span>
                                                                </button>
                                                            );
                                                        })
                                                    ) : (
                                                        <span className="block px-2.5 py-1 text-[10px] text-muted-foreground/60 italic">
                                                            No courses
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                    </div>

                    {/* Storage Meter */}
                    <div className="p-4 shrink-0">
                        <div className="bg-accent/20 border border-border/40 rounded-xl p-3.5 flex flex-col gap-2.5">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/80">
                                <span>{storageUsedGB} GB / 15 GB</span>
                                <button
                                    type="button"
                                    onClick={() => void fetchDocuments()}
                                    className="p-0.5 hover:bg-accent rounded text-muted-foreground/60 hover:text-foreground transition-colors"
                                    title="Refresh storage"
                                >
                                    <RefreshCw className="h-3 w-3" />
                                </button>
                            </div>
                            <div className="h-1.5 w-full bg-secondary/60 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-blue-500 rounded-full transition-all duration-500" 
                                    style={{ width: `${storagePercentage}%` }} 
                                />
                            </div>
                        </div>
                    </div>
                </aside>

                {/* COLUMN 2: CENTER WORKSPACE (Full height) */}
                <div className="flex-1 min-w-0 flex flex-col h-full bg-background/25">
                    {/* Center Workspace Toolbar */}
                    <div className="flex flex-col gap-4 px-6 py-5 border-b border-border/40 bg-card/20 shrink-0 select-none">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl font-outfit">
                                    {activeCourse 
                                        ? `${filterStatus === 'active' ? 'Active' : filterStatus === 'archived' ? 'Past Materials' : 'All Materials'} · ${activeCourse}`
                                        : filterStatus === 'active' 
                                            ? 'Active Materials' 
                                            : filterStatus === 'archived' 
                                                ? 'Past Materials' 
                                                : 'All Materials'
                                    }
                                </h1>
                                <button
                                    onClick={() => void fetchDocuments()}
                                    className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                                    title="Reload Documents"
                                >
                                    <RefreshCw className="h-4.5 w-4.5" />
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="relative flex-grow max-w-md">
                                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder="Search library documents..."
                                    className="w-full rounded-xl bg-background border border-border/80 py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <select
                                    value={filterSession}
                                    onChange={(e) => setFilterSession(e.target.value)}
                                    className="h-10 rounded-xl border border-border/80 bg-background py-2 px-3 text-xs font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                                >
                                    {sessionOptions.map((session) => (
                                        <option key={session} value={session}>{session === 'All' ? 'All Sessions' : session}</option>
                                    ))}
                                </select>
                                <select
                                    value={filterSemester}
                                    onChange={(e) => setFilterSemester(e.target.value as 'All' | 'first' | 'second')}
                                    className="h-10 rounded-xl border border-border/80 bg-background py-2 px-3 text-xs font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                                >
                                    <option value="All">All Semesters</option>
                                    <option value="first">First Semester</option>
                                    <option value="second">Second Semester</option>
                                </select>

                                {canUploadMaterials && (
                                    <button
                                        onClick={() => setIsUploadModalOpen(true)}
                                        className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md shadow-primary/20 transition-all hover:bg-primary/95 flex items-center gap-1.5"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Upload</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Table Column Headers - exactly matching HomeContent list style columns */}
                    <div className="grid grid-cols-[40px_1.5fr_1.2fr_1.2fr_1fr_0.8fr] gap-4 px-6 py-3 border-b border-border/40 text-xs font-bold text-muted-foreground uppercase bg-muted/10 shrink-0 select-none">
                        <div className="flex items-center justify-center">
                            <input
                                type="checkbox"
                                checked={isAllSelected}
                                onChange={toggleSelectAll}
                                className="w-4.5 h-4.5 rounded border-border text-primary cursor-pointer animate-in fade-in"
                            />
                        </div>
                        <span>Name</span>
                        <span>Lecturer</span>
                        <span>Date Uploaded</span>
                        <span>Status</span>
                        <span className="text-right font-semibold">Size</span>
                    </div>

                    {/* Document List Feed */}
                    <div className="flex-1 overflow-y-auto divide-y divide-border/10">
                        {isLoadingData ? (
                            <div className="p-16 text-center text-muted-foreground">
                                <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-primary" />
                                <span className="text-xs font-semibold">Loading documents...</span>
                            </div>
                        ) : filteredDocs.length === 0 ? (
                            <div className="p-16 text-center text-muted-foreground flex flex-col items-center justify-center">
                                <FileText className="mx-auto mb-3 h-8 w-8 opacity-30 text-muted-foreground" />
                                <p className="font-bold text-foreground/85 text-sm">No materials found</p>
                                <p className="text-xs text-muted-foreground/60 mt-1 max-w-[200px] leading-relaxed">Try updating your filters or search query.</p>
                            </div>
                        ) : (
                            filteredDocs.map((doc, idx) => {
                                const isSelected = selectedDoc?.id === doc.id;
                                const isChecked = selectedIds.has(doc.id);

                                return (
                                    <div
                                        key={doc.id}
                                        onClick={() => setSelectedDoc(doc)}
                                        className={`grid grid-cols-[40px_1.5fr_1.2fr_1.2fr_1fr_0.8fr] gap-4 px-6 py-3.5 items-center cursor-pointer transition-all duration-150 border-b border-border/10 hover:bg-accent/40 group ${
                                            isSelected ? 'bg-primary/5 border-l-4 border-primary pl-5' : ''
                                        }`}
                                    >
                                        {/* Checkbox column */}
                                        <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => toggleSelect(doc.id)}
                                                className={`w-4 h-4 rounded border-border text-primary cursor-pointer transition-opacity ${
                                                    isChecked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
                                                }`}
                                            />
                                        </div>

                                        {/* Name column: Icon + Title/Topic + Course Badge + AI status */}
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-primary/20 bg-primary/10 text-primary shadow-sm select-none">
                                                {cancellingIds.has(doc.id) || reembeddingIds.has(doc.id) ? (
                                                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                                ) : (
                                                    <FileText className="h-5 w-5" />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex flex-col gap-0.5">
                                                <h4 className="text-sm font-semibold truncate group-hover:text-primary transition-colors pr-2" title={doc.topic || doc.title}>
                                                    {doc.topic || doc.title}
                                                </h4>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase shrink-0">
                                                        {doc.course_code}
                                                    </span>
                                                    <AIBadge
                                                        status={doc.embedding_status}
                                                        progress={doc.embedding_progress}
                                                        error={doc.embedding_error}
                                                        compact
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Lecturer column */}
                                        <div className="flex items-center text-xs md:text-sm text-muted-foreground min-w-0">
                                            <span className="truncate">{doc.lecturer}</span>
                                        </div>

                                        {/* Date column */}
                                        <div className="text-xs md:text-sm text-muted-foreground">
                                            {doc.date}
                                        </div>

                                        {/* Status column */}
                                        <div className="flex items-center">
                                            <MaterialStatusBadge status={doc.material_status} />
                                        </div>

                                        {/* Size column */}
                                        <div className="text-xs md:text-sm text-muted-foreground text-right font-medium">
                                            {doc.file_size ? `${(doc.file_size / (1024 * 1024)).toFixed(2)} MB` : '—'}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* COLUMN 3: RIGHT DETAILS SIDEBAR (Full height) */}
                <aside className="w-80 shrink-0 border-l border-border/60 bg-card/35 backdrop-blur-md flex flex-col h-full p-5 overflow-y-auto overflow-x-hidden">
                    {selectedDoc ? (
                        <div className="flex flex-col h-full flex-1 min-w-0">
                            {/* Header */}
                            <div className="flex items-center justify-between pb-3 border-b border-border/50 mb-4 shrink-0">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                                    Material Details
                                </h3>
                                <button
                                    onClick={() => setSelectedDoc(null)}
                                    className="p-1 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <X className="h-4.5 w-4.5" />
                                </button>
                            </div>

                            {/* Document Mockup Preview */}
                            <div className="w-full aspect-[4/3] rounded-xl overflow-hidden shadow-sm border border-border/40 bg-muted/20 mb-5 flex items-center justify-center shrink-0">
                                <DocumentThumbnail doc={selectedDoc} />
                            </div>

                            {/* Info Table */}
                            <div className="space-y-4 flex-1 min-w-0">
                                <div className="min-w-0">
                                    <h4 className="text-sm font-extrabold text-foreground leading-tight tracking-tight truncate" title={selectedDoc.topic || 'No Topic'}>
                                        {selectedDoc.topic || 'No Topic'}
                                    </h4>
                                    <p className="text-xs text-muted-foreground mt-1 truncate" title={selectedDoc.title}>
                                        {selectedDoc.title}
                                    </p>
                                </div>

                                <hr className="border-border/40" />

                                <div className="space-y-2.5 text-xs text-foreground min-w-0">
                                    <div className="flex justify-between items-center gap-2 min-w-0">
                                        <span className="text-muted-foreground shrink-0">Course Code</span>
                                        <span className="font-bold truncate">{selectedDoc.course_code}</span>
                                    </div>
                                    <div className="flex justify-between items-center gap-2 min-w-0">
                                        <span className="text-muted-foreground shrink-0">Lecturer</span>
                                        <span className="font-semibold truncate">{selectedDoc.lecturer}</span>
                                    </div>
                                    <div className="flex justify-between items-center gap-2 min-w-0">
                                        <span className="text-muted-foreground shrink-0">File Size</span>
                                        <span className="font-semibold truncate">{selectedDoc.file_size ? `${(selectedDoc.file_size / (1024 * 1024)).toFixed(2)} MB` : '—'}</span>
                                    </div>
                                    <div className="flex justify-between items-center gap-2 min-w-0">
                                        <span className="text-muted-foreground shrink-0">Academic Session</span>
                                        <span className="font-semibold truncate">{selectedDoc.academic_session || '—'}</span>
                                    </div>
                                    <div className="flex justify-between items-center gap-2 min-w-0">
                                        <span className="text-muted-foreground shrink-0">Semester</span>
                                        <span className="font-semibold truncate">{formatSemester(selectedDoc.semester) || '—'}</span>
                                    </div>
                                    <div className="flex justify-between items-center gap-2 min-w-0">
                                        <span className="text-muted-foreground shrink-0">Upload Date</span>
                                        <span className="font-semibold truncate">{selectedDoc.date}</span>
                                    </div>
                                    <div className="flex justify-between items-center gap-2 min-w-0">
                                        <span className="text-muted-foreground shrink-0">AI Index Status</span>
                                        <AIBadge
                                            status={selectedDoc.embedding_status}
                                            progress={selectedDoc.embedding_progress}
                                            error={selectedDoc.embedding_error}
                                        />
                                    </div>
                                    {/* [SECTION RETRY] Section Outline Status row */}
                                    <div className="flex justify-between items-center gap-2 min-w-0">
                                        <span className="text-muted-foreground shrink-0">Section Outline Status</span>
                                        <AIBadge
                                            status={selectedDoc.sections_status || 'pending'}
                                            progress={selectedDoc.sections_status === 'completed' ? 100 : 0}
                                            error={selectedDoc.sections_error || undefined}
                                        />
                                    </div>
                                    {selectedDoc.embedding_status === 'completed' && (
                                        <div className="flex justify-between items-center gap-2 min-w-0">
                                            <span className="text-muted-foreground shrink-0">Processed Chunks</span>
                                            <span className="font-mono font-bold text-primary truncate">{selectedDoc.total_chunks} chunks</span>
                                        </div>
                                    )}
                                </div>

                                {selectedDoc.embedding_error && (
                                    <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl p-3 text-xs leading-relaxed space-y-1 mt-2 min-w-0">
                                        <p className="font-bold flex items-center gap-1.5 shrink-0"><AlertCircle className="w-3.5 h-3.5 text-red-500" /> AI Ingestion Failed</p>
                                        <p className="font-mono text-[10px] break-words">{selectedDoc.embedding_error}</p>
                                    </div>
                                )}

                                {/* [SECTION RETRY] Section Outline Error box */}
                                {selectedDoc.sections_status === 'failed' && selectedDoc.sections_error && (
                                    <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl p-3 text-xs leading-relaxed space-y-1 mt-2 min-w-0">
                                        <p className="font-bold flex items-center gap-1.5 shrink-0"><AlertCircle className="w-3.5 h-3.5 text-red-500" /> Section Outline Failed</p>
                                        <p className="font-mono text-[10px] break-words">{selectedDoc.sections_error}</p>
                                    </div>
                                )}
                            </div>

                            {/* Administration Controls */}
                            <div className="border-t border-border/60 pt-4 mt-6 space-y-2 shrink-0">
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setEditingDoc(selectedDoc)}
                                        className="py-2.5 rounded-xl border border-border/80 bg-background hover:bg-muted text-xs font-bold text-foreground transition-all flex items-center justify-center gap-1.5"
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                        <span>Edit</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleToggleMaterialStatus(selectedDoc)}
                                        className="py-2.5 rounded-xl border border-border/80 bg-background hover:bg-muted text-xs font-bold text-foreground transition-all flex items-center justify-center gap-1.5"
                                    >
                                        <Archive className="w-3.5 h-3.5" />
                                        <span>{normalizeMaterialStatus(selectedDoc.material_status) === 'archived' ? 'Restore' : 'Archive'}</span>
                                    </button>
                                </div>

                                {canShowReembedAction(selectedDoc) && (
                                    <button
                                        type="button"
                                        onClick={() => void handleReembedDocument(selectedDoc)}
                                        disabled={!canRunReembedDocument(selectedDoc)}
                                        className="w-full py-2.5 rounded-xl border border-border/80 bg-background hover:bg-muted text-xs font-bold text-foreground transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                                    >
                                        <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                                        <span>{getReembedActionLabel(selectedDoc)}</span>
                                    </button>
                                )}

                                {/* [SECTION RETRY] Retry Sections button */}
                                {canShowRetrySections(selectedDoc) && (
                                    <button
                                        type="button"
                                        onClick={() => void handleRetrySections(selectedDoc)}
                                        disabled={!canRunRetrySections(selectedDoc)}
                                        className="w-full py-2.5 rounded-xl border border-border/80 bg-background hover:bg-muted text-xs font-bold text-foreground transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5 text-primary" />
                                        <span>Retry Section Outline</span>
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => setDeleteTarget(selectedDoc)}
                                    className="w-full py-2.5 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Delete Material</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center flex-1 text-center text-muted-foreground/80 py-20">
                            <FileText className="h-10 w-10 mb-3 opacity-30 text-muted-foreground" />
                            <p className="font-bold text-sm text-foreground/85">No selection</p>
                            <p className="text-[11px] mt-1 max-w-[200px] leading-relaxed">
                                Select a document from the center list feed to inspect metadata and access control.
                            </p>
                        </div>
                    )}
                </aside>
            </div>

            {/* Mobile View Layout */}
            <div className="lg:hidden flex flex-1 min-h-0 flex-col overflow-hidden">
                <div className="shrink-0 space-y-3 px-4 pb-3">
                    <div className="grid grid-cols-3 gap-2">
                        <MobileQuickStatCard icon={FileText} label="Documents" value={totalDocs.toLocaleString()} color="text-blue-500" bg="bg-blue-500/10" />
                        <MobileQuickStatCard icon={BookOpen} label="Courses" value={activeCourses.toLocaleString()} color="text-purple-500" bg="bg-purple-500/10" />
                        <MobileQuickStatCard icon={HardDrive} label="Storage" value={`${storageUsedGB} GB`} color="text-cyan-500" bg="bg-cyan-500/10" />
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
                            <Search className="h-3.5 w-3.5 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search materials..."
                                className="w-full border-none bg-transparent text-xs text-foreground outline-none"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        {canUploadMaterials ? (
                            <button
                                onClick={() => setIsUploadModalOpen(true)}
                                className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"
                                title="Upload material"
                            >
                                <Plus className="h-4 w-4" />
                            </button>
                        ) : null}
                    </div>
                </div>

                <div className="mt-1 flex flex-1 min-h-0 flex-col overflow-hidden rounded-t-[28px] border-t border-border/40 bg-surface-primary">
                    <div className="flex gap-8 px-6 pt-5 pb-3 shrink-0">
                        <button onClick={() => setActiveMobileTab('materials')} className="relative pb-2">
                            <span className={`text-base transition-all ${activeMobileTab === 'materials' ? 'font-bold text-foreground' : 'font-normal text-muted-foreground'}`}>Materials</span>
                            {activeMobileTab === 'materials' ? <div className="absolute bottom-0 left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full bg-primary" /> : null}
                        </button>
                        <button onClick={() => setActiveMobileTab('courses')} className="relative pb-2">
                            <span className={`text-base transition-all ${activeMobileTab === 'courses' ? 'font-bold text-foreground' : 'font-normal text-muted-foreground'}`}>Courses</span>
                            {activeMobileTab === 'courses' ? <div className="absolute bottom-0 left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full bg-primary" /> : null}
                        </button>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2">
                        {activeMobileTab === 'materials' ? (
                            <div className="space-y-4 pb-6">
                                {activeCourse ? (
                                    <div className="flex items-center justify-between pl-1">
                                        <button
                                            type="button"
                                            onClick={() => setActiveCourse(null)}
                                            className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
                                        >
                                            <ArrowLeft className="h-3.5 w-3.5" />
                                            <span>All Courses</span>
                                        </button>
                                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-primary">
                                            {activeCourse}
                                        </span>
                                    </div>
                                ) : null}

                                {isLoadingData ? (
                                    <div className="rounded-2xl border border-border bg-card/25 p-8 text-center text-xs text-muted-foreground shadow-sm">
                                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />
                                        Loading documents...
                                    </div>
                                ) : filteredDocs.length === 0 ? (
                                    <div className="rounded-2xl border border-dashed border-border/60 bg-card/25 p-8 text-center text-xs text-muted-foreground shadow-sm">
                                        No documents found.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {filteredDocs.map((doc) => (
                                            <div
                                                key={doc.id}
                                                onClick={() => setMobileDetailsDoc(doc)}
                                                className="flex cursor-pointer items-center justify-between rounded-xl border border-border/40 bg-card/10 px-3 py-3.5 transition-all active:bg-accent/40"
                                            >
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-sm select-none">
                                                        <FileText className="h-5 w-5" />
                                                    </div>
                                                    <div className="min-w-0 flex flex-col gap-0.5">
                                                        <h4 className="truncate pr-2 text-[14px] font-bold leading-tight text-foreground">
                                                            {doc.topic || doc.title}
                                                        </h4>
                                                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-muted-foreground/80">
                                                            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-primary">
                                                                {doc.course_code}
                                                            </span>
                                                            <span>{doc.date}</span>
                                                            <span>{doc.file_size ? `${(doc.file_size / (1024 * 1024)).toFixed(2)} MB` : '—'}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex shrink-0 items-center gap-2 pl-2">
                                                    <AIBadge
                                                        status={doc.embedding_status}
                                                        progress={doc.embedding_progress}
                                                        error={doc.embedding_error}
                                                        compact
                                                    />
                                                    <MaterialStatusBadge status={doc.material_status} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4 pb-6">
                                <div className="flex items-center justify-between pl-1">
                                    <span className="text-[13px] font-medium text-muted-foreground">All Courses</span>
                                </div>

                                <div className="space-y-2">
                                    {Object.entries(coursesByLevel).map(([level, courseCodes]) => {
                                        const isExpanded = !!expandedLevels[level];
                                        const count = levelStats[level] || 0;

                                        return (
                                            <div key={`mob-${level}`} className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedLevels((prev) => ({ ...prev, [level]: !prev[level] }))}
                                                    className="w-full flex items-center justify-between bg-muted/20 p-3 text-xs font-bold text-foreground"
                                                >
                                                    <div className="flex items-center gap-1.5">
                                                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                                        <span>{level === 'Other' ? 'Other Levels' : `${level} Level`}</span>
                                                    </div>
                                                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">
                                                        {count}
                                                    </span>
                                                </button>

                                                {isExpanded ? (
                                                    <div className="grid grid-cols-2 gap-2 border-t border-border/40 bg-background p-2">
                                                        {courseCodes.length > 0 ? (
                                                            courseCodes.map((code) => {
                                                                const docCount = courseStats[code] || 0;

                                                                return (
                                                                    <button
                                                                        key={`mob-course-${code}`}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setActiveCourse(activeCourse === code ? null : code);
                                                                            setActiveMobileTab('materials');
                                                                        }}
                                                                        className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
                                                                            activeCourse === code
                                                                                ? 'border-primary bg-primary/10 text-primary'
                                                                                : 'border-border bg-card text-foreground hover:bg-muted'
                                                                        }`}
                                                                    >
                                                                        <span className="text-xs font-bold">{code}</span>
                                                                        <span className="mt-1 text-[10px] text-muted-foreground">
                                                                            {docCount} {docCount === 1 ? 'material' : 'materials'}
                                                                        </span>
                                                                    </button>
                                                                );
                                                            })
                                                        ) : (
                                                            <span className="col-span-2 py-4 text-center text-[11px] italic text-muted-foreground">
                                                                No courses found.
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
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
                        adminLevel={adminLevel}
                        currentAcademicContext={currentAcademicContext}
                        onSuccess={() => fetchDocuments()}
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
                            if (selectedDoc?.id === updatedDoc.id) {
                                setSelectedDoc(updatedDoc);
                            }
                            if (mobileDetailsDoc?.id === updatedDoc.id) {
                                setMobileDetailsDoc(updatedDoc);
                            }
                            setEditingDoc(null);
                        }}
                    />
                )}
                {mobileDetailsDoc && (
                    <MobileDocumentDetailsSheet
                        doc={mobileDetailsDoc}
                        onClose={() => setMobileDetailsDoc(null)}
                        onEdit={() => {
                            setEditingDoc(mobileDetailsDoc);
                            setMobileDetailsDoc(null);
                        }}
                        onToggleArchive={async () => {
                            await handleToggleMaterialStatus(mobileDetailsDoc);
                        }}
                        onReprocess={async () => {
                            await handleReembedDocument(mobileDetailsDoc);
                        }}
                        onDelete={() => {
                            setDeleteTarget(mobileDetailsDoc);
                            setMobileDetailsDoc(null);
                        }}
                        canShowReembed={canShowReembedAction(mobileDetailsDoc)}
                        canRunReembed={canRunReembedDocument(mobileDetailsDoc)}
                        reembedLabel={getReembedActionLabel(mobileDetailsDoc)}
                        canShowResection={canShowRetrySections(mobileDetailsDoc)}
                        canRunResection={canRunRetrySections(mobileDetailsDoc)}
                        resectionLabel="Retry Section Outline"
                        onResection={async () => {
                            await handleRetrySections(mobileDetailsDoc);
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// --- Dynamic Visual Previews and helpers ---
function DocumentThumbnail({ doc }: { doc: Document }) {
    const fileName = (doc.title || '').toLowerCase() + ' ' + (doc.course_code || '').toLowerCase();
    const isPPT = fileName.includes('ppt') || fileName.includes('pptx') || fileName.includes('presentation') || fileName.includes('slide');
    const isGreen = doc.course_code.toLowerCase().includes('pcp') || doc.id.charCodeAt(0) % 2 === 0;
    
    if (isPPT) {
        const bannerColor = isGreen ? 'bg-[#7eb282]' : 'bg-[#4f81bd]';
        const titleColor = isGreen ? 'text-primary' : 'text-[#1f497d]';
        const slideSub = isGreen ? 'Supply Chain Management' : 'Pharmacy Operations';
        
        return (
            <div className="relative w-full h-full bg-white flex overflow-hidden select-none text-left">
                <div className={`w-[24%] h-full shrink-0 flex flex-col justify-end p-2 ${bannerColor}`}>
                    <div className="w-full h-0.5 bg-white/50 rounded-sm mb-0.5" />
                    <div className="w-2/3 h-0.5 bg-white/50 rounded-sm" />
                </div>
                
                <div className="flex-1 flex flex-col justify-between p-2.5 bg-white">
                    <div className="text-[7.5px] font-extrabold text-[#777]">
                        {doc.course_code}
                    </div>
                    
                    <div className="flex-1 flex flex-col justify-center items-center text-center">
                        <span className={`text-[9px] font-extrabold leading-tight line-clamp-3 px-1 tracking-tight ${titleColor}`}>
                            {doc.topic || doc.title}
                        </span>
                    </div>
                    
                    <div className="text-[6px] text-right font-bold text-zinc-400 truncate mt-auto">
                        {slideSub}
                    </div>
                </div>
            </div>
        );
    }
    
    const bulletColor = doc.course_code.toLowerCase().includes('pcl') ? 'bg-[#5c8bc4]' : 'bg-primary';
    return (
        <div className="relative w-full h-full bg-white flex flex-col p-2.5 select-none text-left">
            <div className="flex items-center gap-1 border-b border-zinc-200 pb-1 shrink-0">
                <div className={`w-1.5 h-1.5 rounded-full ${bulletColor}`} />
                <span className="text-[6.5px] font-extrabold text-zinc-500 truncate">{doc.course_code}</span>
            </div>
            <div className="flex-1 flex gap-2 pt-1.5 min-h-0">
                <div className="flex-1 flex flex-col gap-1.5">
                    <span className="text-[9px] font-extrabold text-zinc-800 line-clamp-3 leading-snug tracking-tight">
                        {doc.topic || doc.title}
                    </span>
                    <div className="w-full h-0.5 bg-zinc-200 rounded-sm" />
                    <div className="w-5/6 h-0.5 bg-zinc-200 rounded-sm" />
                </div>
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

function MobileQuickStatCard({ icon: Icon, label, value, color, bg }: MobileQuickStatCardProps) {
    return (
        <div className="rounded-2xl border border-border bg-card p-3 text-center">
            <div className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border ${bg} ${color} mx-auto mb-1.5`}>
                <Icon className="h-3.5 w-3.5" />
            </div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-sm font-extrabold text-foreground mt-0.5">{value}</p>
        </div>
    );
}

function MobileDocumentDetailsSheet({
    doc,
    onClose,
    onEdit,
    onToggleArchive,
    onReprocess,
    onDelete,
    canShowReembed,
    canRunReembed,
    reembedLabel,
    canShowResection,
    canRunResection,
    resectionLabel,
    onResection,
}: {
    doc: Document;
    onClose: () => void;
    onEdit: () => void;
    onToggleArchive: () => Promise<void>;
    onReprocess: () => Promise<void>;
    onDelete: () => void;
    canShowReembed: boolean;
    canRunReembed: boolean;
    reembedLabel: string;
    canShowResection?: boolean;
    canRunResection?: boolean;
    resectionLabel?: string;
    onResection?: () => Promise<void>;
}) {
    const isArchived = normalizeMaterialStatus(doc.material_status) === 'archived';
    
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[65] bg-black/60 flex items-end justify-center"
            onClick={onClose}
        >
            <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="w-full h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] overflow-x-hidden overflow-y-auto bg-background border-t border-border rounded-t-2xl p-5 space-y-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header handle drag bar */}
                <div className="mx-auto w-12 h-1 bg-muted rounded-full shrink-0" onClick={onClose} />

                <div className="flex justify-between items-start pt-2">
                    <div className="min-w-0">
                        <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-primary border border-primary/20">
                            {doc.course_code}
                        </span>
                        <h3 className="text-base font-extrabold text-foreground mt-2 break-words leading-tight">{doc.topic || 'No topic'}</h3>
                        <p className="text-xs text-muted-foreground truncate mt-1">{doc.title}</p>
                    </div>
                    <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Thumbnail */}
                <div className="w-full aspect-[4/3] rounded-xl overflow-hidden shadow-sm border border-border/40 bg-muted/20 shrink-0">
                    <DocumentThumbnail doc={doc} />
                </div>

                {/* Metadata details */}
                <div className="space-y-3.5 text-xs">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Lecturer</span>
                        <span className="font-semibold">{doc.lecturer}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">File Size</span>
                        <span className="font-semibold">{doc.file_size ? `${(doc.file_size / (1024 * 1024)).toFixed(2)} MB` : '—'}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Academic Session</span>
                        <span className="font-semibold">{doc.academic_session || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Semester</span>
                        <span className="font-semibold">{formatSemester(doc.semester) || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Upload Date</span>
                        <span className="font-semibold">{doc.date}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">AI Index Status</span>
                        <AIBadge
                            status={doc.embedding_status}
                            progress={doc.embedding_progress}
                            error={doc.embedding_error}
                        />
                    </div>
                    {/* [SECTION RETRY] Section Outline Status */}
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Section Outline Status</span>
                        <AIBadge
                            status={doc.sections_status || 'pending'}
                            progress={doc.sections_status === 'completed' ? 100 : 0}
                            error={doc.sections_error || undefined}
                        />
                    </div>
                    {doc.embedding_error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl p-3 text-xs leading-relaxed space-y-1">
                            <p className="font-bold flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> AI Ingestion Failed</p>
                            <p className="font-mono text-[9px] break-words">{doc.embedding_error}</p>
                        </div>
                    )}
                    {/* [SECTION RETRY] Section Outline Error box */}
                    {doc.sections_status === 'failed' && doc.sections_error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl p-3 text-xs leading-relaxed space-y-1">
                            <p className="font-bold flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> Section Outline Failed</p>
                            <p className="font-mono text-[9px] break-words">{doc.sections_error}</p>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-border/60 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={onEdit}
                            className="py-3 rounded-xl border border-border/80 bg-card hover:bg-muted text-xs font-bold text-foreground transition-all flex items-center justify-center gap-1.5"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Edit</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                void onToggleArchive();
                            }}
                            className="py-3 rounded-xl border border-border/80 bg-card hover:bg-muted text-xs font-bold text-foreground transition-all flex items-center justify-center gap-1.5"
                        >
                            <Archive className="w-3.5 h-3.5" />
                            <span>{isArchived ? 'Restore' : 'Archive'}</span>
                        </button>
                    </div>

                    {canShowReembed && (
                        <button
                            type="button"
                            onClick={() => {
                                void onReprocess();
                            }}
                            disabled={!canRunReembed}
                            className="w-full py-3 rounded-xl border border-border/80 bg-card hover:bg-muted text-xs font-bold text-foreground transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                            <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                            <span>{reembedLabel}</span>
                        </button>
                    )}

                    {/* [SECTION RETRY] Mobile Retry Sections button */}
                    {canShowResection && onResection && ( // [SECTION RETRY]
                        <button // [SECTION RETRY]
                            type="button" // [SECTION RETRY]
                            onClick={() => { // [SECTION RETRY]
                                void onResection(); // [SECTION RETRY]
                            }} // [SECTION RETRY]
                            disabled={!canRunResection} // [SECTION RETRY]
                            className="w-full py-3 rounded-xl border border-border/80 bg-card hover:bg-muted text-xs font-bold text-foreground transition-all flex items-center justify-center gap-1.5 disabled:opacity-50" // [SECTION RETRY]
                        > // [SECTION RETRY]
                            <RefreshCw className="w-3.5 h-3.5 text-primary" /> // [SECTION RETRY]
                            <span>{resectionLabel || 'Retry Section Outline'}</span> // [SECTION RETRY]
                        </button> // [SECTION RETRY]
                    )} {/* [SECTION RETRY] */}

                    <button
                        type="button"
                        onClick={onDelete}
                        className="w-full py-3 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Material</span>
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

// --- Sub-Components ---
function AIBadge({ status, progress, error, compact = false }: { status: string, progress: number, error?: string; compact?: boolean }) {
    let state = status;
    if (status === 'completed' && error) {
        state = 'completed_with_errors';
    }

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

    const configs: Record<string, AIBadgeConfig> = {
        'completed': {
            style: 'bg-amber-100 text-amber-700 border-amber-300',
            icon: Sparkles,
            text: 'AI',
            tooltip: 'Document is fully trained and searchable.'
        },
        'completed_with_errors': {
            style: 'bg-orange-100 text-orange-700 border-orange-300',
            icon: AlertCircle,
            text: 'Partial',
            tooltip: 'Some chunks failed to process. Check content.'
        },
        'failed': {
            style: 'bg-red-100 text-red-700 border-red-300',
            icon: X,
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
            </div>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/90 text-white text-[10px] rounded opacity-0 group-hover/badge:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                {config.tooltip}
                {state === 'completed_with_errors' && error && (
                    <span className="block text-[9px] opacity-70 mt-1 max-w-[200px] whitespace-normal text-left">{error.slice(0, 100)}...</span>
                )}
            </div>
        </div>
    );
}



function UploadModal({
    onClose,
    userEmail,
    isSuperAdmin,
    adminLevel,
    onSuccess,
    currentAcademicContext,
}: {
    isOpen: boolean,
    onClose: () => void,
    userEmail: string,
    isSuperAdmin: boolean,
    adminLevel?: string,
    onSuccess: () => void,
    currentAcademicContext?: { current_academic_session?: string | null; current_semester?: string | null } | null,
}) {
    const [isLoading, setIsLoading] = useState(false);
    const [loadingStage, setLoadingStage] = useState<'converting' | 'uploading'>('uploading');
    const [isTraining, setIsTraining] = useState(false); // New State for AI Training
    const [trainingProgress, setTrainingProgress] = useState(0);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const workspaceUniversityId = isSuperAdmin ? getAdminWorkspaceUniversityId() : '';
    const [formData, setFormData] = useState(() => buildUploadFormData(currentAcademicContext));
    const [selectedLevel, setSelectedLevel] = useState('');
    const [isLevelMenuOpen, setIsLevelMenuOpen] = useState(false);
    const LEVEL_CHOICES = ['100lvl', '200lvl', '300lvl', '400lvl', '500lvl', '600lvl'];

    useEffect(() => {
        if (isSuperAdmin && !workspaceUniversityId) return;
        setFormData(prev => ({
            ...prev,
            academic_session: prev.academic_session || currentAcademicContext?.current_academic_session || '',
            semester: prev.semester || normalizeSemester(currentAcademicContext?.current_semester),
        }));
    }, [currentAcademicContext, isSuperAdmin, workspaceUniversityId]);

    useEffect(() => {
        const nextLevel = getDefaultLevelFromAdmin();
        if (nextLevel) {
            setSelectedLevel((prev) => prev || nextLevel);
        }
    }, [adminLevel]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null;
        setSelectedFile(file);
        if (file) setError('');
    };

    const clearSelectedFile = () => {
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const formatFileSize = (size: number) => {
        if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
        if (size >= 1024) return `${Math.round(size / 1024)} KB`;
        return `${size} B`;
    };

    const getDefaultLevelFromAdmin = () => {
        if (!adminLevel) return '';
        const normalized = adminLevel.toLowerCase().replace(/\s+/g, '');
        const digits = normalized.replace(/\D/g, '');
        if (!digits) return '';
        const nextLevel = `${digits}lvl`;
        return LEVEL_CHOICES.includes(nextLevel) ? nextLevel : '';
    };

    const detectSelectedFileType = (file: File): 'pdf' | 'doc' | 'docx' | 'ppt' | 'pptx' | 'unsupported' => {
        const lowerName = file.name.toLowerCase();
        if (lowerName.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
        if (lowerName.endsWith('.doc')) return 'doc';
        if (lowerName.endsWith('.docx')) return 'docx';
        if (lowerName.endsWith('.ppt')) return 'ppt';
        if (lowerName.endsWith('.pptx')) return 'pptx';
        return 'unsupported';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        const file = selectedFile;
        if (!file) {
            setError('Please select a PDF, DOC, DOCX, PPT, or PPTX file.');
            setIsLoading(false);
            return;
        }
        const selectedType = detectSelectedFileType(file);
        if (selectedType === 'unsupported') {
            setError('Only PDF, DOC, DOCX, PPT, and PPTX files are supported.');
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
            const requiresConversion = selectedType !== 'pdf';
            setLoadingStage(requiresConversion ? 'converting' : 'uploading');
            if (requiresConversion) {
                await new Promise((resolve) => window.setTimeout(resolve, 700));
                setLoadingStage('uploading');
            }

            const data = new FormData();
            data.append('file', file);
            data.append('title', formData.title);
            data.append('course_code', formData.course_code);
            data.append('lecturer', formData.lecturer);
            data.append('topic', formData.topic);
            if (formData.academic_session) data.append('academic_session', formData.academic_session);
            if (formData.semester) data.append('semester', formData.semester);
            data.append('material_status', formData.material_status);
            if (userEmail) data.append('uploaded_by', userEmail);
            if (isSuperAdmin) data.append('university_id', selectedWorkspaceUniversityId);
            if (selectedLevel) data.append('target_levels', JSON.stringify([selectedLevel]));

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
                setFormData(buildUploadFormData(currentAcademicContext));
                setSelectedFile(null);
                setIsLevelMenuOpen(false);
                setLoadingStage('uploading');
                setTrainingProgress(0);
                setSelectedLevel(getDefaultLevelFromAdmin());
                if (fileInputRef.current) fileInputRef.current.value = '';
            }, 300);
        }, 1500);
    };

    const levelSummary = selectedLevel ? `${selectedLevel.replace('lvl', '')} Level` : 'Select level';

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[65] flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center md:p-4"
        >
            <motion.div
                initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                className="relative w-full h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] overflow-hidden rounded-t-[26px] border-t border-border bg-card shadow-2xl md:h-auto md:max-h-none md:max-w-[680px] md:rounded-3xl md:border md:border-border/70"
                style={{ transformOrigin: 'bottom center' }}
            >
                <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-muted md:hidden" />
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
                    <div className="flex items-center justify-between border-b border-border/80 bg-card px-4 py-3.5 md:px-6 md:py-4.5">
                        <div className="min-w-0">
                            <h3 className="text-base font-semibold tracking-tight text-foreground md:text-lg">Upload Material</h3>
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                {(formData.academic_session || 'No session') + ' • ' + (formatSemester(formData.semester) || 'No semester')}
                            </p>
                        </div>
                        <button onClick={onClose} disabled={isLoading} className="rounded-full border border-border/70 p-2 text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground disabled:opacity-50">
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
                            className="flex h-[calc(100%-61px)] flex-col overflow-hidden md:h-auto"
                        >
                            <div className="flex-1 overflow-y-auto bg-card px-4 py-3 md:overflow-visible md:px-6 md:py-5">
                                {isSuperAdmin ? (
                                    <div className="mb-3 text-[11px] text-muted-foreground">
                                        Active workspace upload. University scope will be inherited automatically.
                                    </div>
                                ) : null}

                                <div className="space-y-3.5 md:grid md:grid-cols-[232px_minmax(0,1fr)] md:gap-5 md:space-y-0">
                                    <div className="space-y-2.5">
                                        <div className="space-y-1">
                                            <p className="text-[11px] font-medium text-muted-foreground">File</p>
                                            {!selectedFile ? (
                                                <label className="block cursor-pointer rounded-2xl border border-dashed border-border/80 bg-muted/[0.16] px-4 py-4 transition-colors hover:border-primary/35 hover:bg-muted/[0.24] md:py-4">
                                                    <input
                                                        type="file"
                                                        accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                                                        ref={fileInputRef}
                                                        onChange={handleFileChange}
                                                        className="hidden"
                                                    />
                                                    <div className="flex flex-col items-center text-center md:items-start md:text-left">
                                                        <div className="mb-2 rounded-full border border-border bg-background p-2 text-primary">
                                                            <UploadCloud className="h-[18px] w-[18px]" />
                                                        </div>
                                                        <p className="text-[13px] font-semibold text-foreground">Choose file</p>
                                                        <p className="mt-1 max-w-xs text-[11px] leading-4.5 text-muted-foreground">
                                                            PDF, DOC, DOCX, PPT, PPTX • max 50MB
                                                        </p>
                                                    </div>
                                                </label>
                                            ) : (
                                                <div className="rounded-2xl border border-border/80 bg-muted/[0.14] px-3 py-3">
                                                    <div className="flex items-start gap-3">
                                                        <div className="rounded-lg border border-border bg-background p-2 text-primary">
                                                            <FileText className="h-4 w-4" />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="truncate text-[13px] font-semibold text-foreground">{selectedFile.name}</p>
                                                            <p className="mt-0.5 text-[11px] text-muted-foreground">{formatFileSize(selectedFile.size)} • Ready to upload</p>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <label className="cursor-pointer text-[11px] font-semibold text-primary hover:text-primary/80">
                                                                Replace
                                                                <input
                                                                    type="file"
                                                                    accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                                                                    onChange={handleFileChange}
                                                                    className="hidden"
                                                                />
                                                            </label>
                                                            <button
                                                                type="button"
                                                                onClick={clearSelectedFile}
                                                                className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="hidden md:block">
                                            <p className="text-[11px] leading-5 text-muted-foreground">
                                                Uploads inherit the active session and semester automatically.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-3.5">
                                        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-3">
                                            <label className="block md:col-span-1">
                                                <span className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Course code</span>
                                                <input
                                                    name="course_code"
                                                    value={formData.course_code}
                                                    onChange={handleInputChange}
                                                    required
                                                    placeholder="e.g. CS101"
                                                    className="h-10 w-full rounded-xl border border-border/80 bg-background px-3.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/65 focus:border-primary"
                                                />
                                            </label>
                                            <label className="block md:col-span-1">
                                                <span className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Course title</span>
                                                <input
                                                    name="title"
                                                    value={formData.title}
                                                    onChange={handleInputChange}
                                                    required
                                                    placeholder="e.g. Intro to AI"
                                                    className="h-10 w-full rounded-xl border border-border/80 bg-background px-3.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/65 focus:border-primary"
                                                />
                                            </label>
                                            <label className="block md:col-span-1">
                                                <span className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Lecturer</span>
                                                <input
                                                    name="lecturer"
                                                    value={formData.lecturer}
                                                    onChange={handleInputChange}
                                                    required
                                                    placeholder="e.g. Dr. Vance"
                                                    className="h-10 w-full rounded-xl border border-border/80 bg-background px-3.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/65 focus:border-primary"
                                                />
                                            </label>
                                            <label className="block md:col-span-1">
                                                <span className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Topic</span>
                                                <input
                                                    name="topic"
                                                    value={formData.topic}
                                                    onChange={handleInputChange}
                                                    required
                                                    placeholder="e.g. Neural Nets"
                                                    className="h-10 w-full rounded-xl border border-border/80 bg-background px-3.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/65 focus:border-primary"
                                                />
                                            </label>
                                        </div>

                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-start">
                                            <div className="space-y-2">
                                                <p className="text-[11px] font-medium text-muted-foreground">Level</p>
                                                <div className="relative">
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsLevelMenuOpen((prev) => !prev)}
                                                        className="flex h-10 w-full items-center justify-between rounded-xl border border-border/80 bg-background px-3.5 text-[13px] text-foreground transition-colors hover:border-primary/35"
                                                    >
                                                        <span className={selectedLevel ? 'text-foreground' : 'text-muted-foreground'}>
                                                            {levelSummary}
                                                        </span>
                                                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isLevelMenuOpen ? 'rotate-180' : ''}`} />
                                                    </button>
                                                    {isLevelMenuOpen && (
                                                        <div className="absolute bottom-[calc(100%+0.5rem)] left-0 right-0 z-20 rounded-xl border border-border/80 bg-background p-1.5 shadow-xl md:bottom-auto md:top-[calc(100%+0.5rem)]">
                                                            <div className="grid grid-cols-3 gap-2">
                                                                {LEVEL_CHOICES.map((level) => {
                                                                    const selected = selectedLevel === level;
                                                                    return (
                                                                        <button
                                                                            key={level}
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setSelectedLevel(level);
                                                                                setIsLevelMenuOpen(false);
                                                                            }}
                                                                            className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border/80 bg-background text-muted-foreground hover:border-primary/35 hover:text-foreground'}`}
                                                                        >
                                                                            {level.replace('lvl', '')}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-[11px] leading-4.5 text-muted-foreground">Defaults to your admin level.</p>
                                            </div>

                                            <div className="space-y-2">
                                                <p className="text-[11px] font-medium text-muted-foreground">Visibility</p>
                                                <div className="inline-flex rounded-full border border-border/80 bg-muted/[0.18] p-0.5">
                                                    {MATERIAL_STATUS_OPTIONS.map((option) => {
                                                        const active = formData.material_status === option.value;
                                                        return (
                                                            <button
                                                                key={option.value}
                                                                type="button"
                                                                onClick={() => setFormData({ ...formData, material_status: normalizeMaterialStatus(option.value) })}
                                                                className={`rounded-full px-4 py-2 text-[11px] font-semibold transition-colors ${
                                                                    active
                                                                        ? option.value === 'active'
                                                                            ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                                                                            : 'bg-background text-foreground shadow-sm'
                                                                        : 'text-muted-foreground hover:text-foreground'
                                                                }`}
                                                            >
                                                                {option.value === 'active' ? 'Current' : 'Past'}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {error && (
                                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs text-red-500">
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        <span>{error}</span>
                                    </div>
                                )}
                            </div>

                            <div className="shrink-0 border-t border-border/80 bg-background px-4 py-3.5 pb-[calc(env(safe-area-inset-bottom)+2.5rem)] md:px-6 md:py-4 md:pb-5">
                                <div className="flex gap-3 md:justify-end">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="flex-1 rounded-xl border border-border/80 bg-background px-4 py-2.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted md:w-[112px] md:flex-none"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 md:w-[168px] md:flex-none"
                                    >
                                        Upload Material
                                    </button>
                                </div>
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
                            <h4 className="text-xl font-bold text-foreground mb-2">
                                {loadingStage === 'converting' ? 'Converting to PDF...' : 'Uploading Document...'}
                            </h4>
                            <p className="text-muted-foreground text-sm">
                                {loadingStage === 'converting'
                                    ? 'Preparing a PDF version before upload.'
                                    : 'Saving securely to cloud storage.'}
                            </p>
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
            className="fixed inset-0 z-[65] flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center md:p-4"
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="w-full h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] overflow-x-hidden overflow-y-auto rounded-t-2xl border-t border-border bg-background shadow-2xl md:h-auto md:max-w-md md:overflow-hidden md:rounded-2xl md:border"
            >
                <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-muted md:hidden" />
                <div className="flex justify-between items-center px-5 py-4 border-b border-border bg-muted/30">
                    <h3 className="text-base font-bold text-foreground">EDIT METADATA</h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
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


