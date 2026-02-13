'use client';

import React, { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/auth-helpers-nextjs';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import {
    Camera,
    LogOut,
    AlertTriangle,
    Moon,
    Sun,
    Save,
    Cpu,
    CheckCircle2,
    Shield,
    ChevronRight,
    User,
    Cloud,
    Wrench,
    X,
    ChevronLeft,
    LayoutGrid,
    RefreshCw,
    Check,
    Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';

// --- Sub-Components (Defined outside to prevent re-mounting) ---

interface AvatarSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (avatarUrl: string) => void;
    currentAvatarUrl: string;
}

const AvatarSelectionModal = ({ isOpen, onClose, onConfirm, currentAvatarUrl }: AvatarSelectionModalProps) => {
    const [seeds, setSeeds] = useState<string[]>([]);
    const [selectedSeed, setSelectedSeed] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    // Generate random seeds on open
    useEffect(() => {
        if (isOpen) {
            generateSeeds();
            setSelectedSeed(null);
        }
    }, [isOpen]);

    const generateSeeds = () => {
        setIsGenerating(true);
        const newSeeds = Array.from({ length: 12 }, () => Math.random().toString(36).substring(7));
        setSeeds(newSeeds);
        setTimeout(() => setIsGenerating(false), 500); // Fake delay for UX
    };

    const getAvatarUrl = (seed: string) => `https://api.dicebear.com/9.x/toon-head/svg?translateY=5&beardProbability=30&eyebrows=happy,neutral,raised,sad,angry&hairColor=2c1b18,724133,a55728,b58143&backgroundColor=ffdfbf,ffd5dc,d1d4f9,c0aede,b6e3f4&seed=${seed}`;

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="p-6 border-b border-border flex justify-between items-center bg-muted/30">
                        <div>
                            <h2 className="text-xl font-bold text-foreground">Identity Lab</h2>
                            <p className="text-sm text-muted-foreground">Select your digital persona</p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
                            <X className="w-5 h-5 text-muted-foreground" />
                        </button>
                    </div>

                    {/* Grid */}
                    <div className="p-6 overflow-y-auto bg-background/50">
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                            {seeds.map((seed, i) => (
                                <motion.button
                                    key={seed}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    onClick={() => setSelectedSeed(seed)}
                                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all group ${selectedSeed === seed
                                        ? 'border-primary ring-2 ring-primary/30 ring-offset-2 ring-offset-card scale-105 shadow-lg'
                                        : 'border-border hover:border-primary/50 hover:scale-105'
                                        }`}
                                >
                                    <img
                                        src={getAvatarUrl(seed)}
                                        alt={`Avatar ${i}`}
                                        className="w-full h-full object-cover bg-muted/30"
                                        loading="lazy"
                                    />
                                    {selectedSeed === seed && (
                                        <div className="absolute top-1 right-1 bg-primary text-primary-foreground p-0.5 rounded-full shadow-sm">
                                            <Check className="w-3 h-3" />
                                        </div>
                                    )}
                                </motion.button>
                            ))}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-border bg-muted/30 flex items-center justify-between gap-4">
                        <button
                            onClick={generateSeeds}
                            disabled={isGenerating}
                            className="flex items-center gap-2 px-4 py-2.5 bg-background border border-border hover:bg-muted text-foreground rounded-xl text-sm font-medium transition-colors"
                        >
                            <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                            Shuffle
                        </button>

                        <button
                            onClick={() => selectedSeed && onConfirm(getAvatarUrl(selectedSeed))}
                            disabled={!selectedSeed}
                            className="flex-1 px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            Confirm Identity
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

interface ProfileEditorProps {
    profileData: { displayName: string; avatarUrl: string };
    setProfileData: (data: { displayName: string; avatarUrl: string }) => void;
    userEmail: string | null;
    onSave: () => void;
    isSaving: boolean;
}

const ProfileEditor = ({ profileData, setProfileData, userEmail, onSave, isSaving }: ProfileEditorProps) => (
    <div className="space-y-6">
        <div className="space-y-4">
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest">Display Name</label>
            <input
                type="text"
                value={profileData.displayName}
                onChange={(e) => setProfileData({ ...profileData, displayName: e.target.value })}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground focus:border-primary/50 text-sm outline-none transition-all"
            />
        </div>
        <div className="space-y-4">
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest">Email Address</label>
            <input
                type="text"
                value={userEmail || ''}
                disabled
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-muted-foreground text-sm cursor-not-allowed"
            />
        </div>
        <div className="pt-4">
            <button
                onClick={onSave}
                disabled={isSaving}
                className="w-full md:w-auto px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl transition-all shadow-lg shadow-primary/20 disabled:opacity-70 flex items-center justify-center gap-2"
            >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
        </div>
    </div>
);

interface AIEditorProps {
    systemConfig: { system_prompt: string; temperature: number; maintenance_mode: boolean };
    setSystemConfig: (data: { system_prompt: string; temperature: number; maintenance_mode: boolean }) => void;
    userEmail: string | null;
}

const AIEditor = ({ systemConfig, setSystemConfig, userEmail }: AIEditorProps) => {
    const [localTemperature, setLocalTemperature] = useState(systemConfig.temperature);
    const [isSavingPrompt, setIsSavingPrompt] = useState(false);
    const [isSavingTemp, setIsSavingTemp] = useState(false);
    const [promptMessage, setPromptMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Sync local temp with prop if it changes externally (e.g. initial load)
    useEffect(() => {
        setLocalTemperature(systemConfig.temperature);
    }, [systemConfig.temperature]);

    // Debounced Temperature Save
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (localTemperature === systemConfig.temperature) return;

            setIsSavingTemp(true);
            try {
                const res = await api.post('/admin/config/update', {
                    temperature: localTemperature
                }, {
                    headers: {
                        'x-user-email': userEmail || ''
                    }
                });

                if (!res.ok) throw new Error('Failed');

                // Update parent after success to keep in sync
                setSystemConfig({ ...systemConfig, temperature: localTemperature });

            } catch (err) {
                console.error("Failed to save temperature", err);
            } finally {
                setIsSavingTemp(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [localTemperature, userEmail]);

    const handleSavePrompt = async () => {
        setIsSavingPrompt(true);
        setPromptMessage(null);
        try {
            // Use centralized API client
            // Note: api.post automatically handles Content-Type application/json
            const res = await api.post('/admin/config/update', {
                system_prompt: systemConfig.system_prompt
            }, {
                headers: {
                    'x-user-email': userEmail || ''
                }
            });

            if (!res.ok) throw new Error('Failed');

            setPromptMessage({ type: 'success', text: 'Configuration saved.' });
            setTimeout(() => setPromptMessage(null), 3000);
        } catch (err) {
            setPromptMessage({ type: 'error', text: 'Failed to save.' });
        } finally {
            setIsSavingPrompt(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest">System Prompt</label>
                <textarea
                    value={systemConfig.system_prompt}
                    onChange={(e) => setSystemConfig({ ...systemConfig, system_prompt: e.target.value })}
                    className="w-full h-48 bg-background text-foreground font-mono text-sm p-4 rounded-xl border border-border focus:border-primary/50 outline-none resize-none leading-relaxed shadow-inner"
                    placeholder="You are a helpful AI assistant..."
                />
                <div className="flex justify-end text-xs text-muted-foreground">
                    <span>{systemConfig.system_prompt.length} chars</span>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Temperature</label>
                        {isSavingTemp && <span className="text-[10px] text-primary animate-pulse">Saving...</span>}
                    </div>
                    <span className="text-primary font-bold font-mono">{localTemperature}</span>
                </div>
                <div className="relative pt-1">
                    <input
                        type="range"
                        min="0" max="1" step="0.1"
                        value={localTemperature}
                        onChange={(e) => setLocalTemperature(parseFloat(e.target.value))}
                        className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-2 font-medium">
                        <span>Precise (0.0)</span>
                        <span>Balanced (0.5)</span>
                        <span>Creative (1.0)</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border">
                {promptMessage ? (
                    <div className={`flex items-center gap-2 text-sm font-medium ${promptMessage.type === 'success' ? 'text-green-500' : 'text-destructive'}`}>
                        {promptMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                        {promptMessage.text}
                    </div>
                ) : <div />}

                <button
                    onClick={handleSavePrompt}
                    disabled={isSavingPrompt}
                    className="px-6 py-3 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-bold text-sm rounded-xl transition-colors border border-border/50"
                >
                    {isSavingPrompt ? 'Saving...' : 'Save Config'}
                </button>
            </div>
        </div>
    );
};

// --- Main Component ---

export default function SettingsPage() {
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const router = useRouter();
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    const [loading, setLoading] = useState(true);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [isSavingProfile, setIsSavingProfile] = useState(false); // Add Loading State
    const [fileCount, setFileCount] = useState(0);

    // Mobile States
    const [mobileSection, setMobileSection] = useState<'profile' | 'ai' | null>(null);

    // Form States
    const [profileData, setProfileData] = useState({ displayName: '', avatarUrl: '' });
    const [systemConfig, setSystemConfig] = useState({
        system_prompt: '',
        temperature: 0.7,
        maintenance_mode: false
    });

    // Avatar Modal
    const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

    // Ensure hydration match for theme
    useEffect(() => {
        setMounted(true);
    }, []);

    // --- Init ---
    // Combined Fetch Logic (Prefer DB, Fallback to Auth)
    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const { email, id, user_metadata } = session.user;
                setUserEmail(email || null);

                // 1. Attempt to fetch from profiles table
                let dbDisplayName = '';
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('full_name, avatar_url')
                    .eq('id', id)
                    .single();

                if (profile?.full_name) {
                    dbDisplayName = profile.full_name;
                }

                // 2. Fallback to Metadata if DB is empty
                const finalDisplayName = dbDisplayName || user_metadata?.full_name || 'User';
                const finalAvatarUrl = profile?.avatar_url || user_metadata?.avatar_url || '';

                setProfileData({
                    displayName: finalDisplayName,
                    avatarUrl: finalAvatarUrl
                });

                // Fetch Role
                const { data: roleData } = await supabase
                    .from('user_roles')
                    .select('role')
                    .eq('email', email)
                    .single();

                const superAdmin = roleData?.role === 'super_admin';
                setIsSuperAdmin(superAdmin);

                // Fetch File Count
                const { count: docsCount } = await supabase
                    .from('pans_library')
                    .select('*', { count: 'exact', head: true })
                    .eq('uploaded_by_email', email);

                setFileCount(docsCount || 0);

                // If super admin, fetch system config
                if (superAdmin) {
                    fetchSystemConfig();
                }
            }
            setLoading(false);
        };
        init();
    }, [supabase]);

    const fetchSystemConfig = async () => {
        try {
            const res = await api.fetch('/admin/config');
            if (res.ok) {
                const data = await res.json();
                setSystemConfig({
                    system_prompt: data.system_prompt || '',
                    temperature: data.temperature || 0.7,
                    maintenance_mode: data.maintenance_mode || false
                });
            }
        } catch (err) {
            console.error("Failed to fetch system config", err);
        }
    };

    // --- Handlers ---

    // NEW: Handle Profile Save (Dual Update)
    const handleSaveProfile = async () => {
        setIsSavingProfile(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) return;

            const newName = profileData.displayName;
            const uid = session.user.id;

            // Update 1: Auth Metadata
            const authUpdate = supabase.auth.updateUser({
                data: { full_name: newName }
            });

            // Update 2: Profiles Table
            // Check if profile exists first, or use upsert
            const profileUpdate = supabase
                .from('profiles')
                .upsert({ id: uid, full_name: newName, updated_at: new Date() });

            // Run in parallel
            await Promise.all([authUpdate, profileUpdate]);

            // Visual feedback could go here
            // alert("Profile saved!"); 

        } catch (error) {
            console.error("Failed to save profile:", error);
            alert("Failed to save profile. Please try again.");
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleUpdateAvatar = async (url: string) => {
        setIsAvatarModalOpen(false);
        // Optimistic update
        setProfileData(prev => ({ ...prev, avatarUrl: url }));

        // Save to Supabase Auth Metadata AND Profiles
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
            await Promise.all([
                supabase.auth.updateUser({ data: { avatar_url: url } }),
                supabase.from('profiles').upsert({ id: session.user.id, avatar_url: url, updated_at: new Date() })
            ]);
        }
    };

    const handleMaintenanceToggle = async (checked: boolean) => {
        // 1. Optimistic Update
        setSystemConfig(prev => ({ ...prev, maintenance_mode: checked }));

        try {
            const res = await api.post('/admin/config/update', {
                maintenance_mode: checked
            }, {
                headers: {
                    'x-user-email': userEmail || ''
                }
            });

            if (!res.ok) throw new Error('Failed to update maintenance mode');

        } catch (err) {
            console.error(err);
            // Revert on failure
            setSystemConfig(prev => ({ ...prev, maintenance_mode: !checked }));
            alert("Failed to update system settings.");
        }
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    if (loading) return <div className="p-8 text-muted-foreground flex justify-center">Loading settings...</div>;

    // --- Components ---

    const ProfileSummaryCard = () => {
        // Use custom avatar if available, else generated fallbock
        const currentAvatar = profileData.avatarUrl || `https://api.dicebear.com/9.x/toon-head/svg?translateY=5&beardProbability=30&eyebrows=happy,neutral,raised,sad,angry&hairColor=2c1b18,724133,a55728,b58143&backgroundColor=ffdfbf,ffd5dc,d1d4f9,c0aede,b6e3f4&seed=${userEmail}`;

        return (
            <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center text-center shadow-sm relative overflow-hidden">
                {/* Background Gradient Effect */}
                <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />

                <div className="relative group mb-4">
                    <div className="w-24 h-24 rounded-full bg-muted border-4 border-card shadow-xl overflow-hidden flex items-center justify-center relative z-10">
                        <img
                            src={currentAvatar}
                            alt="Avatar"
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                    </div>
                    <button
                        onClick={() => setIsAvatarModalOpen(true)}
                        className="absolute bottom-0 right-0 z-20 bg-primary hover:bg-primary/90 text-primary-foreground p-1.5 rounded-full ring-4 ring-card transition-colors shadow-sm cursor-pointer"
                    >
                        <LayoutGrid className="w-4 h-4" />
                    </button>
                </div>

                <div className="mb-2">
                    {isSuperAdmin && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500 text-yellow-950 text-[10px] font-black uppercase tracking-widest shadow-sm">
                            <Shield className="w-3 h-3 fill-current" />
                            Super Admin
                        </span>
                    )}
                </div>

                <h2 className="text-xl font-bold text-foreground mb-0.5">{profileData.displayName}</h2>
                <p className="text-sm text-muted-foreground mb-6">{userEmail}</p>

                <div className="bg-primary/10 border border-primary/20 rounded-full px-5 py-2.5 flex items-center gap-2.5">
                    <Cloud className="w-4 h-4 text-primary fill-current" />
                    <span className="text-sm font-bold text-foreground">Files Uploaded: <span className="text-primary">{fileCount}</span></span>
                </div>
            </div>
        );
    };

    const SettingsGroup = ({ title, children }: { title: string, children: React.ReactNode }) => (
        <div className="space-y-2">
            <h3 className="px-1 text-xs font-bold text-muted-foreground uppercase tracking-widest">{title}</h3>
            <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                {children}
            </div>
        </div>
    );

    const SettingsRow = ({ icon: Icon, label, action, onClick, isDanger }: { icon: any, label: string, action?: React.ReactNode, onClick?: () => void, isDanger?: boolean }) => (
        <div
            onClick={onClick}
            className={`flex items-center justify-between p-4 ${onClick ? 'cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors' : ''}`}
        >
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${isDanger ? 'bg-red-500/10 text-red-500' : 'bg-muted text-foreground'}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <span className={`font-medium ${isDanger ? 'text-red-500' : 'text-foreground'}`}>{label}</span>
            </div>
            {action || (onClick && <ChevronRight className="w-5 h-5 text-muted-foreground" />)}
        </div>
    );

    // Mobile Drawer Component
    const MobileDrawer = ({ title, isOpen, onClose, children }: { title: string, isOpen: boolean, onClose: () => void, children: React.ReactNode }) => (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.5 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black z-50 md:hidden backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed inset-x-0 bottom-0 h-[85vh] bg-background border-t border-border rounded-t-3xl z-50 md:hidden overflow-hidden flex flex-col shadow-2xl"
                    >
                        <div className="p-4 border-b border-border flex items-center justify-between bg-card/50 backdrop-blur-md">
                            <h2 className="text-lg font-bold text-foreground">{title}</h2>
                            <button onClick={onClose} className="p-2 bg-muted rounded-full text-foreground">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 pb-32">
                            {children}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );

    return (
        <div className="max-w-7xl mx-auto pb-32 md:pb-12">

            {/* Header (Desktop Only Check) */}
            <div className="flex items-center justify-center md:justify-between mb-6 md:mb-8 relative">
                <h1 className="text-xl md:text-3xl font-bold text-foreground">Settings</h1>
            </div>

            {/* MAIN LAYOUT */}
            <div className="md:grid md:grid-cols-12 md:gap-8">

                {/* LEFT COL: Profile Summary (Sticky on Desktop) */}
                <div className="md:col-span-4 lg:col-span-3 space-y-6">
                    <ProfileSummaryCard />

                    {/* DESKTOP NAV (Hidden on Mobile) */}
                    <div className="hidden md:block space-y-2">
                        {/* Navigation removed as per requirement */}
                    </div>
                </div>

                {/* RIGHT COL: Content (Visible on Desktop, hidden on Mobile - replaced by list items) */}
                <div className="md:col-span-8 lg:col-span-9 space-y-8 hidden md:block">
                    {/* Edit Profile Section */}
                    <div className="bg-card border border-border rounded-2xl p-8">
                        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-border">
                            <User className="w-6 h-6 text-primary" />
                            <h2 className="text-xl font-bold text-foreground">Edit Profile</h2>
                        </div>
                        <ProfileEditor
                            profileData={profileData}
                            setProfileData={setProfileData}
                            userEmail={userEmail}
                            onSave={handleSaveProfile}
                            isSaving={isSavingProfile}
                        />
                    </div>

                    {/* System Intelligence Section */}
                    {isSuperAdmin && (
                        <div className="bg-card border border-border rounded-2xl p-8">
                            <div className="flex items-center gap-3 mb-6 pb-6 border-b border-border">
                                <Cpu className="w-6 h-6 text-primary" />
                                <h2 className="text-xl font-bold text-foreground">System Intelligence</h2>
                            </div>
                            <AIEditor
                                systemConfig={systemConfig}
                                setSystemConfig={setSystemConfig}
                                userEmail={userEmail}
                            />
                        </div>
                    )}

                    {/* Preferences (Maintenance, Dark Mode) - Explicit Desktop View */}
                    <div className="bg-card border border-border rounded-2xl p-8 space-y-6">
                        <h2 className="text-xl font-bold text-foreground border-b border-border pb-6">App Preferences</h2>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-muted rounded-xl text-foreground"><Moon className="w-6 h-6" /></div>
                                <div>
                                    <h3 className="font-bold text-foreground">Dark Mode</h3>
                                    <p className="text-sm text-muted-foreground">Use dark theme interface</p>
                                </div>
                            </div>
                            {mounted && (
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" checked={theme === 'dark'} onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')} />
                                    <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-primary"></div>
                                </label>
                            )}
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-muted rounded-xl text-foreground"><Wrench className="w-6 h-6" /></div>
                                <div>
                                    <h3 className="font-bold text-foreground">Maintenance Mode</h3>
                                    <p className="text-sm text-muted-foreground">Disable user access temporarily</p>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={systemConfig.maintenance_mode}
                                    onChange={(e) => handleMaintenanceToggle(e.target.checked)}
                                    disabled={!isSuperAdmin}
                                />
                                <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-amber-500"></div>
                            </label>
                        </div>
                    </div>

                    <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-8 flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-red-600 dark:text-red-400">Danger Zone</h3>
                            <p className="text-sm text-red-600/70 dark:text-red-400/70">Sign out of your active session.</p>
                        </div>
                        <button onClick={handleSignOut} className="px-6 py-2 border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 font-bold rounded-xl transition-colors">Log Out</button>
                    </div>
                </div>

                {/* MOBILE LIST SYSTEM (Visible on Mobile only) */}
                <div className="md:hidden space-y-6 mt-8">

                    <SettingsGroup title="Appearance">
                        <div className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-lg"><Moon className="w-5 h-5" /></div>
                                <span className="font-medium text-foreground">Dark Mode</span>
                            </div>
                            {mounted && (
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" checked={theme === 'dark'} onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')} />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                </label>
                            )}
                        </div>
                    </SettingsGroup>

                    <SettingsGroup title="Account Settings">
                        <SettingsRow icon={User} label="Edit Profile" onClick={() => setMobileSection('profile')} />
                    </SettingsGroup>

                    {isSuperAdmin && (
                        <SettingsGroup title="AI Configuration">
                            <SettingsRow icon={Cpu} label="Model Parameters" onClick={() => setMobileSection('ai')} />
                        </SettingsGroup>
                    )}

                    <SettingsGroup title="Security & Access">
                        <div className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg"><Wrench className="w-5 h-5" /></div>
                                <span className="font-medium text-foreground">Maintenance Mode</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={systemConfig.maintenance_mode}
                                    onChange={(e) => handleMaintenanceToggle(e.target.checked)}
                                    disabled={!isSuperAdmin}
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                            </label>
                        </div>
                    </SettingsGroup>

                    <SettingsGroup title="Danger Zone">
                        <SettingsRow icon={LogOut} label="Log Out" isDanger onClick={handleSignOut} />
                    </SettingsGroup>

                </div>
            </div>

            {/* MOBILE DRAWERS */}
            <MobileDrawer title="Edit Profile" isOpen={mobileSection === 'profile'} onClose={() => setMobileSection(null)}>
                <ProfileEditor
                    profileData={profileData}
                    setProfileData={setProfileData}
                    userEmail={userEmail}
                    onSave={handleSaveProfile}
                    isSaving={isSavingProfile}
                />
            </MobileDrawer>

            <MobileDrawer title="Model Parameters" isOpen={mobileSection === 'ai'} onClose={() => setMobileSection(null)}>
                <AIEditor
                    systemConfig={systemConfig}
                    setSystemConfig={setSystemConfig}
                    userEmail={userEmail}
                />
            </MobileDrawer>

            <AvatarSelectionModal
                isOpen={isAvatarModalOpen}
                onClose={() => setIsAvatarModalOpen(false)}
                onConfirm={handleUpdateAvatar}
                currentAvatarUrl={profileData.avatarUrl}
            />
        </div>
    );
}
