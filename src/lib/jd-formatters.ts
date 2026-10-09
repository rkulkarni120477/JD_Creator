// Runtime-dependency free (type imports only) so `node --test` can load it directly; see tests/frontend.
// Keep in step with app/static/jd-format.js, which renders the same layout for the FastAPI-served UI.
import type { JobDescription } from '@/types/job-description';

export type JdSection = {
  /** Null for sections rendered as a bare paragraph: the opening summary and the closing paragraph. */
  heading: string | null;
  content: string | string[];
};

export type MetadataItem = { label: string; value: string };

/** A run of text inside a paragraph or bullet; the model marks emphasis with **double asterisks**. */
export type InlineSegment = { text: string; bold: boolean };

const ARRANGEMENT_LABELS: Record<string, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
  'on-site': 'On-site'
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  'full-time': 'Full-time',
  fulltime: 'Full-time',
  'part-time': 'Part-time',
  parttime: 'Part-time',
  contract: 'Contract'
};

export function parseInline(text: string): InlineSegment[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('**') && part.endsWith('**') && part.length > 4
        ? { text: part.slice(2, -2), bold: true }
        : { text: part, bold: false }
    );
}

export function stripInline(text: string): string {
  return parseInline(text)
    .map((segment) => segment.text)
    .join('');
}

/** "contract, part-time" → "Contract or Part-time"; text the model already wrote in prose is kept as-is. */
function formatEmploymentType(value: string): string {
  const parts = value.split(/\s*,\s*/).filter(Boolean);
  if (!parts.every((part) => part.toLowerCase() in EMPLOYMENT_LABELS)) {
    return value;
  }
  return parts.map((part) => EMPLOYMENT_LABELS[part.toLowerCase()]).join(' or ');
}

/** Labelled header lines, as in "Location: Remote" / "Job Type: Contract". */
export function getJobDescriptionMetadata(jd: JobDescription): MetadataItem[] {
  const items: MetadataItem[] = [];

  if (jd.location) {
    items.push({ label: 'Location', value: jd.location });
  }
  if (jd.work_arrangement) {
    const arrangement = ARRANGEMENT_LABELS[jd.work_arrangement.toLowerCase()] ?? jd.work_arrangement;
    // Avoid "Location: Remote" followed by "Work Arrangement: remote"
    if (!jd.location?.toLowerCase().includes(arrangement.toLowerCase())) {
      items.push({ label: 'Work Arrangement', value: arrangement });
    }
  }
  if (jd.employment_type) {
    items.push({ label: 'Job Type', value: formatEmploymentType(jd.employment_type) });
  }
  if (jd.experience) {
    items.push({ label: 'Experience', value: jd.experience });
  }

  return items;
}

const isPreferred = (item: string) => /\bprefer/i.test(item);

/** Ordered, non-empty body sections of a JD. Shared by the on-screen view and every export format. */
export function getJobDescriptionSections(jd: JobDescription): JdSection[] {
  const education = jd.education_requirements ?? [];
  // Degree requirements lead the matching qualifications list, as in the reference JDs
  const required = [...education.filter((item) => !isPreferred(item)), ...(jd.required_qualifications ?? [])];
  const preferred = [...education.filter(isPreferred), ...(jd.preferred_qualifications ?? [])];
  // Engagement terms and the invitation to apply read as one closing paragraph
  const closing = [jd.engagement_details, jd.closing_statement].filter(Boolean).join(' ');

  const candidates: Array<[string | null, string | string[] | null | undefined]> = [
    [null, jd.role_summary],
    ['Company Overview', jd.company_overview],
    ['About the Project', jd.project_context],
    ['Key Responsibilities', jd.responsibilities],
    ['Required Qualifications', required],
    ['Preferred Qualifications', preferred],
    ['Technical Skills', jd.technical_skills],
    ['Work Environment', jd.work_environment],
    ['Compensation and Benefits', jd.compensation_and_benefits],
    ['Application Instructions', jd.application_instructions],
    [null, closing]
  ];

  return candidates.flatMap(([heading, content]) => {
    if (!content || (Array.isArray(content) && content.length === 0)) {
      return [];
    }
    return [{ heading, content }];
  });
}

export function formatJobDescriptionMarkdown(jd: JobDescription): string {
  const lines: string[] = [];

  if (jd.job_title) {
    lines.push(`# ${jd.job_title}`);
    lines.push('');
  }

  const metadata = getJobDescriptionMetadata(jd);
  if (metadata.length > 0) {
    // Two trailing spaces force a line break between the header lines
    lines.push(metadata.map(({ label, value }) => `**${label}:** ${value}`).join('  \n'));
    lines.push('');
  }

  for (const { heading, content } of getJobDescriptionSections(jd)) {
    if (heading) {
      lines.push(`## ${heading}`);
    }
    if (Array.isArray(content)) {
      content.forEach((item) => lines.push(`- ${item}`));
    } else {
      lines.push(content);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

export function formatJobDescriptionPlainText(jd: JobDescription): string {
  const lines: string[] = [];

  if (jd.job_title) {
    lines.push(jd.job_title, '');
  }

  const metadata = getJobDescriptionMetadata(jd);
  if (metadata.length > 0) {
    metadata.forEach(({ label, value }) => lines.push(`${label}: ${value}`));
    lines.push('');
  }

  for (const { heading, content } of getJobDescriptionSections(jd)) {
    if (heading) {
      lines.push(`${heading}:`);
    }
    if (Array.isArray(content)) {
      content.forEach((item) => lines.push(`• ${stripInline(item)}`));
    } else {
      lines.push(stripInline(content));
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

function inlineHtml(text: string): string {
  return parseInline(text)
    .map(({ text: run, bold }) => (bold ? `<strong>${escapeHtml(run)}</strong>` : escapeHtml(run)))
    .join('');
}

/** Rich clipboard content, so pasting into Word, Docs or a job board keeps headings, bullets and bold text. */
export function formatJobDescriptionHtml(jd: JobDescription): string {
  const parts: string[] = [];

  if (jd.job_title) {
    parts.push(`<h1>${escapeHtml(jd.job_title)}</h1>`);
  }

  const metadata = getJobDescriptionMetadata(jd);
  if (metadata.length > 0) {
    const lines = metadata.map(({ label, value }) => `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}`);
    parts.push(`<p>${lines.join('<br>')}</p>`);
  }

  for (const { heading, content } of getJobDescriptionSections(jd)) {
    if (heading) {
      parts.push(`<h2>${escapeHtml(heading)}</h2>`);
    }
    if (Array.isArray(content)) {
      parts.push(`<ul>${content.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</ul>`);
    } else {
      parts.push(`<p>${inlineHtml(content)}</p>`);
    }
  }

  return parts.join('\n');
}
