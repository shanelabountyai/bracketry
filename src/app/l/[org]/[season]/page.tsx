// public: a league's published schedule, standings and bracket are for coaches and players, who have no account (D-16, PUB-01)
import { Fragment } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { now } from '@/core/clock';
import { clientIp } from '@/core/http';
import { hit, LIMITS } from '@/core/rate-limit';
import { shortDay } from '@/lib/league/days';
import { dayIn, timeIn } from '@/app/o/[org]/seasons/rainout-load';
import { loadPublicLeague, type PublicGame } from '../../public-league';

// Anonymous and read-only (spec §7c, D-33): force-dynamic so a new version or score shows on the next
// read, rate-limited per IP like a share read (INV-09), and everything rendered comes from the projection.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'League schedule' };

export default async function League({ params, searchParams }: { params: Promise<{ org: string; season: string }>; searchParams: Promise<{ team?: string | string[] }> }) {
  const { org, season } = await params;
  if (!z.uuid().safeParse(season).success) notFound();
  if (!(await hit(`league:ip:${clientIp(await headers())}`, LIMITS.shareReadPerIp))) return <main><h1>Too many requests</h1><p>Wait a few minutes and try again.</p></main>;
  const league = (await loadPublicLeague(org, season)) ?? notFound();

  const base = `/l/${org}/${season}`;
  const pick = (await searchParams).team;
  const team = typeof pick === 'string' && league.divisions.some((d) => d.standings.some((r) => r.team === pick)) ? pick : null;
  const games = team ? league.games.filter((g) => g.home === team || g.away === team) : league.games;
  const days = [...new Set(games.map((g) => g.day))];
  // PUB-04: the first of the team's games on or after today, in league time, that has no score.
  const today = dayIn(league.timezone, now());
  const next = games.find((g) => g.day >= today && g.homeRuns === null);
  const moved = games.filter((g) => g.movedFrom);
  const updated = timeIn(league.timezone, league.publishedAt);
  const score = (g: PublicGame) => (g.forfeit ? `forfeit by ${g[g.forfeit]}` : g.homeRuns !== null ? `${g.homeRuns}-${g.awayRuns}` : null);

  return (
    <main>
      <h1>{league.season}</h1>
      <p><a href="#schedule">Schedule</a> · <a href="#standings">Standings</a> · <a href="#fairness">Games by time and field</a> · <a href="#playoffs">Playoffs</a></p>
      <p>Schedule updated {shortDay(updated.slice(0, 10))} {updated.slice(11)}.</p>
      {moved.length > 0 && (
        <section aria-label="Changes this week">
          <h2>Changes this week</h2>
          <ul>
            {moved.map((g) => (
              <li key={g.uid}>{g.home} v {g.away}: now {shortDay(g.day)} {g.start} · {g.field}, was {g.movedFrom}</li>
            ))}
          </ul>
        </section>
      )}

      <section id="schedule">
        <h2>{team ? `Schedule: ${team}` : 'Schedule'}</h2>
        <nav aria-label="Schedule by team">
          {team ? <a href={base}>All teams</a> : <strong>All teams</strong>}
          {league.divisions.flatMap((d) => d.standings.map((r) => r.team)).sort().map((t) => (
            <span key={t}> · {t === team ? <strong>{t}</strong> : <a href={`${base}?team=${encodeURIComponent(t)}`}>{t}</a>}</span>
          ))}
        </nav>
        {team && <p><a href={`${base}/calendar.ics?team=${encodeURIComponent(team)}`}>Calendar feed for {team} (.ics)</a></p>}
        {team && <p><strong>Next game:</strong> {next ? `${shortDay(next.day)} · ${next.start} · ${next.field} · ${next.home} v ${next.away}` : 'none left on the schedule.'}</p>}
        {days.length === 0 && <p>No games.</p>}
        {days.map((day) => (
          <div key={day}>
            <h3>{shortDay(day)}</h3>
            <ul>
              {games.filter((g) => g.day === day).map((g) => (
                <li key={`${g.start} ${g.field}`}>
                  {g.start} · {g.field} · {g.home} v {g.away} ({g.division})
                  {score(g) && <> · <strong>{score(g)}</strong></>}
                  {g.movedFrom && <> · <em>moved from {g.movedFrom}</em></>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section id="standings">
        <h2>Standings</h2>
        {league.divisions.map((d) => (
          <table key={d.name}>
            <caption>{d.name}</caption>
            <thead>
              <tr><th scope="col">#</th><th scope="col">Team</th><th scope="col">GP</th><th scope="col">W</th><th scope="col">L</th><th scope="col">T</th><th scope="col">Pts</th><th scope="col">RF</th><th scope="col">RA</th><th scope="col">RD</th></tr>
            </thead>
            <tbody>
              {d.standings.map((r, i) => (
                <Fragment key={r.team}>
                  <tr>
                    <td>{r.rank}</td>
                    <th scope="row" style={{ textAlign: 'left' }}>{r.team}<br /><small style={{ fontWeight: 'normal' }}>{r.note}{r.needsDecision && ' (tied: awaiting the commissioner’s decision)'}</small></th>
                    <td>{r.played}</td><td>{r.wins}</td><td>{r.losses}</td><td>{r.ties}</td><td>{r.points}</td><td>{r.runsFor}</td><td>{r.runsAgainst}</td><td>{r.runDiff}</td>
                  </tr>
                  {i + 1 === d.cut && i + 1 < d.standings.length && <tr><td colSpan={10}><em>Playoff line: top {d.cut}</em></td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table>
        ))}
      </section>

      <section id="fairness">
        <h2>Games by time and field</h2>
        <p>How many games each team has at each start time and on each field in the published schedule. Regular-season games only.</p>
        {league.divisions.map((d) => (
          <div key={d.name} style={{ overflowX: 'auto' }}>
            <table>
              <caption>{d.name}</caption>
              <thead>
                <tr><th scope="col">Team</th><th scope="col">Games</th>{league.starts.map((x) => <th key={x} scope="col">{x}</th>)}{league.fields.map((x) => <th key={x} scope="col">{x}</th>)}</tr>
              </thead>
              <tbody>
                {d.fairness.map((r) => (
                  <tr key={r.team}>
                    <th scope="row" style={{ textAlign: 'left' }}>{r.team}</th><td>{r.games}</td>
                    {r.byStart.map((n, i) => <td key={`s${i}`}>{n}</td>)}
                    {r.byField.map((n, i) => <td key={`f${i}`}>{n}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section id="playoffs">
        <h2>Playoffs</h2>
        {league.divisions.map((d) => (
          <div key={d.name}>
            <h3>{d.name}</h3>
            {!d.bracket && <p>No bracket yet.</p>}
            {d.bracket && (
              <ul>
                {d.bracket.map((m) => (
                  <li key={m.id}>
                    {m.label}: {m.a} v {m.b}
                    {m.slot && <> · {m.slot}</>}
                    {m.aRuns !== null && <> · {m.forfeit ? `forfeit by ${m[m.forfeit]}` : `${m.aRuns}-${m.bRuns}`}</>}
                    {m.winner && <> · <strong>{m.winner} {m.aRuns !== null ? 'won' : 'advances on a bye'}</strong></>}
                  </li>
                ))}
              </ul>
            )}
            {d.champion && <p><strong>Champion: {d.champion}</strong></p>}
          </div>
        ))}
      </section>
    </main>
  );
}
