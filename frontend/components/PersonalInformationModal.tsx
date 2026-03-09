'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, LayoutGrid, Pencil, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { dispatchProfileUpdated } from '@/lib/profile-events';
import AvatarSelectionModal from '@/components/AvatarSelectionModal';
import MobileBottomSheet from '@/components/MobileBottomSheet';

interface PersonalInformationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave?: (data: {
        name: string;
        firstName: string;
        otherNames: string;
        university: string;
        level: string;
    }) => void;
    onAvatarChange?: (url: string) => void;
    user: {
        name?: string;
        firstName?: string;
        otherNames?: string;
        avatarUrl?: string;
        university?: string;
        level?: string;
    };
}

interface PersonalInfoFormData {
    firstName: string;
    otherNames: string;
    university: string;
    level: string;
}

const levelOptions = ['100', '200', '300', '400', '500', '600'];
const universityOptions = [
    'University of Jos (UNIJOS)',
    'Other',
];

const splitName = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return {
        firstName: parts[0] || '',
        otherNames: parts.slice(1).join(' '),
    };
};

const buildFormFromUser = (user: PersonalInformationModalProps['user']): PersonalInfoFormData => {
    const split = splitName(user.name || '');
    return {
        firstName: user.firstName || split.firstName,
        otherNames: user.otherNames || split.otherNames,
        university: user.university || '',
        level: user.level || '400',
    };
};

const normalizeForm = (form: PersonalInfoFormData): PersonalInfoFormData => ({
    firstName: form.firstName.trim(),
    otherNames: form.otherNames.trim(),
    university: form.university.trim(),
    level: form.level.trim(),
});

const upsertProfileForCurrentUser = async (
    payload: {
        first_name?: string | null;
        other_names?: string | null;
        university?: string | null;
        level?: string | null;
        avatar_url?: string | null;
    }
) => {
    const response = await api.patch('/me/profile', payload);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to update profile');
    }
};

export default function PersonalInformationModal({ isOpen, onClose, onSave, onAvatarChange, user }: PersonalInformationModalProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
    const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
    const [initialFormData, setInitialFormData] = useState<PersonalInfoFormData>(buildFormFromUser(user));
    const [formData, setFormData] = useState<PersonalInfoFormData>(buildFormFromUser(user));

    useEffect(() => {
        if (!isOpen) return;
        const baseForm = buildFormFromUser(user);
        setInitialFormData(baseForm);
        setFormData(baseForm);
        setAvatarUrl(user.avatarUrl || '');
        setSaveError(null);
        setIsEditing(false);

        // Always hydrate from DB when opened so first_name/other_names reflect source of truth.
        const hydrateFromProfile = async () => {
            try {
                const response = await api.get('/me/profile');
                if (!response.ok) return;
                const profile = await response.json();

                if (!profile) return;
                const dbForm: PersonalInfoFormData = {
                    firstName: profile.first_name || '',
                    otherNames: profile.other_names || '',
                    university: profile.university || user.university || '',
                    level: profile.level || user.level || '400',
                };

                setInitialFormData(dbForm);
                setFormData(dbForm);
                setAvatarUrl(profile.avatar_url || user.avatarUrl || '');
            } catch (error) {
                console.warn('Unable to hydrate personal info from profiles', error);
            }
        };
        void hydrateFromProfile();
    }, [isOpen, user.avatarUrl, user.firstName, user.level, user.name, user.otherNames, user.university]);

    const updateField = <K extends keyof PersonalInfoFormData>(key: K, value: PersonalInfoFormData[K]) => {
        setFormData((prev) => ({ ...prev, [key]: value }));
    };

    const hasChanges = useMemo(() => {
        const current = normalizeForm(formData);
        const initial = normalizeForm(initialFormData);
        return JSON.stringify(current) !== JSON.stringify(initial);
    }, [formData, initialFormData]);

    const handleSave = async () => {
        if (!hasChanges) return;

        setIsSaving(true);
        setSaveError(null);
        const normalized = normalizeForm(formData);
        const fullName = `${normalized.firstName} ${normalized.otherNames}`.trim();

        if (normalized.firstName && normalized.firstName.length < 3) {
            setSaveError('First name must be at least 3 characters.');
            setIsSaving(false);
            return;
        }

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) throw new Error('You need to sign in again to save profile changes.');

            if (fullName) {
                const { error: authError } = await supabase.auth.updateUser({ data: { full_name: fullName } });
                if (authError) throw authError;
            }

            await upsertProfileForCurrentUser({
                first_name: normalized.firstName || null,
                other_names: normalized.otherNames || null,
                university: normalized.university || null,
                level: normalized.level || null,
            });

            onSave?.({
                name: fullName,
                firstName: normalized.firstName,
                otherNames: normalized.otherNames,
                university: normalized.university,
                level: normalized.level,
            });
            dispatchProfileUpdated({
                name: fullName,
                firstName: normalized.firstName,
                otherNames: normalized.otherNames,
                university: normalized.university,
                level: normalized.level,
            });

            setInitialFormData(normalized);
            setFormData(normalized);
            setIsEditing(false);
        } catch (error) {
            console.error('Failed to save personal information', error);
            const message = error instanceof Error ? error.message : 'Unable to save changes right now.';
            setSaveError(message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancelEdit = () => {
        setFormData(initialFormData);
        setSaveError(null);
        setIsEditing(false);
    };

    const fallbackAvatar =
        `https://api.dicebear.com/9.x/toon-head/svg?translateY=5&beardProbability=30&eyebrows=happy,neutral,raised,sad,angry&hairColor=2c1b18,724133,a55728,b58143&backgroundColor=ffdfbf,ffd5dc,d1d4f9,c0aede,b6e3f4&seed=${`${formData.firstName} ${formData.otherNames}`.trim() || 'default'}`;
    const currentAvatar = avatarUrl || fallbackAvatar;
    const modalContent = (
        <>
            <div className="p-5 border-b border-border flex justify-between items-center bg-muted/30">
                <h2 className="text-lg font-bold text-foreground">Personal Information</h2>
                <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto bg-background/50">
                <div className="rounded-xl border border-border bg-card px-3.5 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <img
                            src={currentAvatar}
                            alt="Profile avatar"
                            className="w-11 h-11 rounded-full object-cover ring-2 ring-primary/20 bg-muted"
                        />
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">Profile Avatar</p>
                            <p className="text-xs text-muted-foreground truncate">Choose your preferred avatar style</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsAvatarModalOpen(true)}
                        disabled={isUpdatingAvatar}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-60"
                    >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        {isUpdatingAvatar ? 'Updating...' : 'Edit Avatar'}
                    </button>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">First Name</label>
                    {isEditing ? (
                        <input
                            type="text"
                            value={formData.firstName}
                            onChange={(e) => updateField('firstName', e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                        />
                    ) : (
                        <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/40 text-sm text-foreground">
                            {formData.firstName || 'Not set'}
                        </div>
                    )}
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Other Names</label>
                    {isEditing ? (
                        <input
                            type="text"
                            value={formData.otherNames}
                            onChange={(e) => updateField('otherNames', e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                        />
                    ) : (
                        <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/40 text-sm text-foreground">
                            {formData.otherNames || 'Not set'}
                        </div>
                    )}
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">University</label>
                    {isEditing ? (
                        <select
                            value={formData.university}
                            onChange={(e) => updateField('university', e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                        >
                            <option value="">Select your university</option>
                            {universityOptions.map((u) => (
                                <option key={u} value={u}>{u}</option>
                            ))}
                        </select>
                    ) : (
                        <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/40 text-sm text-foreground">
                            {formData.university || 'Not set'}
                        </div>
                    )}
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Level</label>
                    {isEditing ? (
                        <select
                            value={formData.level}
                            onChange={(e) => updateField('level', e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                        >
                            {levelOptions.map((level) => (
                                <option key={level} value={level}>
                                    {level} Level
                                </option>
                            ))}
                        </select>
                    ) : (
                        <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/40 text-sm text-foreground">
                            {formData.level ? `${formData.level} Level` : 'Not set'}
                        </div>
                    )}
                </div>
            </div>

            <div className="p-5 border-t border-border bg-muted/30">
                {!isEditing && (
                    <button
                        onClick={() => {
                            setSaveError(null);
                            setIsEditing(true);
                        }}
                        className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md bg-background border border-border text-foreground hover:bg-muted"
                    >
                        <Pencil className="w-4 h-4" />
                        Edit Profile
                    </button>
                )}

                {isEditing && (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCancelEdit}
                            disabled={isSaving}
                            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-border bg-background text-foreground hover:bg-muted transition-colors disabled:opacity-60"
                        >
                            Cancel
                        </button>
                        {hasChanges && (
                            <button
                                onClick={() => {
                                    void handleSave();
                                }}
                                disabled={isSaving}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-md disabled:opacity-60"
                            >
                                <Check className="w-4 h-4" />
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        )}
                    </div>
                )}

                {saveError && (
                    <p className="text-xs text-destructive mt-2">{saveError}</p>
                )}
            </div>
        </>
    );

    const handleAvatarConfirm = async (url: string) => {
        setIsUpdatingAvatar(true);
        setSaveError(null);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) throw new Error('You need to sign in again to update avatar.');

            const { error: authError } = await supabase.auth.updateUser({ data: { avatar_url: url } });
            if (authError) throw authError;

            await upsertProfileForCurrentUser({
                avatar_url: url,
            });

            setAvatarUrl(url);
            onAvatarChange?.(url);
            dispatchProfileUpdated({ avatarUrl: url });
            setIsAvatarModalOpen(false);
        } catch (error) {
            console.error('Failed to update avatar', error);
            const message = error instanceof Error ? error.message : 'Unable to update avatar right now.';
            setSaveError(message);
        } finally {
            setIsUpdatingAvatar(false);
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <MobileBottomSheet isOpen={isOpen} onClose={onClose}>
                <div className="bg-card flex flex-col max-h-[90vh]">
                    {modalContent}
                </div>
            </MobileBottomSheet>

            <div className="hidden md:block">
                <AnimatePresence>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
                        onClick={onClose}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {modalContent}
                        </motion.div>
                    </motion.div>
                </AnimatePresence>
            </div>

            <AvatarSelectionModal
                isOpen={isAvatarModalOpen}
                onClose={() => setIsAvatarModalOpen(false)}
                onConfirm={(url) => {
                    void handleAvatarConfirm(url);
                }}
            />
        </>
    );
}
