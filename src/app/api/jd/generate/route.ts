import { NextResponse } from 'next/server';

const MOCK_MODE = process.env.JD_CREATOR_USE_MOCK === 'true' || process.env.NEXT_PUBLIC_JD_CREATOR_USE_MOCK === 'true';

// Mirrors the backend response shape, built from the Data Analyst reference JD. Like the real generator it
// states no salary, benefits or company facts that were not supplied.
const mockJobDescription = {
  job_title: 'Data Analyst – Market Research',
  role_summary:
    'Academian is seeking a data-driven and detail-oriented **Data Analyst** to support a market research project focused on validating the effectiveness and relevance of **career readiness education courses**. You will analyze primary and secondary data and translate insights into strategies that inform program design, enrollment outreach and course effectiveness.',
  location: 'Remote',
  work_arrangement: 'Remote',
  employment_type: 'Contract',
  experience: '2–4 years',
  responsibilities: [
    'Analyze and synthesize data from primary research (surveys, interviews, focus groups) and secondary research (public databases, academic studies, labor market insights).',
    'Identify patterns, trends and correlations across student clusters, demographic segments and course categories.',
    'Support the development of a competency framework validation strategy using quantitative and qualitative insights.',
    'Evaluate educational performance indicators such as student engagement, course completion rates and post-course outcomes.',
    'Design and maintain interactive dashboards and visualizations to communicate insights to internal teams and stakeholders.',
    'Collaborate with project managers, instructional designers and enrollment strategists to turn insights into tactical actions.'
  ],
  education_requirements: [
    "Bachelor's degree in Data Science, Statistics, Economics, Market Research, Educational Research, or a related field."
  ],
  required_qualifications: [
    '2–4 years of experience in data analysis or market research, preferably in the education, workforce development or EdTech sectors.',
    'Proficiency in data analysis tools; advanced Excel knowledge is mandatory.',
    'Strong understanding of educational metrics such as enrollment trends, course completion and competency validation.',
    'Ability to communicate complex findings to technical and non-technical stakeholders.'
  ],
  preferred_qualifications: [
    'Experience with education or labor market datasets (e.g., IPEDS, BLS, EMSI, NCES).',
    'Familiarity with survey design, data cleaning and qualitative data coding.',
    'Experience in user segmentation or cluster analysis.',
    'Knowledge of career readiness frameworks or employability skill assessments.'
  ],
  technical_skills: [],
  work_environment: [
    'Flexible, collaborative environment with opportunities for asynchronous and remote work.',
    'May require participation in team check-ins or review meetings.'
  ],
  engagement_details: 'This is a remote contract opportunity.',
  closing_statement:
    'If you enjoy turning education data into decisions that improve career readiness programs, we encourage you to apply.'
};

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (MOCK_MODE) {
      return NextResponse.json({
        request_id: 'mock-request-001',
        job_description: mockJobDescription,
        assumptions: ['Used mock mode for local development and UI validation.'],
        missing_details: ['Contract duration and weekly hours were not supplied.'],
        quality_warnings: [
          {
            severity: 'warning',
            section: 'engagement_details',
            message: 'Sample warning from mock mode: no contract duration is stated.'
          }
        ]
      });
    }

    const apiBaseUrl =
      process.env.JD_CREATOR_API_URL ||
      (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8000' : undefined);
    if (!apiBaseUrl) {
      return NextResponse.json(
        {
          message: 'JD Creator backend is not configured. Set JD_CREATOR_API_URL in the server environment.',
          code: 'CONFIGURATION_ERROR',
          request_id: 'local-config-missing'
        },
        { status: 503 }
      );
    }

    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/jd/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        cache: 'no-store'
      });
    } catch {
      return NextResponse.json(
        {
          message: 'Unable to reach the JD Creator backend. Start the backend on port 8000 or set JD_CREATOR_API_URL.',
          code: 'BACKEND_UNAVAILABLE',
          request_id: 'backend-unavailable'
        },
        { status: 502 }
      );
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorData =
        data?.detail && typeof data.detail === 'object' ? data.detail : data;
      return NextResponse.json(
        {
          message: errorData?.message || 'The JD generator request failed.',
          code: errorData?.error_code || errorData?.code || 'REQUEST_FAILED',
          request_id: errorData?.request_id || response.headers.get('X-Request-ID') || 'unknown'
        },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        message: 'The JD generator request failed due to an unexpected server error.',
        code: 'INTERNAL_ERROR',
        request_id: 'server-error'
      },
      { status: 500 }
    );
  }
}
