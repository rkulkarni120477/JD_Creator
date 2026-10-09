export type JobDescription = {
  job_title?: string | null;
  role_summary?: string | null;
  company_overview?: string | null;
  project_context?: string | null;
  location?: string | null;
  work_arrangement?: string | null;
  employment_type?: string | null;
  experience?: string | null;
  responsibilities?: string[];
  required_qualifications?: string[];
  education_requirements?: string[];
  preferred_qualifications?: string[];
  technical_skills?: string[];
  engagement_details?: string | null;
  work_environment?: string[];
  compensation_and_benefits?: string | null;
  application_instructions?: string | null;
  closing_statement?: string | null;
};

export type QualityWarning = {
  severity: 'error' | 'warning';
  /** JobDescription field the problem is tied to, when there is one. */
  section?: string | null;
  message: string;
};

export type Tone = 'professional' | 'concise' | 'detailed';

export type GenerationResult = {
  request_id?: string;
  prompt: string;
  /** The hiring company as entered in the form; used for the PDF and Word banner. */
  company_name?: string;
  job_description: JobDescription;
  assumptions: string[];
  missing_details: string[];
  quality_warnings: QualityWarning[];
};

export type ApiError = {
  message: string;
  code?: string;
  request_id?: string;
  status?: number;
};

export type UiStatus = 'idle' | 'loading' | 'success' | 'error';
