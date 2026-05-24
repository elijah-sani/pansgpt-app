export type AdminSearchStudent = {
    id: string;
    first_name: string | null;
    other_names: string | null;
    level: string | null;
    university: string | null;
    subscription_tier: string | null;
    email?: string | null;
};

export type AdminSearchDocument = {
    id: string;
    title: string;
    course_code?: string | null;
    lecturer_name?: string | null;
    topic?: string | null;
    material_status?: string | null;
};

export type AdminSearchLecturer = {
    id: string;
    title: string | null;
    full_name: string;
    email: string;
    university_name: string | null;
    status: 'pending' | 'active' | 'rejected' | 'suspended' | 'revoked';
};

export type AdminSearchRestriction = {
    id: string;
    title: string | null;
    course_code: string | null;
    level: string | null;
    status: 'scheduled' | 'active' | 'completed' | 'cancelled';
    lecturer_name: string | null;
};

export type AdminSearchResultCategory =
    | 'Quick actions'
    | 'Library'
    | 'Students'
    | 'Lecturers'
    | 'Restrictions';

export type AdminSearchResult = {
    id: string;
    title: string;
    description: string;
    href: string;
    category: AdminSearchResultCategory;
};

const QUICK_ACTIONS = [
    {
        id: 'quick-home',
        title: 'Home',
        description: 'Open the admin overview and activity dashboard.',
        href: '/admin',
        category: 'Quick actions' as const,
        keywords: ['home', 'overview', 'dashboard', 'stats', 'activity'],
    },
    {
        id: 'quick-library',
        title: 'Library',
        description: 'Manage uploaded documents and the knowledge base.',
        href: '/admin/library',
        category: 'Quick actions' as const,
        keywords: ['library', 'documents', 'knowledge', 'upload', 'materials'],
    },
    {
        id: 'quick-students',
        title: 'Students',
        description: 'Manage student access, plans, and profiles.',
        href: '/admin/students',
        category: 'Quick actions' as const,
        keywords: ['students', 'subscription', 'plans', 'profiles'],
    },
    {
        id: 'quick-lecturers',
        title: 'Lecturers',
        description: 'Review lecturer approval and account status.',
        href: '/admin/lecturers',
        category: 'Quick actions' as const,
        keywords: ['lecturers', 'approval', 'accounts', 'faculty'],
    },
    {
        id: 'quick-materials',
        title: 'Material submissions',
        description: 'Review uploaded lecturer materials for approval.',
        href: '/admin/material-submissions',
        category: 'Quick actions' as const,
        keywords: ['materials', 'submissions', 'approval', 'files'],
    },
    {
        id: 'quick-restrictions',
        title: 'Restrictions',
        description: 'Inspect or cancel scheduled and active restrictions.',
        href: '/admin/restrictions',
        category: 'Quick actions' as const,
        keywords: ['restrictions', 'tests', 'active', 'scheduled'],
    },
    {
        id: 'quick-timetable',
        title: 'Timetable',
        description: 'Manage academic timetable records.',
        href: '/admin/timetable',
        category: 'Quick actions' as const,
        keywords: ['timetable', 'schedule', 'calendar'],
    },
    {
        id: 'quick-faculty',
        title: 'Faculty knowledge',
        description: 'Maintain faculty-level knowledge sources.',
        href: '/admin/faculty-knowledge',
        category: 'Quick actions' as const,
        keywords: ['faculty', 'knowledge', 'sources'],
    },
    {
        id: 'quick-settings',
        title: 'Settings',
        description: 'Manage admin settings and preferences.',
        href: '/admin/settings',
        category: 'Quick actions' as const,
        keywords: ['settings', 'preferences', 'configuration', 'options'],
    },
] as const;

export function buildAdminSearchResults({
    query,
    students,
    documents,
    lecturers,
    restrictions,
    limit = 24,
}: {
    query: string;
    students: AdminSearchStudent[];
    documents: AdminSearchDocument[];
    lecturers: AdminSearchLecturer[];
    restrictions: AdminSearchRestriction[];
    limit?: number;
}): AdminSearchResult[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
        return [];
    }

    const actionResults: AdminSearchResult[] = QUICK_ACTIONS.filter((item) =>
        `${item.title} ${item.description} ${item.keywords.join(' ')}`.toLowerCase().includes(normalizedQuery)
    ).map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        href: item.href,
        category: item.category,
    }));

    const studentResults: AdminSearchResult[] = students
        .filter((student) =>
            `${getStudentName(student)} ${student.email || ''} ${student.level || ''} ${student.university || ''} ${student.subscription_tier || ''}`
                .toLowerCase()
                .includes(normalizedQuery)
        )
        .slice(0, 6)
        .map((student) => ({
            id: `student-${student.id}`,
            title: getStudentName(student),
            description: `${student.level || 'Level not set'} - ${student.university || 'University not set'} - ${formatSubscription(student.subscription_tier)}`,
            href: '/admin/students',
            category: 'Students',
        }));

    const documentResults: AdminSearchResult[] = documents
        .filter((document) =>
            `${document.title} ${document.course_code || ''} ${document.lecturer_name || ''} ${document.topic || ''} ${document.material_status || ''}`
                .toLowerCase()
                .includes(normalizedQuery)
        )
        .slice(0, 6)
        .map((document) => ({
            id: `document-${document.id}`,
            title: document.title,
            description: `${document.course_code || 'Course not set'} - ${document.lecturer_name || 'Lecturer not set'} - ${formatLabel(document.material_status || 'active')}`,
            href: '/admin/library',
            category: 'Library',
        }));

    const lecturerResults: AdminSearchResult[] = lecturers
        .filter((lecturer) =>
            `${lecturer.title || ''} ${lecturer.full_name} ${lecturer.email} ${lecturer.university_name || ''} ${lecturer.status}`
                .toLowerCase()
                .includes(normalizedQuery)
        )
        .slice(0, 6)
        .map((lecturer) => ({
            id: `lecturer-${lecturer.id}`,
            title: [lecturer.title, lecturer.full_name].filter(Boolean).join(' '),
            description: `${lecturer.university_name || 'University not set'} - ${formatLabel(lecturer.status)}`,
            href: '/admin/lecturers',
            category: 'Lecturers',
        }));

    const restrictionResults: AdminSearchResult[] = restrictions
        .filter((restriction) =>
            `${restriction.title || ''} ${restriction.course_code || ''} ${restriction.level || ''} ${restriction.status} ${restriction.lecturer_name || ''}`
                .toLowerCase()
                .includes(normalizedQuery)
        )
        .slice(0, 6)
        .map((restriction) => ({
            id: `restriction-${restriction.id}`,
            title: restriction.course_code || restriction.title || 'Restriction',
            description: `${restriction.level || 'Level not set'} - ${formatLabel(restriction.status)} - ${restriction.lecturer_name || 'Lecturer not set'}`,
            href: '/admin/restrictions',
            category: 'Restrictions',
        }));

    return [...actionResults, ...documentResults, ...studentResults, ...lecturerResults, ...restrictionResults].slice(0, limit);
}

export function groupAdminSearchResults(results: AdminSearchResult[]) {
    const order: AdminSearchResultCategory[] = ['Quick actions', 'Library', 'Students', 'Lecturers', 'Restrictions'];

    return order
        .map((category) => ({
            category,
            items: results.filter((result) => result.category === category),
        }))
        .filter((group) => group.items.length > 0);
}

function getStudentName(student: AdminSearchStudent) {
    return [student.first_name, student.other_names].filter(Boolean).join(' ').trim() || 'Unknown student';
}

function formatSubscription(value: string | null | undefined) {
    if (!value) return 'Free';
    if (value.toLowerCase() === 'pro') return 'Pro';
    return formatLabel(value);
}

function formatLabel(value: string) {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
