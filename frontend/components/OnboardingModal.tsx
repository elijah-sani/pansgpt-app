'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface OnboardingModalProps {
    user: any;
    onComplete: () => void;
}

const NIGERIAN_UNIVERSITIES = [
    "University of Lagos (UNILAG)",
    "Obafemi Awolowo University (OAU)",
    "University of Ibadan (UI)",
    "University of Benin (UNIBEN)",
    "Ahmadu Bello University (ABU)",
    "University of Nigeria, Nsukka (UNN)",
    "Lagos State University (LASU)",
    "Covenant University",
    "Usman Danfodiyo University (UDUS)",
    "Nnamdi Azikiwe University (UNIZIK)",
    "University of Jos (UNIJOS)",
    "University of Ilorin (UNILORIN)",
    "Other"
];

const LEVELS = ["100lvl", "200lvl", "300lvl", "400lvl", "500lvl", "600lvl (PharmD)"];

export default function OnboardingModal({ user, onComplete }: OnboardingModalProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        firstName: '',
        university: '',
        level: ''
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    first_name: formData.firstName,
                    university: formData.university,
                    level: formData.level,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id);

            if (error) throw error;

            // Success
            onComplete();
            router.refresh(); // Refresh server components if any
        } catch (error) {
            console.error('Profile update failed:', error);
            alert('Failed to update profile. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-md bg-background border border-border rounded-xl shadow-2xl p-6 md:p-8 relative">
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                        Welcome to PansGPT! 💊
                    </h2>
                    <p className="text-muted-foreground mt-2">
                        Let's set up your profile to personalize your study experience.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">First Name</label>
                        <input
                            type="text"
                            required
                            className="w-full px-3 py-2 rounded-md border border-input bg-background focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                            placeholder="e.g. Victor"
                            value={formData.firstName}
                            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">University</label>
                        <select
                            required
                            className="w-full px-3 py-2 rounded-md border border-input bg-background focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                            value={formData.university}
                            onChange={(e) => setFormData({ ...formData, university: e.target.value })}
                        >
                            <option value="">Select your implementation</option>
                            {NIGERIAN_UNIVERSITIES.map((uni) => (
                                <option key={uni} value={uni}>{uni}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Level</label>
                        <select
                            required
                            className="w-full px-3 py-2 rounded-md border border-input bg-background focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                            value={formData.level}
                            onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                        >
                            <option value="">Select your level</option>
                            {LEVELS.map((lvl) => (
                                <option key={lvl} value={lvl}>{lvl}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !formData.firstName || !formData.university || !formData.level}
                        className="w-full mt-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-md shadow-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {loading ? 'Updating Profile...' : 'Get Started 🚀'}
                    </button>
                </form>
            </div>
        </div>
    );
}
