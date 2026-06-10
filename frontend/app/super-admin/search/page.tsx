'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpLeft, Building2, Cpu, HeartPulse, Search, ShieldAlert, UserCog } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { api } from '@/lib/api';

type University = {
    id: string;
    name: string;
    short_name?: string | null;
    status?: string | null;
};

type AdminUser = {
    id?: string;
    email: string;
    role: string;
    university_id?: string | null;
    university?: {
        name?: string | null;
    } | null;
};

type SearchResult = {
    id: string;
    title: string;
    description: string;
    href: string;
    icon: LucideIcon;
};

const shortcuts: SearchResult[] = [
    { id: 'overview', title: 'Overview', description: 'Open platform overview.', href: '/super-admin', icon: ShieldAlert },
    { id: 'universities', title: 'Universities', description: 'Manage universities and enter workspaces.', href: '/super-admin/universities', icon: Building2 },
    { id: 'university-admins', title: 'University Admins', description: 'Assign school workspace operators.', href: '/super-admin/university-admins', icon: UserCog },
    { id: 'ai', title: 'AI Configuration', description: 'Edit global AI controls.', href: '/super-admin/ai-configuration', icon: Cpu },
    { id: 'health', title: 'System Health', description: 'Check supported platform endpoints.', href: '/super-admin/system-health', icon: HeartPulse },
];

export default function SuperAdminSearchPage() {
    const [query, setQuery] = useState('');
    const [universities, setUniversities] = useState<University[]>([]);
    const [admins, setAdmins] = useState<AdminUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            try {
                const [universitiesRes, usersRes] = await Promise.all([
                    api.get('/admin/universities'),
                    api.get('/admin/users'),
                ]);
                if (universitiesRes.ok) {
                    const payload = await universitiesRes.json();
                    setUniversities(payload.data || []);
                }
                if (usersRes.ok) {
                    const payload = await usersRes.json();
                    setAdmins(payload.data || []);
                }
            } finally {
                setIsLoading(false);
            }
        };
        void load();
    }, []);

    const results = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return [];

        const shortcutResults = shortcuts.filter((item) =>
            `${item.title} ${item.description}`.toLowerCase().includes(normalized)
        );
        const universityResults: SearchResult[] = universities
            .filter((university) =>
                `${university.name} ${university.short_name || ''} ${university.status || ''}`.toLowerCase().includes(normalized)
            )
            .map((university) => ({
                id: `university-${university.id}`,
                title: university.name,
                description: `${university.short_name || 'University'} - ${university.status || 'active'}`,
                href: '/super-admin/universities',
                icon: Building2,
            }));
        const adminResults: SearchResult[] = admins
            .filter((admin) =>
                `${admin.email} ${admin.role} ${admin.university?.name || ''} ${admin.university_id || ''}`.toLowerCase().includes(normalized)
            )
            .map((admin) => ({
                id: `admin-${admin.id || admin.email}`,
                title: admin.email,
                description: `${admin.role} - ${admin.university?.name || admin.university_id || 'Platform'}`,
                href: '/super-admin/university-admins',
                icon: UserCog,
            }));

        return [...shortcutResults, ...universityResults, ...adminResults].slice(0, 24);
    }, [admins, query, universities]);

    return (
        <div className="mx-auto w-full max-w-4xl space-y-6 pb-12">
            <header>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-500">Platform Search</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">Search</h1>
            </header>

            <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
                <Search className="h-4 w-4 text-amber-500" />
                <input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search universities, admins, or platform pages..."
                    className="w-full bg-transparent text-sm outline-none"
                />
            </div>

            <div className="pt-1">
                {isLoading ? (
                    <p className="px-1 py-6 text-center text-sm text-muted-foreground">Loading platform index...</p>
                ) : results.length === 0 ? (
                    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <Search className="h-5 w-5" />
                        </div>
                        <p className="mt-4 text-sm font-semibold text-foreground">No results found</p>
                        <p className="mt-1 max-w-xs text-xs text-muted-foreground">Try a university name, admin email, or platform page.</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {results.map((result) => (
                            <Link key={result.id} href={result.href} className="flex min-h-[4rem] items-center gap-4 rounded-xl px-1 py-2 transition-colors hover:bg-muted/40 md:px-2">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground">
                                    <Search className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-base font-semibold leading-snug text-foreground">{result.title}</p>
                                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{result.description}</p>
                                </div>
                                <ArrowUpLeft className="h-5 w-5 shrink-0 text-muted-foreground/70" />
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
