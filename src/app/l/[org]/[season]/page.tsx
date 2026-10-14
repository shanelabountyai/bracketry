// public: a league's published schedule, standings and bracket are for coaches and players, who have no account (D-16, PUB-01)
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { clientIp } from '@/core/http';
import { hit, LIMITS } from '@/core/rate-limit';
import { LeagueView } from '../../league-view';
import { loadPublicLeague } from '../../public-league';

// Anonymous and read-only (spec §7c, D-33): force-dynamic so a new version or score shows on the next
// read, rate-limited per IP like a share read (INV-09), and everything rendered comes from the projection.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'League schedule' };

export default async function League({ params, searchParams }: { params: Promise<{ org: string; season: string }>; searchParams: Promise<{ team?: string | string[] }> }) {
  const { org, season } = await params;
  if (!z.uuid().safeParse(season).success) notFound();
  if (!(await hit(`league:ip:${clientIp(await headers())}`, LIMITS.shareReadPerIp))) return <main><h1>Too many requests</h1><p>Wait a few minutes and try again.</p></main>;
  const league = (await loadPublicLeague(org, season)) ?? notFound();

  return <LeagueView league={league} base={`/l/${org}/${season}`} pick={(await searchParams).team} />;
}
