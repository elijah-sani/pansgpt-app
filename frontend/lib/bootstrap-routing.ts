export type BootstrapRouteResponse = {
  is_admin?: boolean;
  is_super_admin?: boolean;
  is_global_admin?: boolean;
  is_university_admin?: boolean;
  is_senior_university_admin?: boolean;
  admin_level?: 'senior' | 'standard' | null;
  is_lecturer?: boolean;
  lecturer_status?: 'pending' | 'active' | 'rejected' | 'suspended' | 'revoked' | null;
  university_status?: 'active' | 'suspended' | null;
  is_university_suspended?: boolean;
};

export function resolveDestinationFromBootstrap(bootstrap: BootstrapRouteResponse | null | undefined): string {
  if (bootstrap?.is_super_admin || bootstrap?.is_global_admin) {
    return '/super-admin';
  }

  if (bootstrap?.is_university_admin) {
    return '/admin';
  }

  if (bootstrap?.is_lecturer) {
    if (bootstrap.lecturer_status === 'active') {
      return '/lecturer';
    }

    if (bootstrap.lecturer_status === 'pending') {
      return '/lecturer/pending';
    }

    if (bootstrap.lecturer_status && ['rejected', 'suspended', 'revoked'].includes(bootstrap.lecturer_status)) {
      return '/lecturer';
    }
  }

  return '/main';
}

export async function resolvePostLoginDestination(): Promise<string> {
  try {
    const { fetchBootstrap } = await import('@/lib/bootstrap-cache');
    const bootstrap = await fetchBootstrap();
    if (!bootstrap) {
      return '/main';
    }
    return resolveDestinationFromBootstrap(bootstrap);
  } catch (error) {
    console.warn('[Auth] Bootstrap redirect resolution failed, falling back to /main', error);
    return '/main';
  }
}
