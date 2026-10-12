import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireOrg } from '@/core/authz/guards';
import { can } from '@/core/authz/permissions';
import { ActionForm } from '@/core/ui/action-form';
import { ENUMERATION_LIMIT } from '@/lib/league/standings';
import type { Metric, TiebreakStep } from '@/lib/league/types';
import { recordTie, saveChain } from '../../standings-actions';
import { loadStandings, type WhatIf } from '../../standings-load';

export const metadata = { title: 'Standings' };
const METRIC: Record<Metric, string> = { h2hPoints: 'Head-to-head points', runDiff: 'Run differential', runsAllowed: 'Fewest runs allowed', runsScored: 'Runs scored', wins: 'Wins' };
const stepLabel = (s: TiebreakStep) => `${METRIC[s.metric]}, ${s.scope === 'tied' ? 'among the tied teams' : 'over all games'}`;

const runs = z.coerce.number().int().min(0).max(99);
const one = (v: string | string[] | undefined) => (typeof v === 'string' && v !== '' ? v : undefined);

export default async function Standings({ params, searchParams }: { params: Promise<{ org: string; season: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrg((await params).org);
  const id = (await params).season;
  if (!z.uuid().safeParse(id).success) notFound();
  // What-if is a GET form (WHATIF-01): `h_<game id>` and `a_<game id>` are a hypothetical score, `n` is the cut line (D-38).
  const query = await searchParams;
  const whatIf: WhatIf = {};
  for (const key of Object.keys(query)) {
    if (!key.startsWith('h_')) continue;
    const homeRuns = runs.safeParse(one(query[key]));
    const awayRuns = runs.safeParse(one(query[`a_${key.slice(2)}`]));
    if (homeRuns.success && awayRuns.success) whatIf[key.slice(2)] = { homeRuns: homeRuns.data, awayRuns: awayRuns.data };
  }
  const s = (await loadStandings(ctx, id, whatIf)) ?? notFound();
  const cut = z.coerce.number().int().min(1).max(16).catch(4).parse(one(query.n) ?? 4);
  const supposed = s.byDivision.reduce((n, d) => n + d.supposed, 0);
  const here = `/o/${ctx.slug}/seasons/${s.season.id}/standings`;
  const edit = can(ctx.role, 'org.update');
  const bind = <A extends unknown[], R>(fn: (slug: string, ...a: A) => R) => fn.bind(null, ctx.slug);
  const sid = <input type="hidden" name="seasonId" value={s.season.id} />;

  return (
    <main>
      <h1>{s.season.name}: standings</h1>
      <p><Link href={`/o/${ctx.slug}/seasons/${s.season.id}`}>Season setup</Link> · Computed from the latest score of every game; nothing here is stored.</p>
      {supposed > 0 && <p role="status"><strong>What-if table.</strong> {supposed} of the scores below {supposed === 1 ? 'is' : 'are'} hypothetical and not recorded. <Link href={here}>Back to the real standings</Link></p>}

      {s.byDivision.map(({ division, rows, range }) => {
        const open = [...new Set(rows.filter((r) => r.needsManualResolution).map((r) => r.rank))].map((rank) => rows.filter((r) => r.rank === rank));
        return (
          <section key={division.id}>
            <h2>{division.name}</h2>
            <table>
              <thead><tr><th>Rank</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>T</th><th>Pts</th><th>RF</th><th>RA</th><th>Diff</th><th>Why</th><th>Top {cut}</th></tr></thead>
              <tbody>
                {rows.map((r) => { const span = range?.find((x) => x.team === r.team); return (
                  <tr key={r.team}>
                    <td>{r.rank}</td><td>{r.name}</td><td>{r.played}</td><td>{r.wins}</td><td>{r.losses}</td><td>{r.ties}</td><td>{r.points}</td><td>{r.runsFor}</td><td>{r.runsAgainst}</td><td>{r.runDiff}</td>
                    <td>{r.note}{r.needsManualResolution && <strong> · needs commissioner decision</strong>}</td>
                    <td>{span && (span.worstRank <= cut ? 'Clinched' : span.bestRank > cut ? 'Eliminated' : '')}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
            {open.map((group) => (
              <div key={group[0]!.rank}>
                <p role="status">{group.map((r) => r.name).join(', ')} are tied and no tiebreaker separates them. The system does not pick.</p>
                {edit && supposed === 0 && (
                  <ActionForm action={bind(recordTie)}>
                    {sid}
                    <input type="hidden" name="divisionId" value={division.id} />
                    {group.map((r) => <label key={r.team}>{r.name} finishes <input name={`pos_${r.team}`} type="number" min={1} max={group.length} required /></label>)}
                    <label>Method <select name="method"><option>coin flip</option><option>drawn lots</option></select></label>
                    <button type="submit">Record decision</button>
                  </ActionForm>
                )}
              </div>
            ))}
          </section>
        );
      })}

      <h2>What if</h2>
      <p>Clinched and eliminated are worked out on points alone, by trying every win, tie and loss of the games left in a division. Tiebreakers are not applied, so a team that would get in only on a tiebreaker is not marked. They are shown only when {ENUMERATION_LIMIT} or fewer games are left in the division.</p>
      <form method="get">
        <label>Teams that qualify <input name="n" type="number" min={1} max={16} defaultValue={cut} /></label>
        {s.byDivision.map(({ division, open, range, name }) => (
          <fieldset key={division.id}>
            <legend>{division.name}: {open.length} {open.length === 1 ? 'game' : 'games'} without a score{range ? '' : `, so no clinched or eliminated marks (more than ${ENUMERATION_LIMIT} left)`}</legend>
            {open.map((g) => (
              <p key={g.id}>
                <label>{name(g.home)} <input name={`h_${g.id}`} type="number" min={0} max={99} defaultValue={g.supposed?.homeRuns} /></label>
                {' '}<label>{name(g.away)} <input name={`a_${g.id}`} type="number" min={0} max={99} defaultValue={g.supposed?.awayRuns} /></label>
              </p>
            ))}
          </fieldset>
        ))}
        <button type="submit">Show what-if table</button> <Link href={here}>Clear</Link>
      </form>

      <h2>Tiebreakers</h2>
      <p>Applied in order when teams are level on points. {s.hasResults ? 'Games have been scored, so a change needs a reason and is logged.' : 'No games are scored yet, so this can change freely.'}</p>
      {edit ? (
        <ActionForm action={bind(saveChain)}>
          {sid}
          {s.config.chain.map((step, i) => (
            <label key={step.id}>{stepLabel(step)} <input name={`pos_${step.id}`} type="number" min={1} max={s.config.chain.length} defaultValue={i + 1} required /></label>
          ))}
          <label>After a step splits a group, a still-tied subgroup
            <select name="onPartialBreak" defaultValue={s.config.onPartialBreak}><option value="restart">restarts the chain</option><option value="continue">continues to the next step</option></select>
          </label>
          {s.hasResults && <label>Reason <input name="reason" required maxLength={500} /></label>}
          <button type="submit">Save tiebreakers</button>
        </ActionForm>
      ) : (
        <ol>{s.config.chain.map((step) => <li key={step.id}>{stepLabel(step)}</li>)}</ol>
      )}
    </main>
  );
}
