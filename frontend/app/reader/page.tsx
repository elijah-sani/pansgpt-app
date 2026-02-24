"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { Loader2, BookOpen, ArrowLeft, Search } from "lucide-react";
import Link from "next/link";

interface Document {
    id: string;
    drive_file_id: string;
    name: string;
    course?: string;
    file_size?: number;
    created_at?: string;
}

export default function ReaderIndexPage() {
    const router = useRouter();
    const [session, setSession] = useState<any>(null);
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCourse, setSelectedCourse] = useState<string>("all");

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session: s } }) => {
            if (!s) {
                router.push("/login");
                return;
            }
            setSession(s);
        });
    }, [router]);

    useEffect(() => {
        async function loadDocuments() {
            if (!session) return;
            try {
                const res = await api.get("/documents");
                if (res.ok) {
                    const data = await res.json();
                    setDocuments(data.documents || data || []);
                }
            } catch (error) {
                console.error("Failed to load documents:", error);
            } finally {
                setLoading(false);
            }
        }
        loadDocuments();
    }, [session]);

    const courses = Array.from(new Set(documents.map((d) => d.course).filter(Boolean)));

    const filteredDocs = documents.filter((doc) => {
        const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCourse = selectedCourse === "all" || doc.course === selectedCourse;
        return matchesSearch && matchesCourse;
    });

    if (loading) {
        return (
            <div className="flex h-[100dvh] items-center justify-center bg-background">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
                    <button
                        onClick={() => router.push("/main")}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <BookOpen className="w-6 h-6 text-primary" />
                    <h1 className="text-xl font-bold text-foreground">Study Materials</h1>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 py-6">
                {/* Search & Filter */}
                <div className="flex flex-col sm:flex-row gap-3 mb-6">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search documents..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        />
                    </div>
                    {courses.length > 0 && (
                        <select
                            value={selectedCourse}
                            onChange={(e) => setSelectedCourse(e.target.value)}
                            className="px-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        >
                            <option value="all">All Courses</option>
                            {courses.map((course) => (
                                <option key={course} value={course!}>
                                    {course}
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Document List */}
                {filteredDocs.length === 0 ? (
                    <div className="text-center py-16">
                        <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">
                            {searchQuery ? "No documents match your search." : "No study materials available yet."}
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {filteredDocs.map((doc) => (
                            <Link
                                key={doc.id}
                                href={`/reader/${doc.drive_file_id}?size=${doc.file_size || ""}&course=${doc.course || ""}`}
                                className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-sm transition-all group"
                            >
                                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <BookOpen className="w-5 h-5 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                                        {doc.name}
                                    </p>
                                    {doc.course && (
                                        <p className="text-xs text-muted-foreground mt-0.5">{doc.course}</p>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
