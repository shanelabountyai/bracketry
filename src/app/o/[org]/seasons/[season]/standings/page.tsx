import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireOrg } from '@/core/authz/guards';
import { can } from '@/core/authz/permissions';
import { ActionForm } from '@/core/ui/action-form';
import type { Metric, TiebreakStep } from '@/lib/league/types';
import { recordTie, saveChain } from '../../standings-actions';
import { loadStandings } from '../../standings-load';

export const metadata = { title: 'Standings' };
const METRIC: Record<Metric, string> = { h2hPoints: 'Head-to-head points', runDiff: 'Run differential', runsAllowed: 'Fewest runs allowed', runsScored: 'Runs scored', wins: 'Wins' };
const stepLabel = (s: TiebreakStep) => `${METRIC[s.metric]}, ${s.scope === 'tied' ? 'among the tied teams' : 'over all games'}`;

export default async function Standings({ params }: { params: Promise<{ org: string; season: string }> }) {
  const ctx = await requireOrg((await params).org);
  const id = (await params).season;
  if (!z.uuid().safeParse(id).success) notFound();
  const s = (await loadStandings(ctx, id)) ?? notFound();
  const edit = can(ctx.role, 'org.update');
  const bind = <A extends unknown[], R>(fn: (slug: string, ...a: A) => R) => fn.bind(null, ctx.slug);
  const sid = <input type="hidden" name="seasonId" value={s.season.id} />;

  return (
    <main>
      <h1>{s.season.name}: standings</h1>
      <p><Link href={`/o/${ctx.slug}/seasons/${s.season.id}`}>Season setup</Link> · Computed from the latest score of every game; nothing here is stored.</p>

      {s.byDivision.map(({ division, rows }) => {
        const open = [...new Set(rows.filter((r) => r.needsManualResolution).map((r) => r.rank))].map((rank) => rows.filter((r) => r.rank === rank));
        return (
          <section key={division.id}>
            <h2>{division.name}</h2>
            <table>
              <thead><tr><th>Rank</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>T</th><th>Pts</th><th>RF</th><th>RA</th><th>Diff</th><th>Why</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.team}>
                    <td>{r.rank}</td><td>{r.name}</td><td>{r.played}</td><td>{r.wins}</td><td>{r.losses}</td><td>{r.ties}</td><td>{r.points}</td><td>{r.runsFor}</td><td>{r.runsAgainst}</td><td>{r.runDiff}</td>
                    <td>{r.note}{r.needsManualResolution && <strong> · needs commissioner decision</strong>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {open.map((group) => (
              <div key={group[0]!.rank}>
                <p role="status">{group.map((r) => r.name).join(', ')} are tied and no tiebreaker separates them. The system does not pick.</p>
                {edit && (
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
