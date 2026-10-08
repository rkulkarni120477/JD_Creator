type AssumptionsPanelProps = {
  assumptions: string[];
  missingDetails: string[];
};

export function AssumptionsPanel({ assumptions, missingDetails }: AssumptionsPanelProps) {
  const hasAssumptions = assumptions.length > 0;
  const hasMissing = missingDetails.length > 0;

  if (!hasAssumptions && !hasMissing) {
    return null;
  }

  return (
    <aside className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-soft">
      <h3 className="text-base font-semibold text-slate-900">Additional notes</h3>

      {hasAssumptions ? (
        <div className="mt-4">
          <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-amber-800">Assumptions</h4>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-700">
            {assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasMissing ? (
        <div className="mt-5">
          <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-amber-800">Missing details</h4>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-700">
            {missingDetails.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
