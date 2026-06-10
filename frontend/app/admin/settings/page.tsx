'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, RefreshCw } from 'lucide-react';

import { api } from '@/lib/api';

type AcademicContext = {
    university_id?: string | null;
    current_academic_session?: string | null;
    current_semester?: 'first' | 'second' | string | null;
};

type RolloverPreview = {
    dry_run: boolean;
    archived_count: number;
    new_context?: AcademicContext | null;
};

export default function AdminSettingsPage() {
    const [academicContext, setAcademicContext] = useState<AcademicContext | null>(null);
    const [academicSessionDraft, setAcademicSessionDraft] = useState('');
    const [semesterDraft, setSemesterDraft] = useState<'first' | 'second'>('first');
    const [rolloverSessionDraft, setRolloverSessionDraft] = useState('');
    const [rolloverSemesterDraft, setRolloverSemesterDraft] = useState<'first' | 'second'>('first');
    const [rolloverArchivePrevious, setRolloverArchivePrevious] = useState(true);
    const [rolloverPreview, setRolloverPreview] = useState<RolloverPreview | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isRollingOver, setIsRollingOver] = useState(false);

    const applyContext = (context: AcademicContext | null) => {
        setAcademicContext(context);
        const currentSession = context?.current_academic_session || '';
        const currentSemester = context?.current_semester === 'second' ? 'second' : 'first';
        setAcademicSessionDraft(currentSession);
        setSemesterDraft(currentSemester);
        setRolloverSessionDraft(currentSession);
        setRolloverSemesterDraft(currentSemester);
    };

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            try {
                const response = await api.get('/admin/academic-context');
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload.detail || 'Unable to load academic context');
                applyContext(payload.context || null);
            } catch (err) {
                setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unable to load academic context' });
            } finally {
                setIsLoading(false);
            }
        };
        void load();
    }, []);

    const saveAcademicContext = async () => {
        setIsSaving(true);
        setMessage(null);
        try {
            const response = await api.fetch('/admin/academic-context', {
                method: 'PUT',
                body: JSON.stringify({
                    current_academic_session: academicSessionDraft.trim(),
                    current_semester: semesterDraft,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.detail || 'Unable to save academic context');
            applyContext(payload.context || null);
            setMessage({ type: 'success', text: 'Academic context saved.' });
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unable to save academic context' });
        } finally {
            setIsSaving(false);
        }
    };

    const buildRolloverPayload = (dryRun: boolean) => ({
        new_academic_session: rolloverSessionDraft.trim(),
        new_semester: rolloverSemesterDraft,
        archive_previous_active_materials: rolloverArchivePrevious,
        dry_run: dryRun,
    });

    const previewRollover = async () => {
        setIsPreviewing(true);
        setMessage(null);
        try {
            const response = await api.post('/admin/academic-context/rollover', buildRolloverPayload(true));
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.detail || 'Unable to preview rollover');
            setRolloverPreview(payload);
            setMessage({ type: 'info', text: `Preview ready: ${payload.archived_count || 0} active material(s) will be archived.` });
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unable to preview rollover' });
            setRolloverPreview(null);
        } finally {
            setIsPreviewing(false);
        }
    };

    const confirmRollover = async () => {
        setIsRollingOver(true);
        setMessage(null);
        try {
            const response = await api.post('/admin/academic-context/rollover', buildRolloverPayload(false));
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.detail || 'Unable to complete rollover');
            applyContext(payload.new_context || null);
            setRolloverPreview(payload);
            setMessage({ type: 'success', text: `Rollover complete. Archived ${payload.archived_count || 0} material(s).` });
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unable to complete rollover' });
        } finally {
            setIsRollingOver(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-5xl space-y-8 pb-12">
            <header>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">University Workspace</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">University Settings</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    Manage the current academic context and semester rollover for this university only.
                </p>
            </header>

            {message ? (
                <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
                    message.type === 'error'
                        ? 'border-destructive/30 bg-destructive/10 text-destructive'
                        : message.type === 'success'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                            : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                }`}>
                    {message.type === 'error' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                    {message.text}
                </div>
            ) : null}

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm md:p-6">
                <div className="mb-6 flex items-center gap-3 border-b border-border pb-5">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                        <CalendarDays className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="font-semibold">Academic Context</h2>
                        <p className="text-xs text-muted-foreground">
                            {isLoading
                                ? 'Loading current context...'
                                : academicContext
                                    ? `Current: ${academicContext.current_academic_session || 'Not set'} - ${academicContext.current_semester === 'second' ? 'Second Semester' : 'First Semester'}`
                                    : 'No academic context configured yet.'}
                        </p>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground">Current Academic Session</label>
                        <input
                            value={academicSessionDraft}
                            onChange={(event) => setAcademicSessionDraft(event.target.value)}
                            placeholder="2025/2026"
                            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground">Current Semester</label>
                        <select
                            value={semesterDraft}
                            onChange={(event) => setSemesterDraft(event.target.value === 'second' ? 'second' : 'first')}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                        >
                            <option value="first">First Semester</option>
                            <option value="second">Second Semester</option>
                        </select>
                    </div>
                </div>

                <div className="mt-5 flex justify-end">
                    <button
                        type="button"
                        onClick={saveAcademicContext}
                        disabled={isSaving || !academicSessionDraft.trim()}
                        className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isSaving ? 'Saving...' : 'Save Context'}
                    </button>
                </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm md:p-6">
                <div className="mb-6 flex items-center gap-3 border-b border-border pb-5">
                    <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
                        <RefreshCw className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="font-semibold">Semester Rollover</h2>
                        <p className="text-xs text-muted-foreground">Archive previous active materials and set the next academic context.</p>
                    </div>
                </div>

                <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-muted-foreground">
                    Archived materials remain readable as past materials, but active materials are the default AI context.
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground">New Academic Session</label>
                        <input
                            value={rolloverSessionDraft}
                            onChange={(event) => setRolloverSessionDraft(event.target.value)}
                            placeholder="2026/2027"
                            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground">New Semester</label>
                        <select
                            value={rolloverSemesterDraft}
                            onChange={(event) => setRolloverSemesterDraft(event.target.value === 'second' ? 'second' : 'first')}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                        >
                            <option value="first">First Semester</option>
                            <option value="second">Second Semester</option>
                        </select>
                    </div>
                </div>

                <label className="mt-4 flex items-center gap-3 text-sm">
                    <input
                        type="checkbox"
                        checked={rolloverArchivePrevious}
                        onChange={(event) => setRolloverArchivePrevious(event.target.checked)}
                        className="h-4 w-4 rounded border-border"
                    />
                    Archive previous active materials
                </label>

                {rolloverPreview ? (
                    <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                        {rolloverPreview.dry_run ? 'Dry run' : 'Last rollover'}: {rolloverPreview.archived_count || 0} material(s) affected.
                    </div>
                ) : null}

                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <button
                        type="button"
                        onClick={previewRollover}
                        disabled={isPreviewing || isRollingOver || !rolloverSessionDraft.trim()}
                        className="rounded-xl border border-border px-5 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isPreviewing ? 'Previewing...' : 'Preview / Dry Run'}
                    </button>
                    <button
                        type="button"
                        onClick={confirmRollover}
                        disabled={isRollingOver || isPreviewing || !rolloverSessionDraft.trim()}
                        className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isRollingOver ? 'Rolling over...' : 'Confirm Rollover'}
                    </button>
                </div>
            </section>
        </div>
    );
}
