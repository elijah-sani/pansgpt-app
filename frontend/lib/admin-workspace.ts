'use client';

const ADMIN_WORKSPACE_UNIVERSITY_KEY = 'pansgpt-admin-workspace-university-id';
const ADMIN_WORKSPACE_UNIVERSITY_NAME_KEY = 'pansgpt-admin-workspace-university-name';

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
}

export function setAdminWorkspaceUniversity(universityId: string, universityName?: string | null): void {
    setAdminWorkspaceUniversityId(universityId);
    setAdminWorkspaceUniversityName(universityName || '');
}

export function clearAdminWorkspaceUniversity(): void {
    setAdminWorkspaceUniversityId('');
    setAdminWorkspaceUniversityName('');
}
