import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireOrg } from '@/core/authz/guards';
import { can } from '@/core/authz/permissions';
import { ActionForm } from '@/core/ui/action-form';
import { champion } from '@/lib/league/bracket';
import type { BracketSlot } from '@/lib/league/types';
import { clearBracketResult, generateBracket, placeBracketGames, recordBracketResult } from '../../bracket-actions';
import { loadBrackets } from '../../bracket-load';

export const metadata = { title: 'Playoffs' };

export default async function Playoffs({ params }: { params: Promise<{ org: string; season: string }> }) {
  const ctx = await requireOrg((await params).org);
  const id = (await params).season;
  if (!z.uuid().safeParse(id).success) notFound();
  const s = (await loadBrackets(ctx, id)) ?? notFound();
  const edit = can(ctx.role, 'org.update');
  const score = can(ctx.role, 'results.write'); // L-040
  const bind = <A extends unknown[], R>(fn: (slug: string, ...a: A) => R) => fn.bind(null, ctx.slug);
  const base = `/o/${ctx.slug}/seasons/${s.season.id}`;

  return (
    <main>
      <h1>{s.season.name}: playoffs</h1>
      <p><Link href={base}>Season setup</Link> · <Link href={`${base}/standings`}>Standings</Link> · Single elimination. The better seed is the home team.</p>

      {s.byDivision.map(({ division, rows, name, unscored, bracket: b }) => {
        const generate = (label: string) => (
          <ActionForm action={bind(generateBracket)}>
            <input type="hidden" name="seasonId" value={s.season.id} />
            <input type="hidden" name="divisionId" value={division.id} />
            <label>Teams that qualify <input name="n" type="number" min={2} max={Math.min(16, rows.length)} defaultValue={b ? b.seeds.length : Math.min(4, rows.length)} required /></label>
            <button type="submit">{label}</button>
          </ActionForm>
        );
        const show = (x: BracketSlot) => (x.kind === 'team' ? `(${x.seed}) ${name(x.team)}` : x.kind === 'bye' ? 'bye' : `winner of ${x.matchId}`);
        const won = b && champion(b.bracket);
        return (
          <section key={division.id}>
            <h2>{division.name}</h2>
            {unscored > 0 && !b?.started && <p role="status">{unscored} scheduled games in this division have no score. A bracket is seeded from the standings as they are now.</p>}
            {!b && (rows.length < 2 ? <p>Add at least two teams first.</p> : edit ? generate('Generate bracket') : <p>No bracket yet.</p>)}
            {b && (
              <>
                {b.stale && (
                  <p role="alert">
                    The standings have changed since this bracket was seeded. {b.reseeds ? 'Regenerating would change the seeding.' : 'The qualifying teams and their order are the same.'}{' '}
                    {b.started ? 'A playoff game has a result, so the bracket stays as it is.' : 'The bracket has not been reseeded; regenerate it if it should be.'}
                  </p>
                )}
                {edit && !b.started && generate('Regenerate bracket')}
                {edit && <ActionForm action={bind(placeBracketGames)}><input type="hidden" name="bracketId" value={b.row.id} /><button type="submit">Place games into slots</button></ActionForm>}
                {b.bracket.rounds.map((round, r) => (
                  <div key={r}>
                    <h3>{r === b.bracket.rounds.length - 1 ? 'Final' : `Round ${r + 1}`}</h3>
                    <ul>
                      {round.map((m) => {
                        const g = b.row.games.find((x) => x.matchId === m.id)!;
                        const slot = g.fieldSlot;
                        const ready = m.a.kind === 'team' && m.b.kind === 'team';
                        return (
                          <li key={m.id}>
                            {m.id}: {show(m.a)} v {show(m.b)}
                            {ready && <> · {slot ? `${slot.day} ${slot.start} · ${slot.field.name}${slot.status === 'closed' && !m.result ? ' (slot closed: place it again)' : ''}` : 'no slot yet'}</>}
                            {m.result && <> · {m.result.forfeit ? `forfeit by ${show(m[m.result.forfeit])}` : `${m.result.aRuns}-${m.result.bRuns}`}</>}
                            {m.winner && <> · <strong>{name(m.winner)} {m.result ? 'won' : 'advances on a bye'}</strong></>}
                            {score && ready && slot && (
                              <ActionForm action={bind(recordBracketResult)}>
                                <input type="hidden" name="gameId" value={g.id} />
                                <label>{name(g.aTeamId!)} <input name="aRuns" type="number" min={0} max={99} defaultValue={m.result?.aRuns} /></label>
                                <label>{name(g.bTeamId!)} <input name="bRuns" type="number" min={0} max={99} defaultValue={m.result?.bRuns} /></label>
                                <label>Forfeit <select name="forfeit" defaultValue={m.result?.forfeit ?? ''}><option value="">none</option><option value="a">by {name(g.aTeamId!)}</option><option value="b">by {name(g.bTeamId!)}</option></select></label>
                                {m.result && <label>Reason for the correction <input name="reason" required maxLength={500} /></label>}
                                <button type="submit">{m.result ? 'Correct score' : 'Save score'}</button>
                              </ActionForm>
                            )}
                            {score && m.result && <ActionForm action={bind(clearBracketResult)}><input type="hidden" name="gameId" value={g.id} /><button type="submit">Clear result</button></ActionForm>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                {won && <p><strong>Champion: {name(won)}</strong></p>}
              </>
            )}
          </section>
        );
      })}
    </main>
  );
}
