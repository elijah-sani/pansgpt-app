'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Mail, Search, Shield, UserCog, Trash2 } from 'lucide-react';

import { api } from '@/lib/api';

type University = {
    id: string;
    name: string;
    status?: string | null;
};

type AdminUser = {
    id: string;
    email: string;
    role: 'super_admin' | 'university_admin';
    admin_level?: 'senior' | 'standard' | null;
    user_id?: string | null;
    university_id?: string | null;
    university?: {
        id?: string | null;
        name?: string | null;
        status?: string | null;
    } | null;
    created_at?: string;
};

export default function SuperAdminUniversityAdminsPage() {
    const [admins, setAdmins] = useState<AdminUser[]>([]);
    const [universities, setUniversities] = useState<University[]>([]);
    const [email, setEmail] = useState('');
    const [universityId, setUniversityId] = useState('');
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');

    const load = async () => {
        setIsLoading(true);
        try {
            const [usersRes, universitiesRes] = await Promise.all([
                api.get('/admin/users'),
                api.get('/admin/universities'),
            ]);
            if (usersRes.ok) {
                const payload = await usersRes.json();
                setAdmins(payload.data || []);
            }
            if (universitiesRes.ok) {
                const payload = await universitiesRes.json();
                const active = (payload.data || []).filter((item: University) => (item.status || 'active').toLowerCase() === 'active');
                setUniversities(active);
                if (!universityId && active[0]?.id) setUniversityId(active[0].id);
            }
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const seniorAdmins = useMemo(() => (
        admins.filter((admin) => admin.role === 'university_admin' && admin.admin_level === 'senior')
    ), [admins]);

    const filteredAdmins = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return seniorAdmins;
        return seniorAdmins.filter((admin) =>
            `${admin.email} ${admin.university?.name || ''} ${admin.university_id || ''}`.toLowerCase().includes(normalized)
        );
    }, [query, seniorAdmins]);

    const handleAssign = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsSaving(true);
        setMessage('');
        try {
            const response = await api.post(`/super-admin/universities/${universityId}/senior-admins`, {
                email: email.trim(),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.detail || 'Unable to assign senior university admin');
            setEmail('');
            setMessage('Senior Admin access assigned.');
            await load();
        } catch (err) {
            setMessage(err instanceof Error ? err.message : 'Unable to assign senior university admin');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemove = async (univId: string, adminRoleId: string) => {
        if (!confirm('Are you sure you want to remove this senior admin? This cannot be undone.')) return;
        try {
            const response = await api.delete(`/super-admin/universities/${univId}/senior-admins/${adminRoleId}`);
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.detail || 'Unable to remove senior admin');
            await load();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Unable to remove senior admin');
        }
    };

    return (
        <div className="mx-auto w-full max-w-6xl space-y-8">
            <header>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-500">Access Control</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">Senior University Admins</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    Assign and manage senior university admins for active workspaces. Each university workspace requires at least one senior admin.
                </p>
            </header>

            <section className="grid gap-6 lg:grid-cols-[24rem_1fr]">
                <form onSubmit={handleAssign} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <div className="mb-5 flex items-center gap-3">
                        <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
                            <UserCog className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="font-semibold">Assign Senior Admin</h2>
                            <p className="text-xs text-muted-foreground">Creates or updates a senior `university_admin` role row.</p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground">Admin Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-amber-500"
                                placeholder="admin@university.edu"
                                required
                            />
                        </div>
                        <div>
                            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground">University</label>
                            <select
                                value={universityId}
                                onChange={(event) => setUniversityId(event.target.value)}
                                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-amber-500"
                                required
                            >
                                <option value="">Select active university</option>
                                {universities.map((university) => (
                                    <option key={university.id} value={university.id}>{university.name}</option>
                                ))}
                            </select>
                        </div>
                        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
                        <button
                            type="submit"
                            disabled={isSaving || !email.trim() || !universityId}
                            className="w-full rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isSaving ? 'Assigning...' : 'Assign Senior Admin Access'}
                        </button>
                    </div>
                </form>

                <div className="space-y-4">
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search senior university admins..."
                            className="w-full bg-transparent text-sm outline-none"
                        />
                    </div>
                    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full text-left text-sm">
                                <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                                    <tr>
                                        <th className="px-5 py-4">Admin</th>
                                        <th className="px-5 py-4">University</th>
                                        <th className="px-5 py-4">Role / Level</th>
                                        <th className="px-5 py-4">Created Date</th>
                                        <th className="px-5 py-4">Status</th>
                                        <th className="px-5 py-4">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {isLoading ? (
                                        <tr><td colSpan={6} className="px-5 py-16 text-center text-muted-foreground">Loading admins...</td></tr>
                                    ) : filteredAdmins.length === 0 ? (
                                        <tr><td colSpan={6} className="px-5 py-16 text-center text-muted-foreground">No senior university admins found.</td></tr>
                                    ) : filteredAdmins.map((admin) => (
                                        <tr key={admin.id || admin.email} className="hover:bg-muted/40">
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500"><Mail className="h-4 w-4" /></div>
                                                    <div>
                                                        <p className="font-medium">{admin.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-muted-foreground">{admin.university?.name || admin.university_id || 'Not assigned'}</td>
                                            <td className="px-5 py-4">
                                                <span className="inline-flex rounded bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-500">
                                                    Senior Admin
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-muted-foreground text-xs">
                                                {admin.created_at ? new Date(admin.created_at).toLocaleDateString() : '-'}
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${admin.user_id ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500' : 'border-amber-500/20 bg-amber-500/10 text-amber-500'}`}>
                                                    {admin.user_id ? 'Active user' : 'Pending Signup'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <button
                                                    onClick={() => handleRemove(admin.university_id || '', admin.id)}
                                                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-500"
                                                    title="Remove Senior Admin Access"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="divide-y divide-border md:hidden">
                            {filteredAdmins.map((admin) => (
                                <div key={admin.id || admin.email} className="p-4 flex justify-between items-center">
                                    <div className="flex items-start gap-3 min-w-0">
                                        <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500"><Shield className="h-4 w-4" /></div>
                                        <div className="min-w-0">
                                            <p className="truncate font-medium">{admin.email}</p>
                                            <p className="text-xs text-muted-foreground truncate">{admin.university?.name || admin.university_id || 'Not assigned'}</p>
                                            <p className="text-xs text-amber-500 font-bold mt-1">Senior Admin</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleRemove(admin.university_id || '', admin.id)}
                                        className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-red-500 ml-4"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

