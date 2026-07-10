'use client';

import RouteErrorState from '@/components/RouteErrorState';

export default function AdminSectionError({
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
      title="Admin page failed to load"
      description="The admin shell is still available, but this page hit an unexpected problem."
      homeHref="/admin"
    />
  );
}
