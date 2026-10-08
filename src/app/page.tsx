'use client';

import { useMemo, useState } from 'react';
import { Download, FileText, Printer, Sparkles, Trash2 } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { AssumptionsPanel } from '@/components/AssumptionsPanel';
import { EmptyState } from '@/components/EmptyState';
import { ErrorMessage } from '@/components/ErrorMessage';
import { ExamplePrompts } from '@/components/ExamplePrompts';
import { downloadMarkdown, downloadPdf, downloadText } from '@/lib/jd-export';
import { formatJobDescriptionMarkdown } from '@/lib/jd-formatters';
import { isValidPrompt, MIN_PROMPT_LENGTH, normalizeJobDescription } from '@/lib/jd-schema';
import type { ApiError, GenerationResult } from '@/types/job-description';

const examplePrompts = [
  'Senior Python Developer with 5-8 years of Python, FastAPI, AWS, Docker, and PostgreSQL experience. Based in Bengaluru with a hybrid work arrangement.',
  'Frontend Engineer with 3-5 years of React, TypeScript, and design systems experience. Remote-first role focused on accessibility and performance.',
  'Product Manager with 5+ years of B2B SaaS experience, strong stakeholder communication, and a data-driven approach to planning and prioritization.'
];

type FormState = {
  prompt: string;
  job_title: string;
  technologies: string;
  experience_min: string;
  experience_max: string;
  location: string;
  work_arrangement: string;
  employment_type: string;
  industry: string;
  company_name: string;
  company_description: string;
};

const initialState: FormState = {
  prompt: '',
  job_title: '',
  technologies: '',
  experience_min: '',
  experience_max: '',
  location: '',
  work_arrangement: '',
  employment_type: '',
  industry: '',
  company_name: '',
  company_description: ''
};

export default function HomePage() {
  const [form, setForm] = useState<FormState>(initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);

  const promptLengthLabel = useMemo(() => `${form.prompt.trim().length} / ${Math.max(MIN_PROMPT_LENGTH, 5000)}`, [form.prompt]);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const validationMessage = isValidPrompt(form.prompt);
    if (validationMessage) {
      setError({ message: validationMessage, code: 'VALIDATION_ERROR' });
      return;
    }

    setIsLoading(true);

    try {
      const payload = {
        prompt: form.prompt.trim(),
        details: {
          job_title: form.job_title.trim() || undefined,
          technologies: form.technologies
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean),
          experience_min: form.experience_min ? Number(form.experience_min) : undefined,
          experience_max: form.experience_max ? Number(form.experience_max) : undefined,
          location: form.location.trim() || undefined,
          work_arrangement: form.work_arrangement || undefined,
          employment_type: form.employment_type || undefined,
          industry: form.industry.trim() || undefined,
          company_name: form.company_name.trim() || undefined,
          company_description: form.company_description.trim() || undefined
        },
        tone: 'professional'
      };

      const response = await fetch('/api/jd/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data || typeof data !== 'object') {
        throw {
          message: data?.message || 'Unable to generate a JD right now.',
          code: data?.code || 'REQUEST_FAILED',
          request_id: data?.request_id || ''
        };
      }

      const normalized = {
        request_id: String(data.request_id || 'generated'),
        prompt: form.prompt.trim(),
        job_description: normalizeJobDescription(data.job_description),
        assumptions: Array.isArray(data.assumptions)
          ? data.assumptions.filter((entry: unknown): entry is string => typeof entry === 'string')
          : [],
        missing_details: Array.isArray(data.missing_details)
          ? data.missing_details.filter((entry: unknown): entry is string => typeof entry === 'string')
          : []
      } satisfies GenerationResult;

      setResult(normalized);
      setError(null);
    } catch (caughtError) {
      const message = caughtError && typeof caughtError === 'object' && 'message' in caughtError ? String((caughtError as { message?: string }).message) : 'Unable to generate a JD right now.';
      const code = caughtError && typeof caughtError === 'object' && 'code' in caughtError ? String((caughtError as { code?: string }).code) : 'REQUEST_FAILED';
      const requestId = caughtError && typeof caughtError === 'object' && 'request_id' in caughtError ? String((caughtError as { request_id?: string }).request_id) : '';
      setError({ message, code, request_id: requestId || undefined });
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }

  function handleClear() {
    setForm(initialState);
    setError(null);
    setResult(null);
  }

  const jdSections = result?.job_description ? Object.entries(result.job_description) : [];

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1.45fr]">
          <section className="panel p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-700">Prompt</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">Create your JD</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{promptLengthLabel}</span>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label className="label" htmlFor="prompt">Describe the role</label>
                <textarea
                  id="prompt"
                  value={form.prompt}
                  onChange={(event) => updateField('prompt', event.target.value)}
                  rows={7}
                  minLength={MIN_PROMPT_LENGTH}
                  maxLength={5000}
                  placeholder="e.g., Senior Python Developer with 5-8 years of experience..."
                  className="input resize-none"
                />
              </div>

              <ExamplePrompts examples={examplePrompts} value={form.prompt} onSelect={(prompt) => updateField('prompt', prompt)} />

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-3 text-sm font-medium text-slate-700">Optional details</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="job_title">Job title</label>
                    <input id="job_title" value={form.job_title} onChange={(e) => updateField('job_title', e.target.value)} className="input" placeholder="Senior Product Manager" />
                  </div>
                  <div>
                    <label className="label" htmlFor="technologies">Technologies</label>
                    <input id="technologies" value={form.technologies} onChange={(e) => updateField('technologies', e.target.value)} className="input" placeholder="Python, FastAPI, AWS" />
                  </div>
                  <div>
                    <label className="label" htmlFor="experience_min">Min experience</label>
                    <input id="experience_min" type="number" min="0" value={form.experience_min} onChange={(e) => updateField('experience_min', e.target.value)} className="input" placeholder="5" />
                  </div>
                  <div>
                    <label className="label" htmlFor="experience_max">Max experience</label>
                    <input id="experience_max" type="number" min="0" value={form.experience_max} onChange={(e) => updateField('experience_max', e.target.value)} className="input" placeholder="8" />
                  </div>
                  <div>
                    <label className="label" htmlFor="location">Location</label>
                    <input id="location" value={form.location} onChange={(e) => updateField('location', e.target.value)} className="input" placeholder="Bengaluru, India" />
                  </div>
                  <div>
                    <label className="label" htmlFor="work_arrangement">Work arrangement</label>
                    <select id="work_arrangement" value={form.work_arrangement} onChange={(e) => updateField('work_arrangement', e.target.value)} className="input">
                      <option value="">Select</option>
                      <option value="remote">Remote</option>
                      <option value="hybrid">Hybrid</option>
                      <option value="onsite">On-site</option>
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="employment_type">Employment type</label>
                    <select id="employment_type" value={form.employment_type} onChange={(e) => updateField('employment_type', e.target.value)} className="input">
                      <option value="">Select</option>
                      <option value="full-time">Full-time</option>
                      <option value="part-time">Part-time</option>
                      <option value="contract">Contract</option>
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="industry">Industry</label>
                    <input id="industry" value={form.industry} onChange={(e) => updateField('industry', e.target.value)} className="input" placeholder="EdTech" />
                  </div>
                  <div>
                    <label className="label" htmlFor="company_name">Company name</label>
                    <input id="company_name" value={form.company_name} onChange={(e) => updateField('company_name', e.target.value)} className="input" placeholder="Academian" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="company_description">Company description</label>
                    <textarea id="company_description" value={form.company_description} onChange={(e) => updateField('company_description', e.target.value)} rows={4} className="input resize-none" placeholder="Brief description of the company and stage" />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 no-print">
                <button type="submit" className="primary-btn" disabled={isLoading}>
                  {isLoading ? 'Generating…' : 'Generate JD'}
                </button>
                <button type="button" className="secondary-btn" onClick={handleClear}>
                  <Trash2 className="mr-2 h-4 w-4" /> Clear
                </button>
              </div>
            </form>
          </section>

          <section className="space-y-5">
            <div className="panel p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 no-print">
                <div className="flex items-center gap-2 text-slate-700">
                  <Sparkles className="h-5 w-5 text-indigo-600" />
                  <span className="text-sm font-medium">Results</span>
                </div>
                {result ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="secondary-btn" onClick={() => result && downloadMarkdown(result.job_description)}>
                      <Download className="mr-2 h-4 w-4" /> Markdown
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => result && downloadText(result.job_description)}>
                      <FileText className="mr-2 h-4 w-4" /> Text
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => result && downloadPdf(result.job_description)}>
                      <Printer className="mr-2 h-4 w-4" /> PDF
                    </button>
                  </div>
                ) : null}
              </div>

              <ErrorMessage error={error} />

              {!result ? <EmptyState /> : (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <span className="font-medium text-slate-800">Request ID:</span> {result.request_id}
                  </div>

                  <article className="prose prose-slate max-w-none">
                    {result.job_description.job_title ? (
                      <h1 className="mt-0 text-3xl font-semibold tracking-tight text-slate-900">{result.job_description.job_title}</h1>
                    ) : null}

                    {(result.job_description.location || result.job_description.work_arrangement || result.job_description.employment_type || result.job_description.experience) && (
                      <p className="mt-2 text-sm text-slate-600">
                        {[
                          result.job_description.location,
                          result.job_description.work_arrangement,
                          result.job_description.employment_type,
                          result.job_description.experience
                        ]
                          .filter(Boolean)
                          .join(' • ')}
                      </p>
                    )}

                    {result.job_description.company_overview ? (
                      <section className="mt-6">
                        <h2 className="text-lg font-semibold text-slate-900">Company Overview</h2>
                        <p className="mt-2 text-slate-700">{result.job_description.company_overview}</p>
                      </section>
                    ) : null}

                    {result.job_description.role_summary ? (
                      <section className="mt-6">
                        <h2 className="text-lg font-semibold text-slate-900">Role Summary</h2>
                        <p className="mt-2 text-slate-700">{result.job_description.role_summary}</p>
                      </section>
                    ) : null}

                    {result.job_description.responsibilities?.length ? (
                      <section className="mt-6">
                        <h2 className="text-lg font-semibold text-slate-900">Key Responsibilities</h2>
                        <ul className="mt-2 list-disc space-y-2 pl-5 text-slate-700">
                          {result.job_description.responsibilities.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    {result.job_description.required_qualifications?.length ? (
                      <section className="mt-6">
                        <h2 className="text-lg font-semibold text-slate-900">Required Qualifications</h2>
                        <ul className="mt-2 list-disc space-y-2 pl-5 text-slate-700">
                          {result.job_description.required_qualifications.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    {result.job_description.preferred_qualifications?.length ? (
                      <section className="mt-6">
                        <h2 className="text-lg font-semibold text-slate-900">Preferred Qualifications</h2>
                        <ul className="mt-2 list-disc space-y-2 pl-5 text-slate-700">
                          {result.job_description.preferred_qualifications.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    {result.job_description.technical_skills?.length ? (
                      <section className="mt-6">
                        <h2 className="text-lg font-semibold text-slate-900">Technical Skills</h2>
                        <ul className="mt-2 list-disc space-y-2 pl-5 text-slate-700">
                          {result.job_description.technical_skills.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    {result.job_description.compensation_and_benefits ? (
                      <section className="mt-6">
                        <h2 className="text-lg font-semibold text-slate-900">Compensation and Benefits</h2>
                        <p className="mt-2 text-slate-700">{result.job_description.compensation_and_benefits}</p>
                      </section>
                    ) : null}

                    {result.job_description.application_instructions ? (
                      <section className="mt-6">
                        <h2 className="text-lg font-semibold text-slate-900">Application Instructions</h2>
                        <p className="mt-2 text-slate-700">{result.job_description.application_instructions}</p>
                      </section>
                    ) : null}
                  </article>

                  <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                    <p className="font-medium text-slate-800">Export this result:</p>
                    <p className="mt-1">Download markdown, plain text, or PDF for sharing and printing.</p>
                  </div>
                </div>
              )}
            </div>

            {result && <AssumptionsPanel assumptions={result.assumptions} missingDetails={result.missing_details} />}
          </section>
        </div>
      </main>
    </>
  );
}
