export type BootstrapRouteResponse = {
  is_admin?: boolean;
  is_super_admin?: boolean;
  is_lecturer?: boolean;
  lecturer_status?: 'pending' | 'active' | 'rejected' | 'suspended' | 'revoked' | null;
};

export function resolveDestinationFromBootstrap(bootstrap: BootstrapRouteResponse | null | undefined): string {
  if (bootstrap?.is_admin || bootstrap?.is_super_admin) {
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
