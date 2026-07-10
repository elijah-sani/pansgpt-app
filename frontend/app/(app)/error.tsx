'use client';

import RouteErrorState from '@/components/RouteErrorState';

export default function StudentSectionError({
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
      title="Student page failed to load"
      description="The student app shell is still available, but this page hit an unexpected problem."
      homeHref="/main"
    />
  );
}
