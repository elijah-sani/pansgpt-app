// The Bosses (Can add/remove users)
export const SUPER_ADMINS = [
    'hello@pansgpt.site',
];

// The Staff (Can only upload/view)
export const REGULAR_ADMINS = [
    ''
];

// Helper to check access
export const isSuperAdmin = (email: string) => SUPER_ADMINS.includes(email);
export const isAllowed = (email: string) => SUPER_ADMINS.includes(email) || REGULAR_ADMINS.includes(email);
