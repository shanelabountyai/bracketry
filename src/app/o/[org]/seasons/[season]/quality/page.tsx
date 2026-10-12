import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireOrg } from '@/core/authz/guards';
import { loadQuality } from '../../quality-load';

export const metadata = { title: 'Schedule quality' };

export default async function Quality({ params, searchParams }: { params: Promise<{ org: string; season: string }>; searchParams: Promise<{ v?: string }> }) {
  const ctx = await requireOrg((await params).org);
  const id = (await params).season;
  if (!z.uuid().safeParse(id).success) notFound();
  const v = z.coerce.number().int().positive().safeParse((await searchParams).v);
  const q = await loadQuality(ctx, id, v.success ? v.data : undefined);
  const back = <Link href={`/o/${ctx.slug}/seasons/${q.season.id}`}>Season setup</Link>;
  if (!q.version) return <main><h1>{q.season.name}: schedule quality</h1><p>{back} · No such version. Generate a schedule first.</p></main>;
  const { quality, stored, name } = q;
  const { report, floor, starts, fields } = quality;
  const divisions = [...new Set(quality.teams.map((t) => t.division))];
  const days = (n: number | null) => (n === null ? '–' : n);

  return (
    <main>
      <h1>{q.season.name}: schedule quality, version {q.version.number} ({q.version.status})</h1>
      <p>{back} · Counted from the placements of this version; violations and cost come from the same scoring function the generator uses.</p>
      <form method="get">
        <label>Version <select name="v" defaultValue={q.version.number}>{q.versions.map((x) => <option key={x.id} value={x.number}>Version {x.number} ({x.status})</option>)}</select></label>
        <button type="submit">Show</button>
      </form>

      <h2>Score</h2>
      <p>{report.hardCount} hard violations, {report.unplaced.length} games unplaced, soft cost {report.softCost}.</p>
      {(stored.softCost !== report.softCost || stored.hardCount !== report.hardCount) && (
        <p role="status">When this version was made it scored {stored.hardCount} hard, soft cost {stored.softCost}. The teams, slots, blackouts or rules of the season have changed since; this page counts against the season as it is now.</p>
      )}
      {floor.cost > 0 ? (
        <>
          <p>
            Floor by counting: no full legal schedule on this calendar can score below <strong>{floor.cost}</strong> ({floor.units} rest violations × weight {floor.cost / floor.units}). This version is at {report.softCost}
            {report.unplaced.length > 0 ? ', with games unplaced, so the two are not comparable yet.' : `, ${report.softCost - floor.cost} above the floor.`} The floor counts the rest rule only and takes every other rule as 0, so the true minimum may be higher; this is a heuristic and makes no claim to have reached it.
          </p>
          <ul>{floor.perTeam.map((t) => <li key={t.team}>{name(t.team)}: {t.games} games, {t.runs} separate stretches of open days, so at least {t.units} short {t.units === 1 ? 'rest' : 'rests'}.</li>)}</ul>
        </>
      ) : (
        <p>No floor above 0 can be shown by counting for this calendar and these rules. That is not a claim that 0 is reachable.</p>
      )}

      {divisions.map((d) => (
        <section key={d}>
          <h2>{name(d)}</h2>
          <table>
            <thead>
              <tr>
                <th>Team</th><th>Games</th><th>Home</th><th>Away</th>
                {starts.map((s) => <th key={s}>{s}</th>)}
                {fields.map((f) => <th key={f}>{name(f)}</th>)}
                <th>Shortest rest (days)</th><th>Longest rest (days)</th><th>Bye weeks</th><th>Soft violations</th>
              </tr>
            </thead>
            <tbody>
              {quality.teams.filter((t) => t.division === d).map((t) => (
                <tr key={t.team}>
                  <th scope="row">{name(t.team)}</th><td>{t.games}</td><td>{t.home}</td><td>{t.away}</td>
                  {starts.map((s) => <td key={s}>{t.byStart[s]}</td>)}
                  {fields.map((f) => <td key={f}>{t.byField[f]}</td>)}
                  <td>{days(t.shortestRest)}</td><td>{days(t.longestRest)}</td><td>{t.byes}</td><td>{t.flags}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <p>A bye week is a Monday-to-Sunday week that has a slot and in which the team has no game. An equity violation names two teams and is counted for both.</p>
    </main>
  );
}
