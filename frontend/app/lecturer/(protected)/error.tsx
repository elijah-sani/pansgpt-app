'use client';

import RouteErrorState from '@/components/RouteErrorState';

export default function LecturerSectionError({
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
      title="Lecturer page failed to load"
      description="The lecturer shell is still available, but this page hit an unexpected problem."
      homeHref="/lecturer"
    />
  );
}
