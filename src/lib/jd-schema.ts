import type { JobDescription } from '@/types/job-description';

export const MIN_PROMPT_LENGTH = 10;
export const MAX_PROMPT_LENGTH = 5000;

export function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function normalizeJobDescription(value: unknown): JobDescription {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const source = value as Record<string, unknown>;

  return {
    job_title: normalizeText(source.job_title),
    role_summary: normalizeText(source.role_summary),
    company_overview: normalizeText(source.company_overview),
    project_context: normalizeText(source.project_context),
    location: normalizeText(source.location),
    work_arrangement: normalizeText(source.work_arrangement),
    employment_type: normalizeText(source.employment_type),
    experience: normalizeText(source.experience),
    responsibilities: normalizeStringArray(source.responsibilities),
    required_qualifications: normalizeStringArray(source.required_qualifications),
    education_requirements: normalizeStringArray(source.education_requirements),
    preferred_qualifications: normalizeStringArray(source.preferred_qualifications),
    technical_skills: normalizeStringArray(source.technical_skills),
    engagement_details: normalizeText(source.engagement_details),
    work_environment: normalizeStringArray(source.work_environment),
    compensation_and_benefits: normalizeText(source.compensation_and_benefits),
    application_instructions: normalizeText(source.application_instructions),
    closing_statement: normalizeText(source.closing_statement)
  };
}

export function isValidPrompt(prompt: string): string | null {
  const trimmed = prompt.trim();

  if (!trimmed) {
    return 'Please enter the role requirements.';
  }

  if (trimmed.length < MIN_PROMPT_LENGTH) {
    return `Enter at least ${MIN_PROMPT_LENGTH} characters describing the role.`;
  }

  if (trimmed.length > MAX_PROMPT_LENGTH) {
    return `Keep the prompt under ${MAX_PROMPT_LENGTH} characters.`;
  }

  return null;
}

export function describeWorkArrangement(value?: string | null): string {
  const mappings: Record<string, string> = {
    remote: 'Remote',
    hybrid: 'Hybrid',
    onsite: 'On-site',
    'on-site': 'On-site',
    fulltime: 'Full-time',
    'full-time': 'Full-time',
    'part-time': 'Part-time',
    contract: 'Contract'
  };

  if (!value) {
    return 'Not specified';
  }

  return mappings[value.toLowerCase()] ?? value;
}
