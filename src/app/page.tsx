'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Download, FileText, FileType, Printer, Sparkles, Trash2 } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { AssumptionsPanel } from '@/components/AssumptionsPanel';
import { EmptyState } from '@/components/EmptyState';
import { ErrorMessage } from '@/components/ErrorMessage';
import { ExamplePrompts } from '@/components/ExamplePrompts';
import { QualityWarningsPanel } from '@/components/QualityWarningsPanel';
import { copyToClipboard, downloadMarkdown, downloadPdf, downloadText, downloadWord } from '@/lib/jd-export';
import { getJobDescriptionMetadata, getJobDescriptionSections, parseInline } from '@/lib/jd-formatters';
import { isValidPrompt, MIN_PROMPT_LENGTH, normalizeJobDescription, normalizeQualityWarnings } from '@/lib/jd-schema';
import type { ApiError, GenerationResult, Tone } from '@/types/job-description';

const examplePrompts = [
  'Senior Python Developer with 5-8 years of Python, FastAPI, AWS, Docker, and PostgreSQL experience. Based in Bengaluru with a hybrid work arrangement.',
  'Business Analyst with 5+ years of experience to lead stakeholder interviews and requirements gathering for modernizing a client\'s print and digital content pipeline. Experience with taxonomies and metadata models is a plus.',
  'Data Analyst with 2-4 years of experience for a market research project validating career readiness courses. Analyze surveys, focus groups and labor market data (IPEDS, BLS); advanced Excel is mandatory.'
];

const toneOptions: Array<{ value: Tone; label: string }> = [
  { value: 'professional', label: 'Professional' },
  { value: 'concise', label: 'Concise' },
  { value: 'detailed', label: 'Detailed' }
];

const employmentTypeOptions = [
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' }
];

type FormState = {
  prompt: string;
  job_title: string;
  technologies: string;
  experience_min: string;
  experience_max: string;
  location: string;
  work_arrangement: string;
  employment_types: string[];
  industry: string;
  company_name: string;
  company_description: string;
  client_context: string;
  education: string;
  preferred_background: string;
  collaborators: string;
  engagement_details: string;
  work_environment: string;
  tone: Tone;
};

type TextField = Exclude<keyof FormState, 'employment_types' | 'tone'>;

const initialState: FormState = {
  prompt: '',
  job_title: '',
  technologies: '',
  experience_min: '',
  experience_max: '',
  location: '',
  work_arrangement: '',
  employment_types: [],
  industry: '',
  company_name: '',
  company_description: '',
  client_context: '',
  education: '',
  preferred_background: '',
  collaborators: '',
  engagement_details: '',
  work_environment: '',
  tone: 'professional'
};

/** Renders **bold** runs from the model's text without interpreting any other markup. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((segment, index) =>
        segment.bold ? <strong key={index} className="font-semibold text-slate-900">{segment.text}</strong> : segment.text
      )}
    </>
  );
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export default function HomePage() {
  const [form, setForm] = useState<FormState>(initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [copied, setCopied] = useState(false);

  const promptLengthLabel = useMemo(() => `${form.prompt.trim().length} / ${Math.max(MIN_PROMPT_LENGTH, 5000)}`, [form.prompt]);

  function updateField(field: TextField, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleEmploymentType(value: string) {
    setForm((current) => ({
      ...current,
      employment_types: current.employment_types.includes(value)
        ? current.employment_types.filter((entry) => entry !== value)
        : [...current.employment_types, value]
    }));
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
          technologies: splitList(form.technologies),
          experience_min: form.experience_min ? Number(form.experience_min) : undefined,
          experience_max: form.experience_max ? Number(form.experience_max) : undefined,
          location: form.location.trim() || undefined,
          work_arrangement: form.work_arrangement || undefined,
          // Keep the option order stable so "contract, part-time" reads the same regardless of click order
          employment_type:
            employmentTypeOptions
              .filter((option) => form.employment_types.includes(option.value))
              .map((option) => option.value)
              .join(', ') || undefined,
          industry: form.industry.trim() || undefined,
          company_name: form.company_name.trim() || undefined,
          company_description: form.company_description.trim() || undefined,
          client_context: form.client_context.trim() || undefined,
          education: form.education.trim() || undefined,
          preferred_background: splitList(form.preferred_background),
          collaborators: splitList(form.collaborators),
          engagement_details: form.engagement_details.trim() || undefined,
          work_environment: form.work_environment.trim() || undefined
        },
        tone: form.tone
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
        company_name: form.company_name.trim() || undefined,
        job_description: normalizeJobDescription(data.job_description),
        assumptions: Array.isArray(data.assumptions)
          ? data.assumptions.filter((entry: unknown): entry is string => typeof entry === 'string')
          : [],
        missing_details: Array.isArray(data.missing_details)
          ? data.missing_details.filter((entry: unknown): entry is string => typeof entry === 'string')
          : [],
        quality_warnings: normalizeQualityWarnings(data.quality_warnings)
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

  async function handleCopy() {
    if (!result) {
      return;
    }
    try {
      await copyToClipboard(result.job_description);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError({ message: 'Copying was blocked by the browser. Use one of the download options instead.', code: 'COPY_FAILED' });
    }
  }

  function handleClear() {
    setForm(initialState);
    setError(null);
    setResult(null);
  }

  const jdSections = result ? getJobDescriptionSections(result.job_description) : [];
  const jdMetadata = result ? getJobDescriptionMetadata(result.job_description) : [];
  const exportOptions = { companyName: result?.company_name };

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
                    <label className="label" htmlFor="technologies">Tools &amp; technologies</label>
                    <input id="technologies" value={form.technologies} onChange={(e) => updateField('technologies', e.target.value)} className="input" placeholder="Advanced Excel (mandatory), Tableau" />
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
                  <fieldset>
                    <legend className="label">Employment type</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2">
                      {employmentTypeOptions.map((option) => (
                        <label key={option.value} className="inline-flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={form.employment_types.includes(option.value)}
                            onChange={() => toggleEmploymentType(option.value)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
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
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="client_context">Client / project context</label>
                    <textarea id="client_context" value={form.client_context} onChange={(e) => updateField('client_context', e.target.value)} rows={3} maxLength={1000} className="input resize-none" placeholder="The client, project or initiative this role supports" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="education">Education</label>
                    <input id="education" value={form.education} onChange={(e) => updateField('education', e.target.value)} maxLength={500} className="input" placeholder="Bachelor's in Statistics, Economics, or a related field" />
                  </div>
                  <div>
                    <label className="label" htmlFor="preferred_background">Preferred sector background</label>
                    <input id="preferred_background" value={form.preferred_background} onChange={(e) => updateField('preferred_background', e.target.value)} className="input" placeholder="EdTech, publishing" />
                  </div>
                  <div>
                    <label className="label" htmlFor="collaborators">Works with</label>
                    <input id="collaborators" value={form.collaborators} onChange={(e) => updateField('collaborators', e.target.value)} className="input" placeholder="Content Strategists, Engineering" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="engagement_details">Engagement details</label>
                    <input id="engagement_details" value={form.engagement_details} onChange={(e) => updateField('engagement_details', e.target.value)} maxLength={500} className="input" placeholder="Flexible hours based on project needs; 6-month contract" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="work_environment">Work environment</label>
                    <input id="work_environment" value={form.work_environment} onChange={(e) => updateField('work_environment', e.target.value)} maxLength={500} className="input" placeholder="Asynchronous and remote; occasional team check-ins" />
                  </div>
                </div>
              </div>

              <div className="max-w-xs">
                <label className="label" htmlFor="tone">Writing tone</label>
                <select id="tone" value={form.tone} onChange={(e) => setForm((current) => ({ ...current, tone: e.target.value as Tone }))} className="input">
                  {toneOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
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
                    <button type="button" className="secondary-btn" onClick={handleCopy} aria-live="polite">
                      {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />} {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => downloadWord(result.job_description, exportOptions)}>
                      <FileType className="mr-2 h-4 w-4" /> Word
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => downloadPdf(result.job_description, exportOptions)}>
                      <Printer className="mr-2 h-4 w-4" /> PDF
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => downloadMarkdown(result.job_description)}>
                      <Download className="mr-2 h-4 w-4" /> Markdown
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => downloadText(result.job_description)}>
                      <FileText className="mr-2 h-4 w-4" /> Text
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

                  <QualityWarningsPanel warnings={result.quality_warnings} />

                  <article className="prose prose-slate max-w-none">
                    {result.job_description.job_title ? (
                      <h1 className="mt-0 text-3xl font-semibold tracking-tight text-slate-900">{result.job_description.job_title}</h1>
                    ) : null}

                    {jdMetadata.length > 0 ? (
                      <dl className="mt-3 space-y-0.5 text-sm text-slate-700">
                        {jdMetadata.map(({ label, value }) => (
                          <div key={label}>
                            <dt className="inline font-semibold text-slate-900">{label}:</dt> <dd className="inline">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}

                    {jdSections.map(({ heading, content }, index) => (
                      <section key={heading ?? `paragraph-${index}`} className="mt-6">
                        {heading ? <h2 className="text-lg font-semibold text-slate-900">{heading}:</h2> : null}
                        {Array.isArray(content) ? (
                          <ul className="mt-2 list-disc space-y-2 pl-5 text-slate-700">
                            {content.map((item, itemIndex) => (
                              <li key={itemIndex}><RichText text={item} /></li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-slate-700"><RichText text={content} /></p>
                        )}
                      </section>
                    ))}
                  </article>

                  <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                    <p className="font-medium text-slate-800">Export this result:</p>
                    <p className="mt-1">Copy it into a job board, or download it as Word, PDF, Markdown or plain text.</p>
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
