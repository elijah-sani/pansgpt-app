'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cpu, Globe, Wrench } from 'lucide-react';

import { api } from '@/lib/api';

type SystemConfig = {
    system_prompt: string;
    temperature: number;
    maintenance_mode: boolean;
    web_search_enabled: boolean;
    rag_threshold: number;
};

type ConfigHistoryEntry = {
    id: string;
    change_type: string;
    changed_by_email?: string | null;
    change_reason?: string | null;
    created_at?: string | null;
    rolled_back_from_id?: string | null;
    temperature: number;
    maintenance_mode: boolean;
    web_search_enabled: boolean;
    rag_threshold: number;
};

type ChangeRequestStatus = 'draft' | 'review' | 'approved' | 'published' | 'rejected';

type ConfigChangeRequestEntry = {
    id: string;
    system_prompt: string;
    temperature: number;
    maintenance_mode: boolean;
    web_search_enabled: boolean;
    rag_threshold: number;
    change_reason: string;
    status: ChangeRequestStatus;
    note?: string | null;
    lint_warnings: string[];
    requested_by_email?: string | null;
    reviewed_by_email?: string | null;
    approved_by_email?: string | null;
    published_by_email?: string | null;
    history_entry_id?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
};

export default function SuperAdminAIConfigurationPage() {
    const [config, setConfig] = useState<SystemConfig>({
        system_prompt: '',
        temperature: 0.7,
        maintenance_mode: false,
        web_search_enabled: true,
        rag_threshold: 0.5,
    });
    const [liveConfig, setLiveConfig] = useState<SystemConfig>({
        system_prompt: '',
        temperature: 0.7,
        maintenance_mode: false,
        web_search_enabled: true,
        rag_threshold: 0.5,
    });
    const [history, setHistory] = useState<ConfigHistoryEntry[]>([]);
    const [changeRequests, setChangeRequests] = useState<ConfigChangeRequestEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [changeReason, setChangeReason] = useState('');
    const [rollbackReasonById, setRollbackReasonById] = useState<Record<string, string>>({});
    const [requestNoteById, setRequestNoteById] = useState<Record<string, string>>({});
    const [lintWarnings, setLintWarnings] = useState<string[]>([]);
    const [allowUnsafePromptChange, setAllowUnsafePromptChange] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const promptChanged = config.system_prompt.trim() !== liveConfig.system_prompt.trim();
    const liveSettingsChanged = (
        config.temperature !== liveConfig.temperature ||
        config.maintenance_mode !== liveConfig.maintenance_mode ||
        config.web_search_enabled !== liveConfig.web_search_enabled ||
        config.rag_threshold !== liveConfig.rag_threshold
    );

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            try {
                const [response, historyResponse, changeRequestResponse] = await Promise.all([
                    api.get('/admin/config'),
                    api.get('/admin/config/history'),
                    api.get('/admin/config/change-requests'),
                ]);
                const payload = await response.json().catch(() => ({}));
                const historyPayload = await historyResponse.json().catch(() => ({}));
                const changeRequestPayload = await changeRequestResponse.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload.detail || 'Unable to load AI configuration');
                const nextConfig = {
                    system_prompt: payload.system_prompt ?? '',
                    temperature: Number(payload.temperature ?? 0.7),
                    maintenance_mode: Boolean(payload.maintenance_mode),
                    web_search_enabled: payload.web_search_enabled !== false,
                    rag_threshold: Number(payload.rag_threshold ?? 0.5),
                };
                setConfig(nextConfig);
                setLiveConfig(nextConfig);
                if (historyResponse.ok) {
                    setHistory(Array.isArray(historyPayload.items) ? historyPayload.items : []);
                }
                if (changeRequestResponse.ok) {
                    setChangeRequests(Array.isArray(changeRequestPayload.items) ? changeRequestPayload.items : []);
                }
            } catch (err) {
                setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unable to load AI configuration' });
            } finally {
                setIsLoading(false);
            }
        };
        void load();
    }, []);

    const refreshHistory = async () => {
        const response = await api.get('/admin/config/history');
        const payload = await response.json().catch(() => ({}));
        if (response.ok) {
            setHistory(Array.isArray(payload.items) ? payload.items : []);
        }
    };

    const refreshChangeRequests = async () => {
        const response = await api.get('/admin/config/change-requests');
        const payload = await response.json().catch(() => ({}));
        if (response.ok) {
            setChangeRequests(Array.isArray(payload.items) ? payload.items : []);
        }
    };

    const refreshLiveConfig = async () => {
        const response = await api.get('/admin/config');
        const payload = await response.json().catch(() => ({}));
        if (response.ok) {
            const nextConfig = {
                system_prompt: payload.system_prompt ?? '',
                temperature: Number(payload.temperature ?? 0.7),
                maintenance_mode: Boolean(payload.maintenance_mode),
                web_search_enabled: payload.web_search_enabled !== false,
                rag_threshold: Number(payload.rag_threshold ?? 0.5),
            };
            setConfig(nextConfig);
            setLiveConfig(nextConfig);
        }
    };

    const saveLiveSettings = async (partial?: Partial<SystemConfig>) => {
        setIsSaving(true);
        setMessage(null);
        const nextConfig = { ...config, ...partial };
        try {
            const response = await api.post('/admin/config/update', {
                temperature: nextConfig.temperature,
                maintenance_mode: nextConfig.maintenance_mode,
                web_search_enabled: nextConfig.web_search_enabled,
                rag_threshold: nextConfig.rag_threshold,
                change_reason: changeReason.trim() || undefined,
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.detail || 'Unable to save AI configuration');
            setConfig(nextConfig);
            setLiveConfig((prev) => ({ ...prev, ...nextConfig, system_prompt: prev.system_prompt }));
            setChangeReason('');
            setLintWarnings([]);
            await refreshHistory();
            setMessage({ type: 'success', text: 'Live AI settings saved.' });
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unable to save AI configuration' });
        } finally {
            setIsSaving(false);
        }
    };

    const createPromptDraft = async () => {
        if (!changeReason.trim()) {
            setMessage({ type: 'error', text: 'Add a change reason before creating a prompt draft.' });
            return;
        }
        setIsSaving(true);
        setMessage(null);
        try {
            const lintResponse = await api.post('/admin/config/lint', {
                system_prompt: config.system_prompt,
            });
            const lintPayload = await lintResponse.json().catch(() => ({}));
            const warnings = Array.isArray(lintPayload.lint_warnings) ? lintPayload.lint_warnings : [];
            setLintWarnings(warnings);

            const response = await api.post('/admin/config/change-requests', {
                system_prompt: config.system_prompt,
                temperature: config.temperature,
                maintenance_mode: config.maintenance_mode,
                web_search_enabled: config.web_search_enabled,
                rag_threshold: config.rag_threshold,
                change_reason: changeReason.trim(),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.detail || 'Unable to create prompt draft');
            setAllowUnsafePromptChange(false);
            setChangeReason('');
            await refreshChangeRequests();
            setMessage({
                type: 'success',
                text: warnings.length > 0 ? 'Prompt draft created with lint warnings.' : 'Prompt draft created.',
            });
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unable to create prompt draft' });
        } finally {
            setIsSaving(false);
        }
    };

    const applyChangeRequestAction = async (requestId: string, action: 'submit_review' | 'approve' | 'publish' | 'reject') => {
        setIsSaving(true);
        setMessage(null);
        try {
            const response = await api.post(`/admin/config/change-requests/${requestId}/action`, {
                action,
                note: (requestNoteById[requestId] || '').trim() || undefined,
                allow_unsafe_prompt_change: action === 'publish' ? allowUnsafePromptChange : false,
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.detail || 'Unable to update prompt draft');
            if (action === 'publish') {
                await refreshLiveConfig();
                await refreshHistory();
            }
            await refreshChangeRequests();
            setRequestNoteById((prev) => ({ ...prev, [requestId]: '' }));
            setAllowUnsafePromptChange(false);
            setMessage({ type: 'success', text: payload.message || 'Prompt review workflow updated.' });
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unable to update prompt draft' });
        } finally {
            setIsSaving(false);
        }
    };

    const rollbackToEntry = async (entryId: string) => {
        const reason = (rollbackReasonById[entryId] || '').trim();
        if (!reason) {
            setMessage({ type: 'error', text: 'Add a rollback reason before restoring an older configuration.' });
            return;
        }
        setIsSaving(true);
        setMessage(null);
        try {
            const response = await api.post(`/admin/config/rollback/${entryId}`, {
                change_reason: reason,
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.detail || 'Unable to roll back AI configuration');
            const configResponse = await api.get('/admin/config');
            const configPayload = await configResponse.json().catch(() => ({}));
            if (configResponse.ok) {
                setConfig({
                    system_prompt: configPayload.system_prompt ?? '',
                    temperature: Number(configPayload.temperature ?? 0.7),
                    maintenance_mode: Boolean(configPayload.maintenance_mode),
                    web_search_enabled: configPayload.web_search_enabled !== false,
                    rag_threshold: Number(configPayload.rag_threshold ?? 0.5),
                });
            }
            setRollbackReasonById((prev) => ({ ...prev, [entryId]: '' }));
            await refreshHistory();
            setMessage({ type: 'success', text: 'AI configuration rolled back.' });
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unable to roll back AI configuration' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-5xl space-y-8">
            <header>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-500">Global Controls</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">AI Configuration</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    These settings affect the platform globally. University admins do not see or edit these controls.
                </p>
            </header>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm md:p-6">
                <div className="mb-6 flex items-center gap-3 border-b border-border pb-5">
                    <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
                        <Cpu className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="font-semibold">Model Behavior</h2>
                        <p className="text-xs text-muted-foreground">Prompt, temperature, and retrieval matching.</p>
                    </div>
                </div>

                {isLoading ? (
                    <p className="py-16 text-center text-sm text-muted-foreground">Loading configuration...</p>
                ) : (
                    <div className="space-y-6">
                        <div>
                            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground">System Prompt</label>
                            <textarea
                                value={config.system_prompt}
                                onChange={(event) => setConfig((prev) => ({ ...prev, system_prompt: event.target.value }))}
                                className="h-56 w-full rounded-xl border border-border bg-background p-4 font-mono text-sm leading-relaxed outline-none focus:border-amber-500"
                            />
                            <div className="mt-2 text-right text-xs text-muted-foreground">{config.system_prompt.length} chars</div>
                        </div>

                        <div>
                            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground">Change Reason</label>
                            <textarea
                                value={changeReason}
                                onChange={(event) => setChangeReason(event.target.value)}
                                placeholder="Why are you changing this configuration?"
                                className="h-24 w-full rounded-xl border border-border bg-background p-4 text-sm leading-relaxed outline-none focus:border-amber-500"
                            />
                            <p className="mt-2 text-xs text-muted-foreground">
                                Required when changing the system prompt. Stored in the config change history for audits and rollbacks.
                            </p>
                        </div>

                        {lintWarnings.length > 0 ? (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                                <p className="text-sm font-semibold text-foreground">Prompt lint warnings</p>
                                <div className="mt-2 space-y-1">
                                    {lintWarnings.map((warning) => (
                                        <p key={warning} className="text-sm text-muted-foreground">
                                            - {warning}
                                        </p>
                                    ))}
                                </div>
                                <label className="mt-4 flex items-center gap-3 text-sm font-medium text-foreground">
                                    <input
                                        type="checkbox"
                                        checked={allowUnsafePromptChange}
                                        onChange={(event) => setAllowUnsafePromptChange(event.target.checked)}
                                        className="h-4 w-4 rounded border-border accent-amber-500"
                                    />
                                    I understand these warnings and want to allow this prompt change anyway.
                                </label>
                            </div>
                        ) : null}

                        <Slider
                            label="Temperature"
                            value={config.temperature}
                            min={0}
                            max={1}
                            step={0.1}
                            onChange={(value) => setConfig((prev) => ({ ...prev, temperature: value }))}
                        />
                        <Slider
                            label="RAG Match Threshold"
                            value={config.rag_threshold}
                            min={0.1}
                            max={1}
                            step={0.05}
                            onChange={(value) => setConfig((prev) => ({ ...prev, rag_threshold: value }))}
                        />

                        <div className="grid gap-4 md:grid-cols-2">
                            <ToggleRow
                                icon={Wrench}
                                title="Maintenance Mode"
                                description="Disable normal user access temporarily."
                                checked={config.maintenance_mode}
                                onChange={(checked) => setConfig((prev) => ({ ...prev, maintenance_mode: checked }))}
                            />
                            <ToggleRow
                                icon={Globe}
                                title="Web Search"
                                description="Allow the AI to use live web search where supported."
                                checked={config.web_search_enabled}
                                onChange={(checked) => setConfig((prev) => ({ ...prev, web_search_enabled: checked }))}
                            />
                        </div>

                        <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                            {message ? (
                                <p className={`inline-flex items-center gap-2 text-sm font-medium ${message.type === 'success' ? 'text-emerald-500' : 'text-destructive'}`}>
                                    {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                                    {message.text}
                                </p>
                            ) : <span />}
                            <div className="flex flex-col gap-3 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={() => saveLiveSettings()}
                                    disabled={isSaving || !liveSettingsChanged}
                                    className="rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-bold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isSaving ? 'Saving...' : 'Save Live Settings'}
                                </button>
                                <button
                                    type="button"
                                    onClick={createPromptDraft}
                                    disabled={isSaving || !promptChanged}
                                    className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isSaving ? 'Working...' : 'Create Prompt Draft'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm md:p-6">
                <div className="mb-6 flex items-center gap-3 border-b border-border pb-5">
                    <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
                        <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="font-semibold">Prompt Review Workflow</h2>
                        <p className="text-xs text-muted-foreground">Sensitive prompt edits move through draft, review, approval, and publish.</p>
                    </div>
                </div>

                {isLoading ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">Loading prompt drafts...</p>
                ) : changeRequests.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-background px-4 py-10 text-center text-sm text-muted-foreground">
                        No prompt drafts yet.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {changeRequests.map((entry) => (
                            <div key={entry.id} className="rounded-xl border border-border bg-background p-4">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold text-foreground">{entry.change_reason}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {entry.requested_by_email || 'Unknown editor'} • {entry.updated_at ? new Date(entry.updated_at).toLocaleString() : 'Unknown time'}
                                        </p>
                                        {entry.note ? (
                                            <p className="text-sm text-muted-foreground">{entry.note}</p>
                                        ) : null}
                                    </div>
                                    <div className="rounded-full bg-muted px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                        {entry.status}
                                    </div>
                                </div>

                                {entry.lint_warnings.length > 0 ? (
                                    <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                                        <p className="text-sm font-semibold text-foreground">Lint warnings</p>
                                        <div className="mt-2 space-y-1">
                                            {entry.lint_warnings.map((warning) => (
                                                <p key={warning} className="text-sm text-muted-foreground">- {warning}</p>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}

                                <div className="mt-4 grid gap-3 text-xs text-muted-foreground md:grid-cols-4">
                                    <div>Temp: <span className="font-semibold text-foreground">{Number(entry.temperature ?? 0.7).toFixed(1)}</span></div>
                                    <div>RAG: <span className="font-semibold text-foreground">{Number(entry.rag_threshold ?? 0.5).toFixed(2)}</span></div>
                                    <div>Maintenance: <span className="font-semibold text-foreground">{entry.maintenance_mode ? 'On' : 'Off'}</span></div>
                                    <div>Web search: <span className="font-semibold text-foreground">{entry.web_search_enabled ? 'On' : 'Off'}</span></div>
                                </div>

                                <details className="mt-4 rounded-xl border border-border bg-card p-4">
                                    <summary className="cursor-pointer text-sm font-semibold text-foreground">View proposed prompt</summary>
                                    <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-muted-foreground">
                                        {entry.system_prompt}
                                    </pre>
                                </details>

                                <div className="mt-4 space-y-3">
                                    <input
                                        type="text"
                                        value={requestNoteById[entry.id] || ''}
                                        onChange={(event) => setRequestNoteById((prev) => ({ ...prev, [entry.id]: event.target.value }))}
                                        placeholder="Workflow note (optional)"
                                        className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-amber-500"
                                    />
                                    {entry.status === 'approved' && entry.lint_warnings.length > 0 ? (
                                        <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                                            <input
                                                type="checkbox"
                                                checked={allowUnsafePromptChange}
                                                onChange={(event) => setAllowUnsafePromptChange(event.target.checked)}
                                                className="h-4 w-4 rounded border-border accent-amber-500"
                                            />
                                            Allow publishing this warning-bearing prompt.
                                        </label>
                                    ) : null}
                                    <div className="flex flex-wrap gap-3">
                                        {entry.status === 'draft' ? (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => applyChangeRequestAction(entry.id, 'submit_review')}
                                                    disabled={isSaving}
                                                    className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    Submit For Review
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => applyChangeRequestAction(entry.id, 'reject')}
                                                    disabled={isSaving}
                                                    className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    Reject
                                                </button>
                                            </>
                                        ) : null}
                                        {entry.status === 'review' ? (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => applyChangeRequestAction(entry.id, 'approve')}
                                                    disabled={isSaving}
                                                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    Approve
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => applyChangeRequestAction(entry.id, 'reject')}
                                                    disabled={isSaving}
                                                    className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    Reject
                                                </button>
                                            </>
                                        ) : null}
                                        {entry.status === 'approved' ? (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => applyChangeRequestAction(entry.id, 'publish')}
                                                    disabled={isSaving}
                                                    className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    Publish
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => applyChangeRequestAction(entry.id, 'reject')}
                                                    disabled={isSaving}
                                                    className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    Reject
                                                </button>
                                            </>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm md:p-6">
                <div className="mb-6 flex items-center gap-3 border-b border-border pb-5">
                    <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
                        <Wrench className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="font-semibold">Configuration History</h2>
                        <p className="text-xs text-muted-foreground">Recent prompt and model-setting changes with rollback support.</p>
                    </div>
                </div>

                {isLoading ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">Loading history...</p>
                ) : history.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-background px-4 py-10 text-center text-sm text-muted-foreground">
                        No configuration history entries yet.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {history.map((entry) => (
                            <div key={entry.id} className="rounded-xl border border-border bg-background p-4">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold text-foreground">
                                            {entry.change_type === 'rollback' ? 'Rollback applied' : 'Configuration updated'}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {entry.changed_by_email || 'Unknown editor'} • {entry.created_at ? new Date(entry.created_at).toLocaleString() : 'Unknown time'}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {entry.change_reason || 'No reason provided'}
                                        </p>
                                        {entry.rolled_back_from_id ? (
                                            <p className="text-xs text-muted-foreground">Rolled back from entry {entry.rolled_back_from_id}</p>
                                        ) : null}
                                    </div>
                                    <div className="rounded-full bg-muted px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                        {entry.change_type}
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-3 text-xs text-muted-foreground md:grid-cols-4">
                                    <div>Temp: <span className="font-semibold text-foreground">{Number(entry.temperature ?? 0.7).toFixed(1)}</span></div>
                                    <div>RAG: <span className="font-semibold text-foreground">{Number(entry.rag_threshold ?? 0.5).toFixed(2)}</span></div>
                                    <div>Maintenance: <span className="font-semibold text-foreground">{entry.maintenance_mode ? 'On' : 'Off'}</span></div>
                                    <div>Web search: <span className="font-semibold text-foreground">{entry.web_search_enabled ? 'On' : 'Off'}</span></div>
                                </div>

                                <div className="mt-4 flex flex-col gap-3 md:flex-row">
                                    <input
                                        type="text"
                                        value={rollbackReasonById[entry.id] || ''}
                                        onChange={(event) => setRollbackReasonById((prev) => ({ ...prev, [entry.id]: event.target.value }))}
                                        placeholder="Rollback reason"
                                        className="flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-amber-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => rollbackToEntry(entry.id)}
                                        disabled={isSaving}
                                        className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-bold text-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Restore This Version
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
    return (
        <div>
            <div className="mb-3 flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</label>
                <span className="font-mono text-sm font-bold text-amber-500">{value.toFixed(step < 0.1 ? 2 : 1)}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                className="w-full accent-amber-500"
            />
        </div>
    );
}

function ToggleRow({ icon: Icon, title, description, checked, onChange }: { icon: React.ElementType; title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background p-4">
            <div className="flex items-center gap-3">
                <div className="rounded-lg bg-muted p-2 text-foreground">
                    <Icon className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="text-xs text-muted-foreground">{description}</p>
                </div>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" className="peer sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} />
                <div className="h-6 w-11 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-amber-500 peer-checked:after:translate-x-full" />
            </label>
        </div>
    );
}
