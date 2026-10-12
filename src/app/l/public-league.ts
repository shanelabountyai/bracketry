import { createHash } from 'node:crypto';
import { now } from '@/core/clock';
import { db } from '@/core/db';
import { champion } from '@/lib/league/bracket';
import type { BracketMatch, BracketSlot, StandingsRow } from '@/lib/league/types';
import { loadBrackets } from '@/app/o/[org]/seasons/bracket-load';

// The public league page's data (PUB-01..03, D-33). Built the way the template's share contract asks
// (spec §7c): each projection starts from an empty default and opts fields in by name, so a column added
// later stays private until someone adds it here. Names only: no ids, no contact details, no audit data.

export interface PublicGame {
  /** A hash of the game's id: the same game keeps it across versions, so a calendar moves the event (ICAL-01). */
  uid: string;
  day: string;
  start: string;
  field: string;
  division: string;
  home: string;
  away: string;
  homeRuns: number | null;
  awayRuns: number | null;
  forfeit: 'home' | 'away' | null;
  /** The slot this game held in the version before, while the mark is shown (PUB-02). */
  movedFrom: string | null;
}
export const blankPublicGame = (): PublicGame => ({ uid: '', day: '', start: '', field: '', division: '', home: '', away: '', homeRuns: null, awayRuns: null, forfeit: null, movedFrom: null });

interface SlotRow { day: string; start: string; field: { name: string } }
interface PlacementRow {
  gameId: string;
  fieldSlot: SlotRow;
  game: { division: { name: string }; homeTeam: { name: string }; awayTeam: { name: string }; results: { homeRuns: number; awayRuns: number; forfeit: 'home' | 'away' | null }[] };
}
const slotLabel = (s: SlotRow) => `${s.day} ${s.start} · ${s.field.name}`;

/** `was` is the game's slot in the version before, or null when it did not move or the mark has expired. */
export function toPublicGame(p: PlacementRow, was: SlotRow | null): PublicGame {
  const r = p.game.results[0];
  return {
    ...blankPublicGame(),
    uid: createHash('sha256').update(p.gameId).digest('hex').slice(0, 32),
    day: p.fieldSlot.day,
    start: p.fieldSlot.start,
    field: p.fieldSlot.field.name,
    division: p.game.division.name,
    home: p.game.homeTeam.name,
    away: p.game.awayTeam.name,
    homeRuns: r?.homeRuns ?? null,
    awayRuns: r?.awayRuns ?? null,
    forfeit: r?.forfeit ?? null,
    movedFrom: was && slotLabel(was),
  };
}

export interface PublicStanding {
  rank: number;
  team: string;
  played: number;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  runsFor: number;
  runsAgainst: number;
  runDiff: number;
  note: string;
  needsDecision: boolean;
}
export const blankPublicStanding = (): PublicStanding => ({ rank: 0, team: '', played: 0, wins: 0, losses: 0, ties: 0, points: 0, runsFor: 0, runsAgainst: 0, runDiff: 0, note: '', needsDecision: false });

/** `name` and `note` come from `loadStandings`, which has already swapped team ids for names (D-22). */
export function toPublicStanding(r: StandingsRow & { name: string }): PublicStanding {
  return { ...blankPublicStanding(), rank: r.rank, team: r.name, played: r.played, wins: r.wins, losses: r.losses, ties: r.ties, points: r.points, runsFor: r.runsFor, runsAgainst: r.runsAgainst, runDiff: r.runDiff, note: r.note, needsDecision: r.needsManualResolution };
}

export interface PublicMatch {
  id: string;
  round: number;
  a: string;
  b: string;
  slot: string | null;
  aRuns: number | null;
  bRuns: number | null;
  forfeit: 'a' | 'b' | null;
  winner: string | null;
}
export const blankPublicMatch = (): PublicMatch => ({ id: '', round: 0, a: '', b: '', slot: null, aRuns: null, bRuns: null, forfeit: null, winner: null });

export function toPublicMatch(m: BracketMatch, slot: SlotRow | null, name: (teamId: string) => string): PublicMatch {
  const show = (x: BracketSlot) => (x.kind === 'team' ? `(${x.seed}) ${name(x.team)}` : x.kind === 'bye' ? 'bye' : `winner of ${x.matchId}`);
  return { ...blankPublicMatch(), id: m.id, round: m.round, a: show(m.a), b: show(m.b), slot: slot && slotLabel(slot), aRuns: m.result?.aRuns ?? null, bRuns: m.result?.bRuns ?? null, forfeit: m.result?.forfeit ?? null, winner: m.winner ? name(m.winner) : null };
}

export interface PublicLeague {
  season: string;
  /** IANA name; every day and start time below is a wall time in it (D-6). */
  timezone: string;
  gameMinutes: number;
  publishedAt: Date;
  /** Regular-season games of the published version, in day, time and field order. */
  games: PublicGame[];
  divisions: { name: string; standings: PublicStanding[]; bracket: PublicMatch[] | null; champion: string | null }[];
}

/** PUB-02: how long a moved game keeps its mark, counted from the moment the version was published. */
export const MOVED_MARK_MS = 7 * 86_400_000;

/**
 * Anonymous read. A season is public once it has a published version (D-33); until then, and for an
 * unknown org or season, this is null and the page is one 404. Drafts are never read: the only versions
 * touched are the published one and, for the "moved from" mark, the one it replaced.
 */
export async function loadPublicLeague(orgSlug: string, seasonId: string): Promise<PublicLeague | null> {
  const version = await db.scheduleVersion.findFirst({ where: { seasonId, status: 'published', org: { slug: orgSlug } }, select: { id: true, orgId: true, publishedAt: true } });
  if (!version) return null;
  const org = { orgId: version.orgId };
  const marked = version.publishedAt !== null && now().getTime() - version.publishedAt.getTime() < MOVED_MARK_MS;
  const prev = marked
    ? await db.scheduleVersion.findFirst({ where: { seasonId, status: 'superseded', publishedAt: { not: null }, ...org }, orderBy: { publishedAt: 'desc' }, select: { id: true } })
    : null;
  const slot = { select: { day: true, start: true, field: { select: { name: true } } } };
  const named = { select: { name: true } };
  const [rows, s] = await Promise.all([
    db.placement.findMany({
      where: { scheduleVersionId: { in: [version.id, ...(prev ? [prev.id] : [])] }, ...org },
      select: {
        scheduleVersionId: true,
        gameId: true,
        fieldSlotId: true,
        fieldSlot: slot,
        game: { select: { division: named, homeTeam: named, awayTeam: named, results: { where: { supersededBy: { none: {} } }, select: { homeRuns: true, awayRuns: true, forfeit: true } } } },
      },
    }),
    loadBrackets(org, seasonId),
  ]);
  if (!s) return null;
  const was = new Map(rows.filter((p) => p.scheduleVersionId === prev?.id).map((p) => [p.gameId, p]));
  const order = (g: PublicGame) => `${g.day} ${g.start} ${g.field}`;
  const games = rows
    .filter((p) => p.scheduleVersionId === version.id)
    .map((p) => {
      const old = was.get(p.gameId);
      return toPublicGame(p, old && old.fieldSlotId !== p.fieldSlotId ? old.fieldSlot : null);
    })
    .sort((a, b) => (order(a) < order(b) ? -1 : 1));
  return {
    season: s.season.name,
    timezone: s.season.timezone,
    gameMinutes: s.season.gameMinutes,
    publishedAt: version.publishedAt ?? now(),
    games,
    divisions: s.byDivision.map(({ division, rows: table, name, bracket: b }) => {
      const won = b ? champion(b.bracket) : null;
      return {
        name: division.name,
        standings: table.map(toPublicStanding),
        bracket: b ? b.bracket.rounds.flat().map((m) => toPublicMatch(m, b.row.games.find((g) => g.matchId === m.id)?.fieldSlot ?? null, name)) : null,
        champion: won ? name(won) : null,
      };
    }),
  };
}

const icsText = (v: string) => v.replace(/[\\;,]/g, '\\$&').replace(/\r?\n/g, '\\n');

/**
 * One team's games of the published version as an iCalendar feed (ICAL-01), or null for a name that is
 * not a team of this season. Times are the season's wall times with its TZID, so nothing here converts
 * an instant (D-6). Regular-season games only, like the page's schedule list (D-33).
 */
export function teamCalendar(league: PublicLeague, team: string): string | null {
  if (!league.divisions.some((d) => d.standings.some((r) => r.team === team))) return null;
  const stamp = league.publishedAt.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bracketry//League schedule//EN',
    `X-WR-CALNAME:${icsText(`${team} · ${league.season}`)}`,
    ...league.games.filter((g) => g.home === team || g.away === team).flatMap((g) => [
      'BEGIN:VEVENT',
      `UID:${g.uid}@bracketry`,
      `DTSTAMP:${stamp}`,
      // ponytail: TZID with no VTIMEZONE block; Google, Apple and Outlook resolve IANA names. Add the block if a client shows UTC.
      `DTSTART;TZID=${league.timezone}:${g.day.replaceAll('-', '')}T${g.start.replace(':', '')}00`,
      `DURATION:PT${league.gameMinutes}M`,
      `SUMMARY:${icsText(`${g.home} v ${g.away}`)}`,
      `LOCATION:${icsText(g.field)}`,
      `DESCRIPTION:${icsText(g.division)}`,
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ];
  // ponytail: folds at 73 characters, not 75 octets; a long non-ASCII name can run over. Count bytes if a client rejects one.
  return lines.map((l) => l.replace(/(.{73})(?=.)/gu, '$1\r\n ')).join('\r\n') + '\r\n';
}
