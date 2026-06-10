'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Mail, Search, Shield, UserCog, Trash2, ShieldAlert } from 'lucide-react';

import { api } from '@/lib/api';
import { getAdminWorkspaceUniversityId } from '@/lib/admin-workspace';
import { fetchBootstrap } from '@/lib/bootstrap-cache';

type AdminUser = {
    id: string;
    email: string;
    role: 'super_admin' | 'university_admin';
    admin_level?: 'senior' | 'standard' | null;
    user_id?: string | null;
    university_id?: string | null;
    created_at?: string;
};

export default function WorkspaceAdminsPage() {
    const [admins, setAdmins] = useState<AdminUser[]>([]);
    const [email, setEmail] = useState('');
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');
    
    // Permission state
    const [canManage, setCanManage] = useState(false);
    const [isSeniorAdmin, setIsSeniorAdmin] = useState(false);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);

    const checkPermissionsAndLoad = async () => {
        setIsLoading(true);
        try {
            const data = await fetchBootstrap();
            if (data) {
                const superAdmin = Boolean(data.is_super_admin);
                const seniorAdmin = Boolean(data.is_senior_university_admin || data.admin_level === 'senior');
                setIsSuperAdmin(superAdmin);
                setIsSeniorAdmin(seniorAdmin);
                setCanManage(superAdmin || seniorAdmin);
            }

            const univId = getAdminWorkspaceUniversityId();
            const url = univId ? `/admin/admins?university_id=${encodeURIComponent(univId)}` : '/admin/admins';
            const response = await api.get(url);
            if (response.ok) {
                const payload = await response.json();
                setAdmins(payload.data || []);
            }
        } catch (err) {
            console.error('Failed to load workspace admins:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void checkPermissionsAndLoad();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filteredAdmins = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return admins;
        return admins.filter((admin) =>
            admin.email.toLowerCase().includes(normalized)
        );
    }, [query, admins]);

    const handleAddAdmin = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsSaving(true);
        setMessage('');
        try {
            const univId = getAdminWorkspaceUniversityId();
            const url = univId ? `/admin/admins?university_id=${encodeURIComponent(univId)}` : '/admin/admins';
            
            const response = await api.post(url, {
                email: email.trim(),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.detail || 'Unable to add workspace admin');
            setEmail('');
            setMessage('Admin access assigned.');
            await checkPermissionsAndLoad();
        } catch (err) {
            setMessage(err instanceof Error ? err.message : 'Unable to add workspace admin');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveAdmin = async (adminRoleId: string) => {
        if (!confirm('Are you sure you want to remove this admin? This cannot be undone.')) return;
        try {
            const univId = getAdminWorkspaceUniversityId();
            const url = univId 
                ? `/admin/admins/${adminRoleId}?university_id=${encodeURIComponent(univId)}` 
                : `/admin/admins/${adminRoleId}`;
            
            const response = await api.delete(url);
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.detail || 'Unable to remove admin');
            await checkPermissionsAndLoad();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Unable to remove admin');
        }
    };

    return (
        <div className="mx-auto w-full max-w-6xl space-y-8">
            <header>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-500 font-sans">Workspace Management</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground font-sans">Admins</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    List and manage administrative access to this university workspace.
                </p>
            </header>

            <section className="grid gap-6 lg:grid-cols-[24rem_1fr]">
                {/* Form Section */}
                <div className="space-y-4">
                    {canManage ? (
                        <form onSubmit={handleAddAdmin} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                            <div className="mb-5 flex items-center gap-3">
                                <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
                                    <UserCog className="h-5 w-5" />
                                </div>
                                <div>
                                    <h2 className="font-semibold text-foreground">Add Standard Admin</h2>
                                    <p className="text-xs text-muted-foreground">Assign standard university admin privileges.</p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground">Admin Email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500"
                                        placeholder="admin@university.edu"
                                        required
                                    />
                                </div>
                                {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
                                <button
                                    type="submit"
                                    disabled={isSaving || !email.trim()}
                                    className="w-full rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-amber-700 transition-colors"
                                >
                                    {isSaving ? 'Saving...' : 'Add Admin'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="rounded-xl border border-border bg-card p-5 shadow-sm flex items-start gap-3 text-sm text-muted-foreground">
                            <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
                            <div>
                                <p className="font-semibold text-foreground">Read-Only Access</p>
                                <p className="mt-1 text-xs text-muted-foreground">Only senior admins can manage admin access.</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Table Section */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search workspace admins..."
                            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                        />
                    </div>
                    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full text-left text-sm">
                                <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                                    <tr>
                                        <th className="px-5 py-4">Admin</th>
                                        <th className="px-5 py-4">Level / Role</th>
                                        <th className="px-5 py-4">Created Date</th>
                                        <th className="px-5 py-4">Status</th>
                                        {canManage && <th className="px-5 py-4">Action</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {isLoading ? (
                                        <tr><td colSpan={canManage ? 5 : 4} className="px-5 py-16 text-center text-muted-foreground">Loading admins...</td></tr>
                                    ) : filteredAdmins.length === 0 ? (
                                        <tr><td colSpan={canManage ? 5 : 4} className="px-5 py-16 text-center text-muted-foreground">No admins found in this workspace.</td></tr>
                                    ) : filteredAdmins.map((admin) => (
                                        <tr key={admin.id || admin.email} className="hover:bg-muted/40 transition-colors">
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500"><Mail className="h-4 w-4" /></div>
                                                    <div>
                                                        <p className="font-medium text-foreground">{admin.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className={`inline-flex rounded px-2 py-0.5 text-xs font-bold ${
                                                    admin.admin_level === 'senior' 
                                                        ? 'bg-amber-500/10 text-amber-500' 
                                                        : 'bg-blue-500/10 text-blue-500'
                                                }`}>
                                                    {admin.admin_level === 'senior' ? 'Senior Admin' : 'Standard Admin'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-muted-foreground text-xs">
                                                {admin.created_at ? new Date(admin.created_at).toLocaleDateString() : '-'}
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${
                                                    admin.user_id 
                                                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500' 
                                                        : 'border-amber-500/20 bg-amber-500/10 text-amber-500'
                                                }`}>
                                                    {admin.user_id ? 'Active user' : 'Pending Signup'}
                                                </span>
                                            </td>
                                            {canManage && (
                                                <td className="px-5 py-4">
                                                    {admin.admin_level !== 'senior' && admin.role !== 'super_admin' ? (
                                                        <button
                                                            onClick={() => handleRemoveAdmin(admin.id)}
                                                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-500 transition-colors"
                                                            title="Remove Admin Access"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground italic">Protected</span>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="divide-y divide-border md:hidden">
                            {filteredAdmins.map((admin) => (
                                <div key={admin.id || admin.email} className="p-4 flex justify-between items-center bg-card">
                                    <div className="flex items-start gap-3 min-w-0">
                                        <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500"><Shield className="h-4 w-4" /></div>
                                        <div className="min-w-0">
                                            <p className="truncate font-medium text-foreground">{admin.email}</p>
                                            <p className={`text-xs font-bold mt-1 ${
                                                admin.admin_level === 'senior' ? 'text-amber-500' : 'text-blue-500'
                                            }`}>
                                                {admin.admin_level === 'senior' ? 'Senior Admin' : 'Standard Admin'}
                                            </p>
                                        </div>
                                    </div>
                                    {canManage && admin.admin_level !== 'senior' && admin.role !== 'super_admin' && (
                                        <button
                                            onClick={() => handleRemoveAdmin(admin.id)}
                                            className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-red-500 transition-colors ml-4"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
