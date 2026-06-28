'use client';

const ADMIN_WORKSPACE_UNIVERSITY_KEY = 'pansgpt-admin-workspace-university-id';
const ADMIN_WORKSPACE_UNIVERSITY_NAME_KEY = 'pansgpt-admin-workspace-university-name';
const ADMIN_WORKSPACE_EVENT = 'pansgpt-admin-workspace-changed';

function emitAdminWorkspaceChanged(): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(ADMIN_WORKSPACE_EVENT));
}

export function getAdminWorkspaceUniversityId(): string {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(ADMIN_WORKSPACE_UNIVERSITY_KEY) || '';
}

export function setAdminWorkspaceUniversityId(universityId: string): void {
    if (typeof window === 'undefined') return;
    const normalized = universityId.trim();
    if (normalized) {
        window.localStorage.setItem(ADMIN_WORKSPACE_UNIVERSITY_KEY, normalized);
    } else {
        window.localStorage.removeItem(ADMIN_WORKSPACE_UNIVERSITY_KEY);
    }
    emitAdminWorkspaceChanged();
}

export function getAdminWorkspaceUniversityName(): string {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(ADMIN_WORKSPACE_UNIVERSITY_NAME_KEY) || '';
}

export function setAdminWorkspaceUniversityName(universityName: string): void {
    if (typeof window === 'undefined') return;
    const normalized = universityName.trim();
    if (normalized) {
        window.localStorage.setItem(ADMIN_WORKSPACE_UNIVERSITY_NAME_KEY, normalized);
    } else {
        window.localStorage.removeItem(ADMIN_WORKSPACE_UNIVERSITY_NAME_KEY);
    }
    emitAdminWorkspaceChanged();
}

export function setAdminWorkspaceUniversity(universityId: string, universityName?: string | null): void {
    setAdminWorkspaceUniversityId(universityId);
    setAdminWorkspaceUniversityName(universityName || '');
}

export function clearAdminWorkspaceUniversity(): void {
    setAdminWorkspaceUniversityId('');
    setAdminWorkspaceUniversityName('');
}

export function subscribeToAdminWorkspaceChanges(listener: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const handleStorage = (event: StorageEvent) => {
        if (event.key === ADMIN_WORKSPACE_UNIVERSITY_KEY || event.key === ADMIN_WORKSPACE_UNIVERSITY_NAME_KEY) {
            listener();
        }
    };
    const handleCustom = () => listener();
    window.addEventListener('storage', handleStorage);
    window.addEventListener(ADMIN_WORKSPACE_EVENT, handleCustom);
    return () => {
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener(ADMIN_WORKSPACE_EVENT, handleCustom);
    };
}
