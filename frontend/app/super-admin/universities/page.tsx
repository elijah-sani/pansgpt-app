'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Edit3, LogIn, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';

import { setAdminWorkspaceUniversity } from '@/lib/admin-workspace';
import { api } from '@/lib/api';

type University = {
    id: string;
    name: string;
    short_name?: string | null;
    country?: string | null;
    state?: string | null;
    status?: string | null;
};

type UniversityForm = {
    id?: string;
    name: string;
    short_name: string;
    country: string;
    state: string;
    status: 'active' | 'suspended';
};

const emptyForm: UniversityForm = {
    name: '',
    short_name: '',
    country: 'Nigeria',
    state: '',
    status: 'active',
};

export default function SuperAdminUniversitiesPage() {
    const router = useRouter();
    const [universities, setUniversities] = useState<University[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [form, setForm] = useState<UniversityForm>(emptyForm);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');

    const loadUniversities = async () => {
        setIsLoading(true);
        try {
            const response = await api.get('/admin/universities');
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.detail || 'Unable to load universities');
            setUniversities(payload.data || []);
        } catch (err) {
            setMessage(err instanceof Error ? err.message : 'Unable to load universities');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadUniversities();
    }, []);

    const filteredUniversities = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return universities;
        return universities.filter((university) =>
            `${university.name} ${university.short_name || ''} ${university.country || ''} ${university.state || ''} ${university.status || ''}`
                .toLowerCase()
                .includes(normalized)
        );
    }, [query, universities]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsSaving(true);
        setMessage('');
        try {
            const payload = {
                name: form.name.trim(),
                short_name: form.short_name.trim() || null,
                country: form.country.trim() || null,
                state: form.state.trim() || null,
                status: form.status,
            };
            const response = form.id
                ? await api.patch(`/admin/universities/${form.id}`, payload)
                : await api.post('/admin/universities', payload);
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.detail || 'Unable to save university');
            setForm(emptyForm);
            setMessage(form.id ? 'University updated.' : 'University created.');
            await loadUniversities();
        } catch (err) {
            setMessage(err instanceof Error ? err.message : 'Unable to save university');
        } finally {
            setIsSaving(false);
        }
    };

    const startEdit = (university: University) => {
        setForm({
            id: university.id,
            name: university.name || '',
            short_name: university.short_name || '',
            country: university.country || '',
            state: university.state || '',
            status: normalizeStatus(university.status),
        });
    };

    const enterWorkspace = (university: University) => {
        const status = (university.status || 'active').toLowerCase();
        if (status === 'suspended') {
            toast.error('This university workspace is suspended. Please reactivate it first.');
            return;
        }
        if (status !== 'active') {
            toast.error('This university workspace is not active.');
            return;
        }
        setAdminWorkspaceUniversity(university.id, university.name);
        router.push('/admin');
    };

    return (
        <div className="mx-auto w-full max-w-6xl space-y-8">
            <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-500">Platform Setup</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight">Universities</h1>
                    <p className="mt-2 text-sm text-muted-foreground">Create schools, manage lifecycle state, and enter a selected university workspace.</p>
                </div>
            </header>

            <section className="grid gap-6 lg:grid-cols-[24rem_1fr]">
                <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <div className="mb-5 flex items-center gap-3">
                        <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
                            <Plus className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="font-semibold">{form.id ? 'Edit University' : 'Create University'}</h2>
                            <p className="text-xs text-muted-foreground">Lifecycle support uses the current backend statuses.</p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <Field label="Name" value={form.name} onChange={(value) => setForm((prev) => ({ ...prev, name: value }))} required />
                        <Field label="Short Name" value={form.short_name} onChange={(value) => setForm((prev) => ({ ...prev, short_name: value }))} />
                        <Field label="Country" value={form.country} onChange={(value) => setForm((prev) => ({ ...prev, country: value }))} />
                        <Field label="State" value={form.state} onChange={(value) => setForm((prev) => ({ ...prev, state: value }))} />
                        <div>
                            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground">Status</label>
                            <select
                                value={form.status}
                                onChange={(event) => setForm((prev) => ({ ...prev, status: normalizeStatus(event.target.value) }))}
                                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-amber-500"
                            >
                                <option value="active">Active</option>
                                <option value="suspended">Suspended</option>
                            </select>
                        </div>
                        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                disabled={isSaving || !form.name.trim()}
                                className="flex-1 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isSaving ? 'Saving...' : form.id ? 'Save Changes' : 'Create University'}
                            </button>
                            {form.id ? (
                                <button type="button" onClick={() => setForm(emptyForm)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold">
                                    Cancel
                                </button>
                            ) : null}
                        </div>
                    </div>
                </form>

                <div className="space-y-4">
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search universities..."
                            className="w-full bg-transparent text-sm outline-none"
                        />
                    </div>
                    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full text-left text-sm">
                                <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                                    <tr>
                                        <th className="px-5 py-4">University</th>
                                        <th className="px-5 py-4">Location</th>
                                        <th className="px-5 py-4">Status</th>
                                        <th className="px-5 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {renderRows(filteredUniversities, isLoading, startEdit, enterWorkspace)}
                                </tbody>
                            </table>
                        </div>
                        <div className="divide-y divide-border md:hidden">
                            {isLoading ? <p className="p-6 text-sm text-muted-foreground">Loading universities...</p> : filteredUniversities.map((university) => (
                                <div key={university.id} className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h3 className="font-semibold">{university.name}</h3>
                                            <p className="mt-1 text-xs text-muted-foreground">{[university.short_name, university.state, university.country].filter(Boolean).join(' - ') || 'No metadata'}</p>
                                        </div>
                                        <StatusBadge status={university.status} />
                                    </div>
                                    <div className="mt-4 flex gap-2">
                                        <button onClick={() => startEdit(university)} className="flex-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold">Edit</button>
                                        <button
                                            onClick={() => enterWorkspace(university)}
                                            className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white"
                                        >
                                            Enter
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

function renderRows(universities: University[], isLoading: boolean, startEdit: (university: University) => void, enterWorkspace: (university: University) => void) {
    if (isLoading) {
        return <tr><td colSpan={4} className="px-5 py-16 text-center text-muted-foreground">Loading universities...</td></tr>;
    }
    if (universities.length === 0) {
        return <tr><td colSpan={4} className="px-5 py-16 text-center text-muted-foreground">No universities found.</td></tr>;
    }
    return universities.map((university) => (
        <tr key={university.id} className="hover:bg-muted/40">
            <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500"><Building2 className="h-4 w-4" /></div>
                    <div>
                        <p className="font-medium">{university.name}</p>
                        <p className="text-xs text-muted-foreground">{university.short_name || 'No short name'}</p>
                    </div>
                </div>
            </td>
            <td className="px-5 py-4 text-muted-foreground">{[university.state, university.country].filter(Boolean).join(', ') || 'Not set'}</td>
            <td className="px-5 py-4"><StatusBadge status={university.status} /></td>
            <td className="px-5 py-4">
                <div className="flex justify-end gap-2">
                    <button onClick={() => startEdit(university)} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground" title="Edit university">
                        <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => enterWorkspace(university)}
                        className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white"
                    >
                        <LogIn className="h-3.5 w-3.5" />
                        Enter Workspace
                    </button>
                </div>
            </td>
        </tr>
    ));
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
    return (
        <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</label>
            <input
                required={required}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-amber-500"
            />
        </div>
    );
}

function StatusBadge({ status }: { status?: string | null }) {
    const normalized = (status || 'active').toLowerCase();
    const active = normalized === 'active';
    return (
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${active ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500' : 'border-amber-500/20 bg-amber-500/10 text-amber-500'}`}>
            {normalized}
        </span>
    );
}

function normalizeStatus(value?: string | null): UniversityForm['status'] {
    const normalized = (value || 'active').toLowerCase();
    if (normalized === 'suspended') return 'suspended';
    return 'active';
}
