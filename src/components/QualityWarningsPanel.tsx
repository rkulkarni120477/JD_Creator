import { AlertTriangle, CircleAlert } from 'lucide-react';
import type { QualityWarning } from '@/types/job-description';

// Reader-facing names for the JobDescription fields a warning can point at
const SECTION_LABELS: Record<string, string> = {
  job_title: 'Job title',
  role_summary: 'Opening paragraph',
  company_overview: 'Company overview',
  project_context: 'About the project',
  location: 'Location',
  work_arrangement: 'Work arrangement',
  employment_type: 'Job type',
  experience: 'Experience',
  responsibilities: 'Key responsibilities',
  required_qualifications: 'Required qualifications',
  education_requirements: 'Education',
  preferred_qualifications: 'Preferred qualifications',
  technical_skills: 'Technical skills',
  engagement_details: 'Closing paragraph',
  work_environment: 'Work environment',
  compensation_and_benefits: 'Compensation and benefits',
  application_instructions: 'Application instructions',
  closing_statement: 'Closing paragraph'
};

export function QualityWarningsPanel({ warnings }: { warnings: QualityWarning[] }) {
  if (warnings.length === 0) {
    return null;
  }

  // Errors first: they mark text that should not be published as-is
  const ordered = [...warnings].sort((a, b) => Number(b.severity === 'error') - Number(a.severity === 'error'));
  const errorCount = warnings.filter((warning) => warning.severity === 'error').length;

  return (
    <aside className="rounded-2xl border border-red-200 bg-red-50/60 p-4" aria-label="Quality checks">
      <h3 className="text-sm font-semibold text-slate-900">
        Review before publishing
        <span className="ml-2 font-normal text-slate-600">
          {errorCount > 0 ? `${errorCount} to fix, ` : ''}
          {warnings.length - errorCount} to check
        </span>
      </h3>
      <ul className="mt-3 space-y-2 text-sm">
        {ordered.map((warning, index) => {
          const isError = warning.severity === 'error';
          const Icon = isError ? CircleAlert : AlertTriangle;
          return (
            <li key={`${warning.section}-${index}`} className="flex gap-2">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${isError ? 'text-red-600' : 'text-amber-600'}`} aria-hidden />
              <span className="text-slate-700">
                <span className="sr-only">{isError ? 'Error: ' : 'Warning: '}</span>
                {warning.section ? (
                  <span className="font-medium text-slate-900">{SECTION_LABELS[warning.section] ?? warning.section}: </span>
                ) : null}
                {warning.message}
              </span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
