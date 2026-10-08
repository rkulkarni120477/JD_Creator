export type JobDescription = {
  job_title?: string | null;
  role_summary?: string | null;
  company_overview?: string | null;
  location?: string | null;
  work_arrangement?: string | null;
  employment_type?: string | null;
  experience?: string | null;
  responsibilities?: string[];
  required_qualifications?: string[];
  preferred_qualifications?: string[];
  technical_skills?: string[];
  compensation_and_benefits?: string | null;
  application_instructions?: string | null;
};

export type GenerationResult = {
  request_id?: string;
  prompt: string;
  job_description: JobDescription;
  assumptions: string[];
  missing_details: string[];
};

export type ApiError = {
  message: string;
  code?: string;
  request_id?: string;
  status?: number;
};

export type UiStatus = 'idle' | 'loading' | 'success' | 'error';
