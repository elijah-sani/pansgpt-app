'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Users, GraduationCap, Crown, User } from 'lucide-react';
import { api } from '@/lib/api';

interface Student {
    id: string;
    first_name: string | null;
    other_names: string | null;
    level: string | null;
    university: string | null;
    subscription_tier: string | null;
    updated_at: string | null;
    email?: string;
}

export default function StudentsPage() {
    const [students, setStudents] = useState<Student[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterUniversity, setFilterUniversity] = useState('all');
    const [filterLevel, setFilterLevel] = useState('all');
    const [filterTier, setFilterTier] = useState('all');
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    const fetchStudents = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await api.get('/admin/students');
            if (!response.ok) throw new Error('Failed to fetch students');
            const payload = await response.json();
            setStudents(payload.data || []);
        } catch (err) {
            console.error('Failed to fetch students:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchStudents(); }, [fetchStudents]);

    const handleToggleSubscription = async (student: Student) => {
        const newTier = student.subscription_tier === 'pro' ? 'free' : 'pro';
        setUpdatingId(student.id);

        // Optimistic update
        setStudents(prev => prev.map(s =>
            s.id === student.id ? { ...s, subscription_tier: newTier } : s
        ));

        try {
            const response = await api.patch(`/admin/students/${student.id}`, { subscription_tier: newTier });
            if (!response.ok) throw new Error('Failed to update subscription');
        } catch (err) {
            console.error('Failed to update subscription:', err);
            // Revert on failure
            setStudents(prev => prev.map(s =>
                s.id === student.id ? { ...s, subscription_tier: student.subscription_tier } : s
            ));
        } finally {
            setUpdatingId(null);
        }
    };

    const getDisplayName = (s: Student) => {
        const name = [s.first_name, s.other_names].filter(Boolean).join(' ').trim();
        return name || 'Unknown';
    };

    const universities = Array.from(new Set(students.map(s => s.university).filter(Boolean))) as string[];
    const levels = Array.from(new Set(students.map(s => s.level).filter(Boolean))) as string[];

    const filteredStudents = students.filter(s => {
        const name = getDisplayName(s).toLowerCase();
        const query = searchQuery.toLowerCase();
        const matchesSearch = name.includes(query) || (s.level || '').toLowerCase().includes(query);
        const matchesUniversity = filterUniversity === 'all' || s.university === filterUniversity;
        const matchesLevel = filterLevel === 'all' || s.level === filterLevel;
        const matchesTier = filterTier === 'all' || (s.subscription_tier || 'free') === filterTier;
        return matchesSearch && matchesUniversity && matchesLevel && matchesTier;
    });

    const proCount = students.filter(s => s.subscription_tier === 'pro').length;

    return (
        <div>
            {/* Header */}
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-foreground mb-1">Students</h2>
                    <p className="text-muted-foreground">Manage student subscriptions and view profiles.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-center px-4 py-2 bg-card border border-border rounded-xl">
                        <p className="text-xl font-bold text-foreground">{students.length}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                    <div className="text-center px-4 py-2 bg-primary/10 border border-primary/20 rounded-xl">
                        <p className="text-xl font-bold text-primary">{proCount}</p>
                        <p className="text-xs text-primary/70">Pro</p>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3 mb-6">
                {/* Search */}
                <div className="flex items-center gap-2 flex-1 max-w-sm bg-card border border-border rounded-xl px-4 py-2.5 focus-within:border-primary/50 transition-colors">
                    <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                    <input
                        type="text"
                        placeholder="Search by name or level..."
                        className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground/70 text-foreground"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Filters  right side */}
                <div className="flex items-center gap-2 ml-auto">
                    <select
                        value={filterUniversity}
                        onChange={(e) => setFilterUniversity(e.target.value)}
                        className="text-sm bg-card border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:border-primary/50 transition-colors cursor-pointer"
                    >
                        <option value="all">All Schools</option>
                        {universities.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>

                    <select
                        value={filterLevel}
                        onChange={(e) => setFilterLevel(e.target.value)}
                        className="text-sm bg-card border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:border-primary/50 transition-colors cursor-pointer"
                    >
                        <option value="all">All Levels</option>
                        {levels.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>

                    <select
                        value={filterTier}
                        onChange={(e) => setFilterTier(e.target.value)}
                        className="text-sm bg-card border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:border-primary/50 transition-colors cursor-pointer"
                    >
                        <option value="all">All Plans</option>
                        <option value="free">Free</option>
                        <option value="pro">Pro</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm min-w-[600px]">
                        <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase tracking-wider text-xs font-semibold">
                            <tr>
                                <th className="px-6 py-4">Student</th>
                                <th className="px-6 py-4">Level</th>
                                <th className="px-6 py-4">University</th>
                                <th className="px-6 py-4">Subscription</th>
                                <th className="px-6 py-4 text-right">Toggle</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center text-muted-foreground">
                                        Loading students...
                                    </td>
                                </tr>
                            ) : filteredStudents.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center text-muted-foreground">
                                        <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                        <p>No students found</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredStudents.map(student => (
                                    <tr key={student.id} className="hover:bg-muted/20 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                                    <User className="w-4 h-4 text-primary" />
                                                </div>
                                                <span className="font-medium text-foreground">{getDisplayName(student)}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                                <GraduationCap className="w-3.5 h-3.5" />
                                                <span>{student.level || ''}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-muted-foreground text-xs">
                                            {student.university || ''}
                                        </td>
                                        <td className="px-6 py-4">
                                            {student.subscription_tier === 'pro' ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold">
                                                    <Crown className="w-3 h-3" /> Pro
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                                                    Free
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handleToggleSubscription(student)}
                                                disabled={updatingId === student.id}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${student.subscription_tier === 'pro'
                                                    ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                                                    : 'bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20'
                                                    }`}
                                            >
                                                {updatingId === student.id ? 'Saving...' :
                                                    student.subscription_tier === 'pro' ? 'Downgrade' : 'Upgrade to Pro'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
