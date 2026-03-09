'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/auth-helpers-nextjs';
import { Search, Plus, Shield, Trash2, Check, X, Mail, Lock, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';

// Defined types matching Supabase structure
interface UserRole {
    id: string;
    email: string;
    role: 'admin' | 'super_admin'; // Using string union for roles
    is_admin: boolean; // Keep for backward compatibility if needed, but rely on 'role'
    user_id: string | null;
    created_at?: string;
}

export default function UsersPage() {
    const [users, setUsers] = useState<UserRole[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

    // Permission State
    const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'super_admin' | null>(null);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const fetchCurrentUserRole = useCallback(async () => {
        const response = await api.get('/me/bootstrap');
        if (!response.ok) return;
        const data = await response.json();
        if (data?.role) {
            setCurrentUserRole(data.role);
        }
    }, [supabase]);

    const fetchUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await api.get('/admin/users');
            if (!response.ok) throw new Error('Failed to fetch users');
            const payload = await response.json();
            setUsers(payload.data || []);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const init = async () => {
            await fetchCurrentUserRole();
            await fetchUsers();
        };
        init();
    }, [fetchCurrentUserRole, fetchUsers]);

    const handleDeleteUser = async (targetEmail: string) => {
        if (!confirm(`Are you sure you want to remove ${targetEmail}?`)) return;

        try {
            // We can call the backend API we set up, OR directly use Supabase since we have the client here.
            // Using backend for extra security check if desired, but user request implies DB logic here is fine for UI.
            // Let's use the backend endpoint since we just built it to be secure,
            // BUT we need the current user's email to pass as 'requester_email'.

            const response = await api.delete(`/admin/users?target_email=${encodeURIComponent(targetEmail)}`);

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Failed to delete');
            }

            // Remove from local state
            setUsers(prev => prev.filter(u => u.email !== targetEmail));

        } catch (err) {
            console.error(err);
            alert("Failed to remove user. Ensure you are a Super Admin.");
        }
    };

    const filteredUsers = users.filter(user =>
        user.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const isSuperAdmin = currentUserRole === 'super_admin';

    return (
        <div>
            {/* Header */}
            <header className="flex justify-between items-start mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-2xl font-bold text-foreground">Users Management</h2>
                        {!isSuperAdmin && currentUserRole && (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-bold uppercase tracking-wider">
                                <Lock className="w-3 h-3" />
                                View Only
                            </div>
                        )}
                    </div>
                    <p className="text-muted-foreground">Manage user access, roles, and invitations.</p>
                </div>
                {isSuperAdmin && (
                    <button
                        onClick={() => setIsInviteModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-500/20 transition-all"
                    >
                        <Plus className="w-4 h-4" />
                        Add New User
                    </button>
                )}
            </header>

            {/* Toolbar */}
            <div className="flex justify-between items-center mb-6 gap-4">
                <div className="flex items-center gap-2 flex-1 max-w-lg bg-card border border-border rounded-xl px-4 py-2.5 focus-within:border-primary/50 transition-colors">
                    <Search className="w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search users by email..."
                        className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground/70 text-foreground"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden backdrop-blur-sm min-h-[400px]">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm min-w-[600px]">
                        <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase tracking-wider text-xs font-semibold">
                            <tr>
                                <th className="px-6 py-4 whitespace-nowrap">User</th>
                                <th className="px-6 py-4 whitespace-nowrap">Role</th>
                                <th className="px-6 py-4 whitespace-nowrap">Status</th>
                                <th className="px-6 py-4 text-right whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-20 text-center text-muted-foreground">
                                        Loading users...
                                    </td>
                                </tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-20 text-center text-muted-foreground">
                                        No users found.
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map((user) => (
                                    <tr key={user.id || user.email} className="hover:bg-muted/50 transition-colors group">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border ${user.role === 'super_admin'
                                                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                                    : 'bg-primary/10 text-primary border-primary/20'
                                                    }`}>
                                                    {user.email.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="font-medium text-foreground">{user.email}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {user.role === 'super_admin' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm shadow-amber-500/10">
                                                    <ShieldAlert className="w-3 h-3" />
                                                    Super Admin
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                                                    <Shield className="w-3 h-3" />
                                                    Admin
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {user.user_id ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-green-500 bg-green-500/10 border border-green-500/20">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_color-mix(in_srgb,#22c55e,transparent_50%)]" />
                                                    Active
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-amber-500 bg-amber-500/10 border border-amber-500/20">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_color-mix(in_srgb,#f59e0b,transparent_50%)]" />
                                                    Pending Invite
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right whitespace-nowrap">
                                            {isSuperAdmin && user.role !== 'super_admin' ? (
                                                <button
                                                    onClick={() => handleDeleteUser(user.email)}
                                                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                                                    title="Delete User"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            ) : (
                                                <span className="text-muted-foreground/30 cursor-not-allowed" title={user.role === 'super_admin' ? "Super Admins cannot be deleted" : "View Only"}>
                                                    <Trash2 className="w-4 h-4 opacity-50" />
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Invite Modal */}
            <AnimatePresence>
                {isInviteModalOpen && (
                    <InviteModal
                        onClose={() => setIsInviteModalOpen(false)}
                        onSuccess={() => {
                            fetchUsers();
                            setIsInviteModalOpen(false);
                        }}
                    />
                )}
            </AnimatePresence>
        </div >
    );
}

function InviteModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<'admin' | 'super_admin'>('admin');
    const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('sending');
        setErrorMsg('');

        try {
            const response = await api.post('/admin/users', { email, role });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to add user.');
            }

            setStatus('success');
            setTimeout(() => {
                onSuccess();
            }, 1500);

        } catch (err: unknown) {
            console.error(err);
            setStatus('error');
            setErrorMsg(err instanceof Error ? err.message : "Failed to add user.");
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 relative"
            >
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-foreground">Add New User</h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                </div>

                {status === 'success' ? (
                    <div className="text-center py-8">
                        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Check className="w-8 h-8 text-green-400" />
                        </div>
                        <h4 className="text-lg font-bold text-foreground mb-2">User Added Successfully!</h4>
                        <p className="text-muted-foreground text-sm">{email} is now an {role === 'super_admin' ? 'Super Admin' : 'Admin'}.</p>
                    </div>
                ) : (
                    <form onSubmit={handleInvite} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-muted-foreground uppercase">Email Address</label>
                            <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-4 py-3 focus-within:border-primary/50 transition-colors">
                                <Mail className="w-4 h-4 text-muted-foreground" />
                                <input
                                    type="email"
                                    required
                                    placeholder="colleague@pansgpt.site"
                                    className="bg-transparent border-none outline-none text-sm w-full text-foreground placeholder:text-muted-foreground/70"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-muted-foreground uppercase">Role Assignment</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setRole('admin')}
                                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${role === 'admin'
                                        ? 'bg-primary/10 border-primary text-primary'
                                        : 'bg-muted/30 border-border text-muted-foreground hover:border-muted-foreground/50'
                                        }`}
                                >
                                    <Shield className="w-5 h-5" />
                                    <span className="text-xs font-bold">Admin</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRole('super_admin')}
                                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${role === 'super_admin'
                                        ? 'bg-amber-500/10 border-amber-500 text-amber-500'
                                        : 'bg-muted/30 border-border text-muted-foreground hover:border-muted-foreground/50'
                                        }`}
                                >
                                    <ShieldAlert className="w-5 h-5" />
                                    <span className="text-xs font-bold">Super Admin</span>
                                </button>
                            </div>
                        </div>

                        {errorMsg && (
                            <p className="text-red-400 text-xs text-center font-medium bg-red-500/10 py-2 rounded-lg">{errorMsg}</p>
                        )}

                        <div className="flex justify-end gap-3 pt-4">
                            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
                            <button
                                type="submit"
                                disabled={status === 'sending'}
                                className="px-6 py-2 rounded-lg text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-50 transition-all"
                            >
                                {status === 'sending' ? 'Adding...' : 'Add User'}
                            </button>
                        </div>
                    </form>
                )}
            </motion.div>
        </motion.div>
    );
}
