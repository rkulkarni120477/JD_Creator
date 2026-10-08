import { POST as generate } from '@/app/api/jd/generate/route';

export async function POST(request: Request) {
  return generate(request);
}
