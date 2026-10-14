// public: the preview token is the credential; a board member with the link has no account (PUB-13, D-53)
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { clientIp } from '@/core/http';
import { hit, LIMITS } from '@/core/rate-limit';
import { LeagueView } from '../../../../league-view';
import { loadPreviewLeague } from '../../../../public-league';

// One draft, as the public page would show it. Unlike that page the URL holds a secret, so it is kept out
// of indexes and of the Referer header, as /s/<token> is; force-dynamic means a revoked link is dead on
// the next read. Same per-IP limit and the same one 404 for every miss (D-33).
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Schedule preview', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

export default async function Preview({ params, searchParams }: { params: Promise<{ org: string; season: string; token: string }>; searchParams: Promise<{ team?: string | string[] }> }) {
  const { org, season, token } = await params;
  if (!z.uuid().safeParse(season).success) notFound();
  if (!(await hit(`league:ip:${clientIp(await headers())}`, LIMITS.shareReadPerIp))) return <main><h1>Too many requests</h1><p>Wait a few minutes and try again.</p></main>;
  const league = (await loadPreviewLeague(org, season, token)) ?? notFound();
  return <LeagueView league={league} base={`/l/${org}/${season}/preview/${token}`} pick={(await searchParams).team} preview />;
}
