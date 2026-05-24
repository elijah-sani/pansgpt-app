'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock3, Loader2, Search } from 'lucide-react';

import { api } from '@/lib/api';
import {
    buildAdminSearchResults,
    groupAdminSearchResults,
    type AdminSearchDocument,
    type AdminSearchLecturer,
    type AdminSearchRestriction,
    type AdminSearchResult,
    type AdminSearchStudent,
} from '@/lib/admin-dashboard-search';

const RECENT_SEARCHES_KEY = 'admin-dashboard-recent-searches';

function AdminSearchContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialQuery = searchParams.get('q') || '';
    const [query, setQuery] = useState(initialQuery);
    const [students, setStudents] = useState<AdminSearchStudent[]>([]);
    const [documents, setDocuments] = useState<AdminSearchDocument[]>([]);
    const [lecturers, setLecturers] = useState<AdminSearchLecturer[]>([]);
    const [restrictions, setRestrictions] = useState<AdminSearchRestriction[]>([]);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const stored = window.localStorage.getItem(RECENT_SEARCHES_KEY);
        if (!stored) {
            return;
        }

        try {
            const parsed = JSON.parse(stored) as unknown;
            if (Array.isArray(parsed)) {
                setRecentSearches(parsed.filter((item): item is string => typeof item === 'string').slice(0, 6));
            }
        } catch {
            window.localStorage.removeItem(RECENT_SEARCHES_KEY);
        }
    }, []);

    useEffect(() => {
        let active = true;

        const loadSearchData = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const [studentsResponse, documentsResponse, lecturersResponse, restrictionsResponse] = await Promise.all([
                    api.get('/admin/students'),
                    api.get('/admin/documents'),
                    api.get('/admin/lecturers'),
                    api.get('/admin/restrictions'),
                ]);

                const nextStudents = studentsResponse.ok ? (((await studentsResponse.json()) as { data?: AdminSearchStudent[] }).data || []) : [];
                const nextDocumentsPayload = documentsResponse.ok
                    ? ((await documentsResponse.json()) as { documents?: AdminSearchDocument[]; data?: AdminSearchDocument[] })
                    : null;
                const nextDocuments = nextDocumentsPayload?.documents || nextDocumentsPayload?.data || [];
                const nextLecturers = lecturersResponse.ok ? (((await lecturersResponse.json()) as { data?: AdminSearchLecturer[] }).data || []) : [];
                const nextRestrictions = restrictionsResponse.ok ? (((await restrictionsResponse.json()) as { data?: AdminSearchRestriction[] }).data || []) : [];

                if (!active) {
                    return;
                }

                setStudents(nextStudents);
                setDocuments(nextDocuments);
                setLecturers(nextLecturers);
                setRestrictions(nextRestrictions);
            } catch (err) {
                if (!active) {
                    return;
                }
                setError(err instanceof Error ? err.message : 'Unable to load admin search.');
            } finally {
                if (active) {
                    setIsLoading(false);
                }
            }
        };

        void loadSearchData();

        return () => {
            active = false;
        };
    }, []);

    const searchResults = useMemo(
        () =>
            buildAdminSearchResults({
                query,
                students,
                documents,
                lecturers,
                restrictions,
                limit: 24,
            }),
        [documents, lecturers, query, restrictions, students]
    );

    const groupedResults = useMemo(() => groupAdminSearchResults(searchResults), [searchResults]);
    const hasQuery = query.trim().length > 0;

    const saveRecentSearch = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) {
            return;
        }

        const nextRecent = [trimmed, ...recentSearches.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 6);
        setRecentSearches(nextRecent);
        window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(nextRecent));
    };

    const handleResultSelect = (result: AdminSearchResult) => {
        saveRecentSearch(query || result.title);
        router.push(result.href);
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (searchResults.length > 0) {
            handleResultSelect(searchResults[0]);
            return;
        }

        saveRecentSearch(query);
    };

    return (
        <div className="-mx-4 min-h-[100dvh] bg-[#141414] px-4 pb-8 pt-3 text-foreground sm:-mx-5 sm:px-5 md:mx-0 md:min-h-0 md:bg-transparent md:px-0 md:pt-0">
            <div className="mx-auto w-full max-w-3xl">
                <form onSubmit={handleSubmit} className="sticky top-0 z-20 -mx-4 border-b border-white/10 bg-[#141414] px-4 pb-2 pt-1 sm:-mx-5 sm:px-5 md:static md:mx-0 md:border-b-0 md:bg-transparent md:px-0 md:pb-0 md:pt-0">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                if (window.history.length > 1) {
                                    router.back();
                                    return;
                                }
                                router.push('/admin');
                            }}
                            aria-label="Go back"
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/5"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </button>

                        <div className="relative flex-1 border-b border-white/20">
                            <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="search"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Search admin"
                                autoFocus
                                className="h-12 w-full bg-transparent pl-7 pr-0 text-base text-foreground outline-none placeholder:text-muted-foreground"
                            />
                        </div>
                    </div>
                </form>

                <div className="pt-4 md:pt-6">
                    {error ? (
                        <section className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
                            <p className="text-sm font-medium text-rose-200">Unable to load search data</p>
                            <p className="mt-2 text-sm text-rose-100/90">{error}</p>
                        </section>
                    ) : isLoading ? (
                        <div className="flex min-h-[35vh] items-center justify-center">
                            <Loader2 className="h-7 w-7 animate-spin text-primary" />
                        </div>
                    ) : hasQuery ? (
                        groupedResults.length === 0 ? (
                            <div className="pt-6">
                                <p className="text-sm font-medium text-foreground">No matches found.</p>
                                <p className="mt-2 text-sm leading-6 text-muted-foreground">Try searching for home, library, students, lecturers, or restrictions.</p>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                {groupedResults.map((group) => (
                                    <section key={group.category}>
                                        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{group.category}</h2>
                                        <div className="mt-2">
                                            {group.items.map((result) => (
                                                <button
                                                    key={result.id}
                                                    type="button"
                                                    onClick={() => handleResultSelect(result)}
                                                    className="flex w-full items-start gap-3 border-b border-white/8 py-3 text-left transition-colors hover:bg-white/[0.02]"
                                                >
                                                    <Search className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium text-foreground">{result.title}</p>
                                                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{result.description}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                ))}
                            </div>
                        )
                    ) : (
                        <div className="space-y-6">
                            {recentSearches.length > 0 ? (
                                <section>
                                    <div className="flex items-center justify-between gap-3">
                                        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Recent searches</h2>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setRecentSearches([]);
                                                window.localStorage.removeItem(RECENT_SEARCHES_KEY);
                                            }}
                                            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                    <div className="mt-2 space-y-1">
                                        {recentSearches.map((item) => (
                                            <button
                                                key={item}
                                                type="button"
                                                onClick={() => setQuery(item)}
                                                className="flex w-full items-center gap-3 border-b border-white/8 py-3 text-left transition-colors hover:bg-white/[0.02]"
                                            >
                                                <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                <span className="truncate text-sm text-foreground">{item}</span>
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            ) : null}

                            <section>
                                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Suggested</h2>
                                <div className="mt-2 space-y-1">
                                    {[
                                        { label: 'Home', href: '/admin' },
                                        { label: 'Library', href: '/admin/library' },
                                        { label: 'Students', href: '/admin/students' },
                                        { label: 'Lecturers', href: '/admin/lecturers' },
                                        { label: 'Restrictions', href: '/admin/restrictions' },
                                        { label: 'Settings', href: '/admin/settings' },
                                    ].map((item) => (
                                        <Link
                                            key={item.label}
                                            href={item.href}
                                            className="flex items-center gap-3 border-b border-white/8 py-3 text-left transition-colors hover:bg-white/[0.02]"
                                        >
                                            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                                            <span className="truncate text-sm text-foreground">{item.label}</span>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function AdminSearchPage() {
    return (
        <Suspense fallback={null}>
            <AdminSearchContent />
        </Suspense>
    );
}
