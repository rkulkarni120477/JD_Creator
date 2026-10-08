export function EmptyState() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center shadow-sm">
      <div className="mb-4 rounded-full bg-indigo-100 p-3 text-indigo-700">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-none stroke-current">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H15l4 4v11.5A2.5 2.5 0 0 1 16.5 21h-10A2.5 2.5 0 0 1 4 18.5v-13Z" strokeWidth="1.7" />
          <path d="M15 3v4h4M8 11h8M8 15h8" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="text-xl font-semibold text-slate-900">Your job description will appear here</h3>
      <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
        Enter the role details and generate a polished JD for hiring managers, recruiters, or your internal team.
      </p>
    </div>
  );
}
