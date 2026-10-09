import type { JobDescription } from '@/types/job-description';

export type JdSection = {
  /** Null for sections rendered as a bare paragraph, such as the closing statement. */
  heading: string | null;
  content: string | string[];
};

/** Ordered, non-empty body sections of a JD. Shared by the on-screen view and every export format. */
export function getJobDescriptionSections(jd: JobDescription): JdSection[] {
  const candidates: Array<[string | null, string | string[] | null | undefined]> = [
    ['Company Overview', jd.company_overview],
    ['About the Project', jd.project_context],
    ['Role Summary', jd.role_summary],
    ['Key Responsibilities', jd.responsibilities],
    ['Required Qualifications', jd.required_qualifications],
    ['Education', jd.education_requirements],
    ['Preferred Qualifications', jd.preferred_qualifications],
    ['Technical Skills', jd.technical_skills],
    ['Engagement Details', jd.engagement_details],
    ['Work Environment', jd.work_environment],
    ['Compensation and Benefits', jd.compensation_and_benefits],
    ['Application Instructions', jd.application_instructions],
    [null, jd.closing_statement]
  ];

  return candidates.flatMap(([heading, content]) => {
    if (!content || (Array.isArray(content) && content.length === 0)) {
      return [];
    }
    return [{ heading, content }];
  });
}

export function getJobDescriptionMetadata(jd: JobDescription): string {
  return [jd.location, jd.work_arrangement, jd.employment_type, jd.experience].filter(Boolean).join(' • ');
}

export function formatJobDescriptionMarkdown(jd: JobDescription): string {
  const lines: string[] = [];

  if (jd.job_title) {
    lines.push(`# ${jd.job_title}`);
    lines.push('');
  }

  const metadata = getJobDescriptionMetadata(jd);
  if (metadata) {
    lines.push(`*${metadata}*`);
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
  const markdown = formatJobDescriptionMarkdown(jd);
  return markdown
    .replace(/^# /gm, '')
    .replace(/^## /gm, '')
    .replace(/^- /gm, '• ')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim();
}
