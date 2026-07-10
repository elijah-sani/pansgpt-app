'use client';

import RouteErrorState from '@/components/RouteErrorState';

export default function SuperAdminSectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      title="Super Admin page failed to load"
      description="The super-admin shell is still available, but this page hit an unexpected problem."
      homeHref="/super-admin"
    />
  );
}
