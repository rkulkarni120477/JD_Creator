import { GET as lookup } from '@/app/api/company/lookup/route';

export async function GET(request: Request) {
  return lookup(request);
}
