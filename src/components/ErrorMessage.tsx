import type { ApiError } from '@/types/job-description';

export function ErrorMessage({ error }: { error: ApiError | null }) {
  if (!error) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
      <p className="font-medium">{error.message}</p>
      {error.request_id ? (
        <p className="mt-1 text-red-700">Request ID: {error.request_id}</p>
      ) : null}
    </div>
  );
}
