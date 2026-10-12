// public: a team's calendar feed is fetched by calendar apps, which have no session (D-16, ICAL-01)
import { z } from 'zod';
import { clientIp } from '@/core/http';
import { hit, LIMITS } from '@/core/rate-limit';
import { loadPublicLeague, teamCalendar } from '../../../public-league';

// Same rules as the page beside it (D-33): read on every request, per-IP limit, one 404 for every miss.
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ org: string; season: string }> }) {
  const { org, season } = await params;
  const missing = new Response('Not found', { status: 404 });
  if (!z.uuid().safeParse(season).success) return missing;
  if (!(await hit(`league:ip:${clientIp(req.headers)}`, LIMITS.shareReadPerIp))) return new Response('Too many requests', { status: 429 });
  const league = await loadPublicLeague(org, season);
  const ics = league && teamCalendar(league, new URL(req.url).searchParams.get('team') ?? '');
  return ics ? new Response(ics, { headers: { 'content-type': 'text/calendar; charset=utf-8' } }) : missing;
}
