export type LecturerSearchRestriction = {
  id: string;
  title: string;
  course_code: string | null;
  level: string;
  start_time: string;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
};

export type LecturerSearchMaterial = {
  id: string;
  title: string;
  course_code: string | null;
  status: 'pending_review' | 'approved' | 'rejected' | 'ingesting' | 'ingested' | 'failed';
};

export type LecturerSearchResultCategory = 'Quick actions' | 'Restrictions' | 'Materials' | 'Help topics' | 'Account';

export type LecturerSearchResult = {
  id: string;
  title: string;
  description: string;
  href: string;
  category: LecturerSearchResultCategory;
};

const MATERIAL_STATUS_LABELS: Record<LecturerSearchMaterial['status'], string> = {
  pending_review: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  ingesting: 'Preparing',
  ingested: 'Added',
  failed: 'Needs attention',
};

const DASHBOARD_ACTIONS = [
  {
    id: 'action-restrictions',
    title: 'Start restriction',
    description: 'Create or manage access restrictions for tests.',
    href: '/lecturer/restrictions',
    category: 'Quick actions' as const,
    keywords: ['restriction', 'test', 'exam', 'cbt', 'assessment', 'block'],
  },
  {
    id: 'action-materials',
    title: 'Submit material',
    description: 'Upload course materials for review and student access.',
    href: '/lecturer/materials',
    category: 'Quick actions' as const,
    keywords: ['material', 'upload', 'submission', 'pdf', 'course'],
  },
  {
    id: 'action-help',
    title: 'Help guide',
    description: 'Open the lecturer help guide and platform instructions.',
    href: '/lecturer/help',
    category: 'Quick actions' as const,
    keywords: ['help', 'guide', 'support', 'instructions'],
  },
  {
    id: 'action-profile',
    title: 'Profile',
    description: 'Open your lecturer account profile.',
    href: '/lecturer/profile',
    category: 'Account' as const,
    keywords: ['profile', 'account', 'approval', 'lecturer details'],
  },
] as const;

const HELP_TOPICS = [
  { id: 'overview', title: 'Overview', description: 'Lecturer tools overview and account access basics.', keywords: ['overview', 'lecturer tools', 'access'] },
  { id: 'test-restrictions', title: 'Test restrictions', description: 'How to pause student AI access for a level.', keywords: ['restriction', 'test', 'cbt', 'assessment', 'exam'] },
  { id: 'material-submissions', title: 'Material submissions', description: 'How to submit materials for study use.', keywords: ['material', 'submission', 'upload', 'study'] },
  { id: 'account-approval', title: 'Account approval', description: 'Understand lecturer account approval and profile rules.', keywords: ['approval', 'account', 'profile', 'active', 'rejected'] },
  { id: 'support', title: 'Support', description: 'Contact PansGPT admin for lecturer help.', keywords: ['support', 'contact', 'admin', 'whatsapp'] },
] as const;

export function buildLecturerSearchResults({
  query,
  restrictions,
  materials,
  limit = 10,
}: {
  query: string;
  restrictions: LecturerSearchRestriction[];
  materials: LecturerSearchMaterial[];
  limit?: number;
}): LecturerSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const actionResults: LecturerSearchResult[] = DASHBOARD_ACTIONS.filter((item) =>
    `${item.title} ${item.description} ${item.keywords.join(' ')}`.toLowerCase().includes(normalizedQuery)
  ).map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    href: item.href,
    category: item.category,
  }));

  const restrictionResults: LecturerSearchResult[] = restrictions
    .filter((restriction) =>
      `${restriction.title} ${restriction.course_code || ''} ${restriction.level} ${restriction.status}`.toLowerCase().includes(normalizedQuery)
    )
    .slice(0, 5)
    .map((restriction) => ({
      id: `restriction-${restriction.id}`,
      title: restriction.course_code || restriction.title,
      description: `${restriction.level} - ${formatLabel(restriction.status)} - ${formatDateTime(restriction.start_time)}`,
      href: '/lecturer/restrictions',
      category: 'Restrictions',
    }));

  const materialResults: LecturerSearchResult[] = materials
    .filter((material) =>
      `${material.title} ${material.course_code || ''} ${material.status}`.toLowerCase().includes(normalizedQuery)
    )
    .slice(0, 5)
    .map((material) => ({
      id: `material-${material.id}`,
      title: material.title,
      description: `${material.course_code || 'Course not set'} - ${MATERIAL_STATUS_LABELS[material.status]}`,
      href: '/lecturer/materials',
      category: 'Materials',
    }));

  const helpResults: LecturerSearchResult[] = HELP_TOPICS.filter((topic) =>
    `${topic.title} ${topic.description} ${topic.keywords.join(' ')}`.toLowerCase().includes(normalizedQuery)
  ).map((topic) => ({
    id: `help-${topic.id}`,
    title: topic.title,
    description: topic.description,
    href: `/lecturer/help#${topic.id}`,
    category: 'Help topics',
  }));

  return [...actionResults, ...restrictionResults, ...materialResults, ...helpResults].slice(0, limit);
}

export function groupLecturerSearchResults(results: LecturerSearchResult[]) {
  const order: LecturerSearchResultCategory[] = ['Quick actions', 'Restrictions', 'Materials', 'Help topics', 'Account'];

  return order
    .map((category) => ({
      category,
      items: results.filter((result) => result.category === category),
    }))
    .filter((group) => group.items.length > 0);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
