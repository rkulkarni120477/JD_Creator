import { NextResponse } from 'next/server';

const MOCK_MODE = process.env.JD_CREATOR_USE_MOCK === 'true' || process.env.NEXT_PUBLIC_JD_CREATOR_USE_MOCK === 'true';

const mockJobDescription = {
  job_title: 'Senior Product Manager',
  company_overview:
    'Academian is building a modern learning platform that helps teams access high-quality, role-specific enablement content across product, engineering, and recruiting workflows.',
  role_summary:
    'Lead the roadmap for talent and learning experiences, align product priorities with business objectives, and partner closely with design, engineering, and operations to deliver measurable value.',
  location: 'Remote / Bengaluru, India',
  work_arrangement: 'Hybrid',
  employment_type: 'Full-time',
  experience: '5+ years',
  responsibilities: [
    'Define and prioritize the product roadmap for AI-assisted hiring and internal enablement workflows.',
    'Partner with stakeholders to translate business objectives into clear product requirements.',
    'Own discovery, opportunity sizing, and experimentation to improve conversion and retention.',
    'Work closely with engineering and design teams to ship customer-centric products at scale.'
  ],
  required_qualifications: [
    '5+ years in product management, ideally in B2B SaaS or platform products.',
    'Strong analytical skills and comfort working with product metrics and experimentation.',
    'Experience collaborating with cross-functional teams in a fast-moving environment.'
  ],
  preferred_qualifications: [
    'Experience in AI-enabled workflows or talent infrastructure products.',
    'Background in hiring operations, recruiting tech, or education products.',
    'Excellent written communication and stakeholder management skills.'
  ],
  technical_skills: ['Product strategy', 'Roadmapping', 'SQL', 'Experimentation', 'Stakeholder management'],
  compensation_and_benefits: 'Competitive salary, ESOPs, flexible working arrangements, and learning reimbursements.',
  application_instructions: 'Please share your resume and a brief note on the product challenges you have solved.'
};

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (MOCK_MODE) {
      return NextResponse.json({
        request_id: 'mock-request-001',
        job_description: mockJobDescription,
        assumptions: ['Used mock mode for local development and UI validation.'],
        missing_details: []
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
