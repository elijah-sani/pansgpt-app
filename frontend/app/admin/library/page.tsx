'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

import {
    Search, Filter, Plus, FileText, Trash2, Pencil,
    AlertCircle, Loader2,
    UploadCloud, HardDrive, BookOpen, X, ChevronRight,
    Sparkles, Clock, RefreshCw
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { SystemStatusBadge } from '../../../components/SystemStatusBadge';
import { api } from '@/lib/api';

// --- Types ---
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
    total_chunks: number;
    target_levels?: string[];
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
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function LibraryPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [editingDoc, setEditingDoc] = useState<Document | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Document | null>(null); // Store full doc object
    const [reembeddingIds, setReembeddingIds] = useState<Set<string>>(new Set());
    const [documents, setDocuments] = useState<Document[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    // Filters
    const [filterLevel, setFilterLevel] = useState('All');
    const [filterSort, setFilterSort] = useState('Newest');

    const LEVEL_OPTIONS = ['All', '100', '200', '300', '400', '500'];
    const SORT_OPTIONS = ['Newest', 'Oldest'];

    // We can get user from session here if needed for upload attribution, 
    // or pass it down via context. For now, let's fetch session quickly to get email.
    const [userEmail, setUserEmail] = useState<string | null>(null);

    useEffect(() => {
        const getSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.email) {
                setUserEmail(session.user.email);
            }
        };
        getSession();
    }, [supabase]);

    // --- Data Fetching ---
    const fetchDocuments = useCallback(async (isSilent = false) => {
        if (!userEmail) return;
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
                total_chunks?: number;
                target_levels?: string[];
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
                    total_chunks: Number(row.total_chunks) || 0,
                    target_levels: row.target_levels || []
                };
            });

            setDocuments(formattedDocs);
        } catch (err) {
            console.error("Failed to fetch documents:", err);
        } finally {
            if (!isSilent) setIsLoadingData(false);
        }
    }, [userEmail]);

    useEffect(() => {
        if (userEmail) fetchDocuments();
    }, [userEmail, fetchDocuments]);

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
    const [isRepairingProgress, setIsRepairingProgress] = useState(false);

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

            return matchesSearch && matchesLevel;
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

    const handleRepairProgress = async () => {
        setIsRepairingProgress(true);
        try {
            const response = await api.fetch('/admin/documents/repair-progress', { method: 'POST' });
            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.detail || 'Failed to repair progress');
            }

            const result = await response.json();
            await fetchDocuments(true);
            alert(result.repaired > 0
                ? `Repaired ${result.repaired} completed document(s).`
                : 'No completed documents needed repair.');
        } catch (err) {
            console.error("Repair progress failed:", err);
            alert('Failed to repair progress. Check console.');
        } finally {
            setIsRepairingProgress(false);
        }
    };

    const handleReembed = async (doc: Document) => {
        if (reembeddingIds.has(doc.id)) return;
        setReembeddingIds(prev => new Set(prev).add(doc.id));
        setDocuments(prev => prev.map(d => d.id === doc.id
            ? { ...d, embedding_status: 'processing', embedding_progress: 0, embedding_error: undefined }
            : d
        ));
        try {
            const response = await api.fetch(`/admin/documents/${doc.id}/reembed`, { method: 'POST' });
            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.detail || 'Reembed failed');
            }
        } catch (err) {
            console.error("Reembed failed:", err);
            alert('Failed to start re-embedding. Check console.');
            setDocuments(prev => prev.map(d => d.id === doc.id
                ? { ...d, embedding_status: 'failed' }
                : d
            ));
        } finally {
            setReembeddingIds(prev => { const s = new Set(prev); s.delete(doc.id); return s; });
        }
    };

    if (!userEmail) return null; // Wait for session fetch

    return (
        <div className="relative pb-24">
            {/* Header */}
            <header className="flex justify-between items-start mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-2xl font-bold text-foreground">Library Management</h2>
                    </div>
                    <p className="text-muted-foreground">Organize course materials, track storage, and manage document access permissions.</p>
                </div>
                <div className="flex items-center gap-4">
                    <SystemStatusBadge />
                </div>
            </header>

            {/* Stats Ribbon (Real Data) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <StatsCard icon={FileText} label="Total Documents" value={totalDocs.toLocaleString()} trend="+--" color="bg-blue-500" />
                <StatsCard icon={BookOpen} label="Active Courses" value={activeCourses.toLocaleString()} sub="Unique Codes" color="bg-purple-500" />
                <StatsCard icon={HardDrive} label="Storage Used" value={`${storageUsedGB} GB`} sub="of 15 GB Plan" color={storageColor} progress={storagePercentage} />
            </div>

            {/* Toolbar */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div className="flex items-center gap-2 w-full md:flex-1 md:max-w-lg bg-card border border-border rounded-xl px-4 py-2.5 focus-within:border-primary/50 transition-colors">
                    <Search className="w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search documents by title, code or lecturer..."
                        className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground/70"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex gap-3 w-full md:w-auto">
                    <div className="flex gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 p-1 pr-4">
                        {/* Level Filter */}
                        <div className="relative group">
                            <select
                                value={filterLevel}
                                onChange={(e) => setFilterLevel(e.target.value)}
                                className="appearance-none bg-card border border-border rounded-xl px-4 py-2.5 pr-8 text-sm font-medium focus:outline-none focus:border-primary/50 cursor-pointer hover:bg-muted transition-colors"
                            >
                                {LEVEL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt === 'All' ? 'All Levels' : `${opt} Level`}</option>)}
                            </select>
                            <Filter className="w-4 h-4 text-muted-foreground absolute right-3 top-3 pointer-events-none" />
                        </div>

                        {/* Sort Filter */}
                        <div className="relative group">
                            <select
                                value={filterSort}
                                onChange={(e) => setFilterSort(e.target.value)}
                                className="appearance-none bg-card border border-border rounded-xl px-4 py-2.5 pr-8 text-sm font-medium focus:outline-none focus:border-primary/50 cursor-pointer hover:bg-muted transition-colors"
                            >
                                {SORT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                            <ChevronRight className="w-4 h-4 text-muted-foreground absolute right-3 top-3 pointer-events-none rotate-90" />
                        </div>
                        <button
                            onClick={handleRepairProgress}
                            disabled={isRepairingProgress}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-card border border-border hover:border-primary/40 hover:bg-muted text-foreground rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isRepairingProgress ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <AlertCircle className="w-4 h-4" />
                            )}
                            <span>{isRepairingProgress ? 'Repairing...' : 'Repair Progress'}</span>
                        </button>
                        <button
                            onClick={() => setIsUploadModalOpen(true)}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Upload Material</span>
                        </button>
                    </div>
                </div>

            </div>

            {/* Data Table */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden backdrop-blur-sm min-h-[400px]">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm min-w-[800px]">
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
                                <th className="px-6 py-4 whitespace-nowrap">Course Code</th>
                                <th className="px-6 py-4 whitespace-nowrap">Course Title</th>
                                <th className="px-6 py-4 whitespace-nowrap">Topic</th>
                                <th className="px-6 py-4 whitespace-nowrap">Lecturer</th>
                                <th className="px-6 py-4 whitespace-nowrap">Date</th>
                                <th className="px-6 py-4 whitespace-nowrap">Levels</th>
                                <th className="px-6 py-4 text-center whitespace-nowrap">Uploaded By</th>
                                <th className="px-6 py-4 text-right whitespace-nowrap">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {isLoadingData ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-20 text-center text-muted-foreground">
                                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
                                        Loading library data...
                                    </td>
                                </tr>
                            ) : filteredDocs.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-20 text-center text-slate-500">
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
                                        <td className="px-6 py-4 font-bold text-foreground whitespace-nowrap">{doc.course_code}</td>
                                        <td className="px-6 py-4 text-foreground/80 font-medium whitespace-nowrap">{doc.title}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <span className="px-3 py-1 rounded-full bg-secondary/20 border border-secondary/30 text-secondary-foreground text-xs font-medium">
                                                    {doc.topic}
                                                </span>

                                                {/* REPLACED WITH AI BADGE COMPONENT */}
                                                <AIBadge
                                                    status={doc.embedding_status}
                                                    progress={doc.embedding_progress}
                                                    error={doc.embedding_error}
                                                />
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">{doc.lecturer}</td>

                                        <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">{doc.date}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {doc.target_levels && doc.target_levels.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {doc.target_levels.map(lvl => (
                                                        <span key={lvl} className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold">
                                                            {lvl}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-[10px] font-medium text-muted-foreground/60 uppercase">All</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 flex justify-center whitespace-nowrap">
                                            <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center text-xs font-bold text-muted-foreground cursor-help" title={doc.uploaded_by.email}>
                                                {doc.uploaded_by.name}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right whitespace-nowrap">
                                            <div className="flex items-center justify-end gap-2">
                                                {(doc.embedding_status === 'failed' || (doc.embedding_status === 'completed' && doc.embedding_error)) && (
                                                    <button
                                                        onClick={() => handleReembed(doc)}
                                                        disabled={reembeddingIds.has(doc.id)}
                                                        className="p-2 hover:bg-amber-500/10 hover:text-amber-500 rounded-lg text-muted-foreground transition-colors disabled:opacity-50"
                                                        title="Retry embedding"
                                                    >
                                                        {reembeddingIds.has(doc.id)
                                                            ? <Loader2 className="w-4 h-4 animate-spin" />
                                                            : <RefreshCw className="w-4 h-4" />
                                                        }
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => setEditingDoc(doc)}
                                                    className="p-2 hover:bg-primary/10 hover:text-primary rounded-lg text-muted-foreground transition-colors"
                                                    title="Quick Edit"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
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
                        userEmail={userEmail}
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
            </AnimatePresence>
        </div >
    );
}

// --- Sub-Components ---

function AIBadge({ status, progress, error }: { status: string, progress: number, error?: string }) {
    // 1. Determine State
    let state = status;
    if (status === 'completed' && error) {
        state = 'completed_with_errors';
    }

    // 2. Render Check
    if (state === 'pending') {
        return (
            <div className="flex items-center gap-1 bg-gray-50 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full" title="Queued for AI Training">
                <Clock className="w-3 h-3" />
            </div>
        );
    }

    if (state === 'processing') {
        const percentage = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
        return (
            <div className="flex items-center gap-1 bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full" title={`Training: ${percentage}%`}>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-[10px] font-bold">{percentage}%</span>
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
            <div className={`flex items-center gap-1 border px-2 py-0.5 rounded-full shadow-sm cursor-help ${config.style}`}>
                <Icon className="w-3 h-3" />
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
    // Exact mapping for tone-on-tone styles
    const styles: { [key: string]: { bg: string, text: string } } = {
        'bg-blue-500': { bg: 'bg-blue-600', text: 'text-blue-100' },
        'bg-purple-500': { bg: 'bg-purple-600', text: 'text-purple-100' },
        'bg-cyan-500': { bg: 'bg-cyan-600', text: 'text-cyan-100' },
        // Fallbacks
        'bg-green-500': { bg: 'bg-green-600', text: 'text-green-100' },
        'bg-amber-500': { bg: 'bg-amber-600', text: 'text-amber-100' },
        'bg-red-500': { bg: 'bg-red-600', text: 'text-red-100' },
        'bg-emerald-500': { bg: 'bg-emerald-600', text: 'text-emerald-100' },
    };

    const style = styles[color] || { bg: color, text: 'text-primary-foreground' };

    return (
        <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-5 group hover:border-primary/20 transition-colors shadow-sm">
            <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity`}>
                <Icon className="w-16 h-16" />
            </div>
            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-full ${style.bg} flex items-center justify-center shadow-inner`}>
                        <Icon className={`w-5 h-5 ${style.text}`} />
                    </div>
                    <span className="text-muted-foreground text-sm font-medium">{label}</span>
                </div>
                <div className="flex items-end gap-3 mb-1">
                    <span className="text-2xl font-bold text-foreground">{value}</span>
                    {trend && <span className="text-emerald-500 text-xs font-medium mb-1">{trend}</span>}
                </div>
                {sub && <p className="text-muted-foreground/70 text-[10px] uppercase tracking-wide font-bold">{sub}</p>}

                {progress && (
                    <div className="mt-3 h-1 w-full bg-secondary rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full`} style={{ width: `${progress}%` }} />
                    </div>
                )}
            </div>
        </div>
    );
}

function UploadModal({ onClose, userEmail, onSuccess }: { isOpen: boolean, onClose: () => void, userEmail: string, onSuccess: () => void }) {
    const [isLoading, setIsLoading] = useState(false);
    const [isTraining, setIsTraining] = useState(false); // New State for AI Training
    const [trainingProgress, setTrainingProgress] = useState(0);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState('');
    const [formData, setFormData] = useState({ title: '', course_code: '', lecturer: '', topic: '' });
    const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
    const LEVEL_CHOICES = ['100lvl', '200lvl', '300lvl', '400lvl', '500lvl', '600lvl'];

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

        try {
            const data = new FormData();
            data.append('file', file);
            data.append('title', formData.title);
            data.append('course_code', formData.course_code);
            data.append('lecturer', formData.lecturer);
            data.append('topic', formData.topic);
            if (userEmail) data.append('uploaded_by', userEmail);
            if (selectedLevels.length > 0) data.append('target_levels', JSON.stringify(selectedLevels));

            // Step 1: Upload File
            const response = await api.post('/admin/upload', data);

            if (!response.ok) throw new Error('Upload failed');

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
                setFormData({ title: '', course_code: '', lecturer: '', topic: '' });
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
                className="w-full max-w-lg bg-background border border-border rounded-2xl shadow-2xl overflow-hidden relative"
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
                            className="p-5 space-y-5"
                        >
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormInput label="Course Code" name="course_code" placeholder="e.g. CS101" value={formData.course_code} onChange={handleInputChange} />
                                <FormInput label="Course Title" name="title" placeholder="e.g. Intro to AI" value={formData.title} onChange={handleInputChange} />
                                <FormInput label="Lecturer" name="lecturer" placeholder="e.g. Dr. Vance" value={formData.lecturer} onChange={handleInputChange} />
                                <FormInput label="Topic" name="topic" placeholder="e.g. Neural Nets" value={formData.topic} onChange={handleInputChange} />
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
                                <div className={`h-32 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all duration-300
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

                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" className="px-6 py-2.5 rounded-xl text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-95">
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
function FormInput({ label, name, placeholder, value, onChange }: FormInputProps) {
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
                required
                className="w-full bg-muted/50 border border-border text-foreground text-sm rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:bg-background focus:shadow-[0_0_15px_color-mix(in_srgb,var(--primary),transparent_90%)] transition-all placeholder:text-muted-foreground/70"
            />
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
        lecturer: doc.lecturer || ''
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
                target_levels: editLevels
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
                target_levels: editLevels
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
                        <div className="grid grid-cols-2 gap-4">
                            <FormInput label="Course Code" name="course_code" value={formData.course_code} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, course_code: e.target.value })} />
                            <FormInput label="Topic" name="topic" value={formData.topic} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, topic: e.target.value })} />
                        </div>
                        <FormInput label="Course Title" name="title" value={formData.title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, title: e.target.value })} />
                        <FormInput label="Lecturer" name="lecturer" value={formData.lecturer} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, lecturer: e.target.value })} />
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