import { NextResponse } from 'next/server';

type WikipediaSearchResponse = {
  query?: {
    search?: Array<{ title?: string }>;
  };
};

type WikipediaSummaryResponse = {
  type?: string;
  extract?: string;
  description?: string;
  content_urls?: {
    desktop?: {
      page?: string;
    };
  };
};

const USER_AGENT = 'JD-Creator/0.1 (public company and client description lookup)';
const BUSINESS_DESCRIPTION =
  /\b(company|companies|corporation|enterprise|conglomerate|firm|manufacturer|retailer|publisher|distributor|bank|financial services|provider|organization|organisation|institution|university|school|hospital|association|agency|brand|platform|airline|nonprofit|non-profit)\b/i;

async function searchTitles(query: string): Promise<string[]> {
  const searchUrl = new URL('https://en.wikipedia.org/w/api.php');
  searchUrl.search = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: '5',
    format: 'json'
  }).toString();

  const response = await fetch(searchUrl, {
    headers: { 'User-Agent': USER_AGENT },
    next: { revalidate: 86400 }
  });
  if (!response.ok) {
    throw new Error(`Wikipedia search returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as WikipediaSearchResponse;
  return (data.query?.search ?? [])
    .map((result) => result.title)
    .filter((title): title is string => typeof title === 'string');
}

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get('name')?.trim();
  if (!name || name.length > 200) {
    return NextResponse.json(
      { message: 'Enter a name between 1 and 200 characters.', code: 'INVALID_NAME' },
      { status: 400 }
    );
  }

  try {
    for (const query of [`${name} company`, name]) {
      const titles = await searchTitles(query);
      for (const title of titles) {
        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        const summaryResponse = await fetch(summaryUrl, {
          headers: { 'User-Agent': USER_AGENT },
          next: { revalidate: 86400 }
        });
        if (summaryResponse.status === 404) {
          continue;
        }
        if (!summaryResponse.ok) {
          throw new Error(`Wikipedia summary returned HTTP ${summaryResponse.status}`);
        }

        const summary = (await summaryResponse.json()) as WikipediaSummaryResponse;
        const description = summary.description?.trim();
        const sourceUrl = summary.content_urls?.desktop?.page;
        if (
          summary.type !== 'disambiguation' &&
          description &&
          BUSINESS_DESCRIPTION.test(description) &&
          sourceUrl?.startsWith('https://en.wikipedia.org/')
        ) {
          return NextResponse.json({
            title,
            description: description.slice(0, 1000),
            sourceUrl
          });
        }
      }
    }

    return NextResponse.json(
      { message: 'No unambiguous public profile was found. Enter a description manually.', code: 'NOT_FOUND' },
      { status: 404 }
    );
  } catch (error) {
    console.error('Public profile lookup failed.', error);
    return NextResponse.json(
      { message: 'Online lookup is unavailable. Try again or enter a description manually.', code: 'LOOKUP_FAILED' },
      { status: 502 }
    );
  }
}
