import { notFound } from 'next/navigation';
import { z } from 'zod';
import { inOrg, requireOrg } from '@/core/authz/guards';
import { can } from '@/core/authz/permissions';
import { db } from '@/core/db';
import { ActionForm } from '@/core/ui/action-form';
import { capRefusal } from '@/lib/league/build-input';
import { checkFeasibility } from '@/lib/league/feasibility';
import { compareAssignments } from '@/lib/league/compare';
import { DEFAULT_RULES, isPublishable, type Rules, type ScoreReport } from '@/lib/league/types';
import { generate } from '../generate-actions';
import { loadSeasonInput } from '../load-input';
import { recordResult } from '../result-actions';
import { publish, removePin, setPin } from '../version-actions';
import { addBlackout, addDivision, addField, addHoliday, addSlot, addSlotPattern, addTeam, saveRules, setSlotOpen } from '../actions';

export const metadata = { title: 'Season setup' };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default async function SeasonSetup({ params, searchParams }: { params: Promise<{ org: string; season: string }>; searchParams: Promise<{ a?: string; b?: string }> }) {
  const ctx = await requireOrg((await params).org);
  const id = (await params).season;
  if (!z.uuid().safeParse(id).success) notFound();
  const season = await db.season.findFirst({ where: { id, ...inOrg(ctx) } });
  if (!season) notFound();
  const [divisions, teams, fields, patterns, slots, blackouts] = await Promise.all([
    db.division.findMany({ where: { seasonId: season.id, ...inOrg(ctx) }, orderBy: { name: 'asc' } }),
    db.team.findMany({ where: { seasonId: season.id, ...inOrg(ctx) }, orderBy: { name: 'asc' } }),
    db.field.findMany({ where: inOrg(ctx), orderBy: { name: 'asc' } }),
    db.slotPattern.findMany({ where: { seasonId: season.id, ...inOrg(ctx) }, orderBy: [{ weekday: 'asc' }, { start: 'asc' }] }),
    db.fieldSlot.findMany({ where: { seasonId: season.id, ...inOrg(ctx) }, orderBy: [{ day: 'asc' }, { start: 'asc' }] }),
    db.blackout.findMany({ where: { team: { seasonId: season.id }, ...inOrg(ctx) }, orderBy: [{ day: 'asc' }] }),
  ]);
  const { rows, input } = await loadSeasonInput(ctx, season.id);
  const feas = checkFeasibility(input);
  const capped = capRefusal(rows.divisions, input.games.length);
  const versions = await db.scheduleVersion.findMany({ where: { seasonId: season.id, ...inOrg(ctx) }, orderBy: { number: 'desc' } });
  const latest = versions[0];
  const [games, pins, authors] = await Promise.all([
    db.game.findMany({ where: { seasonId: season.id, ...inOrg(ctx) }, orderBy: [{ divisionId: 'asc' }, { round: 'asc' }, { key: 'asc' }] }),
    db.pin.findMany({ where: { seasonId: season.id, ...inOrg(ctx) } }),
    db.user.findMany({ where: { id: { in: [...new Set(versions.map((v) => v.createdBy))] } }, select: { id: true, name: true, email: true } }),
  ]);
  const published = versions.find((v) => v.status === 'published');
  const [scored, results] = await Promise.all([
    published ? db.placement.findMany({ where: { scheduleVersionId: published.id, ...inOrg(ctx) }, select: { gameId: true, fieldSlotId: true } }) : [],
    db.gameResult.findMany({ where: { game: { seasonId: season.id }, ...inOrg(ctx) }, orderBy: { enteredAt: 'asc' } }),
  ]);
  const resultAuthors = await db.user.findMany({ where: { id: { in: [...new Set(results.map((r) => r.enteredBy))] } }, select: { id: true, name: true, email: true } });
  const sp = await searchParams;
  const [va, vb] = [versions.find((v) => String(v.number) === sp.a), versions.find((v) => String(v.number) === sp.b)];
  const placed = async (versionId: string) => Object.fromEntries((await db.placement.findMany({ where: { scheduleVersionId: versionId, ...inOrg(ctx) }, select: { fieldSlotId: true, game: { select: { key: true } } } })).map((p) => [p.game.key, p.fieldSlotId]));
  const moves = va && vb ? compareAssignments(await placed(va.id), await placed(vb.id)) : null;
  const edit = can(ctx.role, 'org.update');
  const bind = <A extends unknown[], R>(fn: (slug: string, ...a: A) => R) => fn.bind(null, ctx.slug);
  const fieldName = (id: string) => fields.find((f) => f.id === id)?.name ?? '?';
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? '?';
  const slotLabel = (id: string | null) => { const x = slots.find((s) => s.id === id); return x ? `${x.day} ${x.start} · ${fieldName(x.fieldId)}` : 'not placed'; };
  const gameLabel = (key: string) => { const g = games.find((x) => x.key === key); return g ? `${teamName(g.homeTeamId)} v ${teamName(g.awayTeamId)}` : key; };
  const author = (id: string) => { const u = [...authors, ...resultAuthors].find((x) => x.id === id); return u?.name ?? u?.email ?? 'a former member'; };
  const rules = { ...DEFAULT_RULES, ...(season.rules as Partial<Rules>) };
  const sid = <input type="hidden" name="seasonId" value={season.id} />;

  return (
    <main>
      <h1>{season.name}</h1>
      <p>{season.firstDay} to {season.lastDay} · {season.timezone} · {season.gameMinutes}-minute games · {season.status}</p>

      <h2>Divisions and teams</h2>
      {divisions.map((d) => (
        <section key={d.id}>
          <h3>{d.name} ({d.legs === 2 ? 'double' : 'single'} round robin)</h3>
          <ul>{teams.filter((t) => t.divisionId === d.id).map((t) => <li key={t.id}>{t.name}</li>)}</ul>
          {edit && (
            <ActionForm action={bind(addTeam)}>
              <input type="hidden" name="divisionId" value={d.id} />
              <label>Team <input name="name" required maxLength={120} /></label>
              <label>Contact email (internal) <input name="contactEmail" type="email" /></label>
              <button type="submit">Add team</button>
            </ActionForm>
          )}
        </section>
      ))}
      {edit && (
        <ActionForm action={bind(addDivision)}>
          {sid}
          <label>Division <input name="name" required maxLength={120} /></label>
          <select name="legs" defaultValue="1" aria-label="Round robin"><option value="1">Single round robin</option><option value="2">Double round robin</option></select>
          <button type="submit">Add division</button>
        </ActionForm>
      )}

      <h2>Fields</h2>
      <ul>{fields.map((f) => <li key={f.id}>{f.name}</li>)}</ul>
      {edit && (
        <ActionForm action={bind(addField)}>
          {sid}
          <label>Field <input name="name" required maxLength={120} /></label>
          <button type="submit">Add field</button>
        </ActionForm>
      )}

      <h2>Weekly slots</h2>
      <ul>{patterns.map((x) => <li key={x.id}>{WEEKDAYS[x.weekday]} {x.start} · {fieldName(x.fieldId)}</li>)}</ul>
      {edit && fields.length > 0 && (
        <ActionForm action={bind(addSlotPattern)}>
          {sid}
          <select name="fieldId" aria-label="Field">{fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
          <select name="weekday" aria-label="Weekday">{WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}</select>
          <label>Start <input name="start" type="time" required /></label>
          <button type="submit">Add weekly slot</button>
        </ActionForm>
      )}

      <h2>Slots ({slots.length})</h2>
      {edit && fields.length > 0 && (
        <ActionForm action={bind(addSlot)}>
          {sid}
          <select name="fieldId" aria-label="Field">{fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
          <label>Day <input name="day" type="date" required /></label>
          <label>Start <input name="start" type="time" required /></label>
          <button type="submit">Add one slot</button>
        </ActionForm>
      )}
      <ul>
        {slots.map((s) => (
          <li key={s.id}>
            {s.day} {s.start} · {fieldName(s.fieldId)} · {s.status}
            {edit && s.status !== 'makeup' && (
              <ActionForm action={bind(setSlotOpen)}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="open" value={String(s.status === 'closed')} />
                <button type="submit">{s.status === 'closed' ? 'Reopen' : 'Close'}</button>
              </ActionForm>
            )}
          </li>
        ))}
      </ul>

      <h2>Blackouts</h2>
      <ul>{blackouts.map((b) => <li key={b.id}>{b.day} · {teamName(b.teamId)}{b.reason ? ` · ${b.reason}` : ''}</li>)}</ul>
      {edit && teams.length > 0 && (
        <>
          <ActionForm action={bind(addBlackout)}>
            <select name="teamId" aria-label="Team">{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <label>Day <input name="day" type="date" required /></label>
            <label>Reason <input name="reason" maxLength={200} /></label>
            <button type="submit">Add blackout</button>
          </ActionForm>
          <ActionForm action={bind(addHoliday)}>
            {sid}
            <label>Holiday for every team <input name="day" type="date" required /></label>
            <label>Reason <input name="reason" maxLength={200} /></label>
            <button type="submit">Add holiday</button>
          </ActionForm>
        </>
      )}

      <h2>Generate</h2>
      <p>Feasibility ({feas.feasible && !capped ? 'these inputs could fit' : 'blocked'}; a pass is a necessary check, not a promise): {feas.gamesNeeded} games needed, {feas.slotsAvailable} slots available, effective capacity {feas.effectiveCapacity}.</p>
      {capped && <p role="alert">{capped}</p>}
      <ul>{feas.shortfalls.map((f, i) => <li key={i}>{f.detail}</li>)}</ul>
      {edit && (
        <>
          <ActionForm action={bind(generate)}>
            {sid}
            <label>Seed (blank for a new one) <input name="seed" type="number" min={0} defaultValue={latest ? String(latest.seed) : ''} /></label>
            <label>Iterations <input name="maxIterations" type="number" min={1} max={10000} defaultValue={5000} /></label>
            <button type="submit" disabled={!feas.feasible || !!capped || !input.games.length}>Generate draft</button>
          </ActionForm>
          <ActionForm action={bind(generate)}>
            {sid}
            <button type="submit" disabled={!feas.feasible || !!capped || !input.games.length}>New seed</button>
          </ActionForm>
        </>
      )}
      {latest && <VersionReport v={latest} teamName={teamName} />}

      <h2>Versions</h2>
      <table>
        <thead><tr><th>#</th><th>Status</th><th>Seed</th><th>Fingerprint</th><th>By</th><th>When</th><th>Why</th><th>Score</th><th></th></tr></thead>
        <tbody>
          {versions.map((v) => {
            const r = v.report as unknown as ScoreReport;
            return (
              <tr key={v.id}>
                <td>{v.number}</td><td>{v.status}</td><td>{String(v.seed)}</td><td>{v.fingerprint.slice(0, 12)}</td><td>{author(v.createdBy)}</td>
                <td>{(v.publishedAt ?? v.createdAt).toISOString().slice(0, 16).replace('T', ' ')} UTC</td><td>{v.reason ?? ''}</td>
                <td>{r.hardCount} hard, {r.unplaced.length} unplaced, soft {r.softCost}</td>
                <td>
                  {edit && v.status === 'draft' && (
                    <ActionForm action={bind(publish)}>
                      <input type="hidden" name="versionId" value={v.id} />
                      <label>Reason <input name="reason" required maxLength={500} /></label>
                      <button type="submit" disabled={!isPublishable(r)}>Publish</button>
                    </ActionForm>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {versions.length > 1 && (
        <form method="get">
          <label>Compare <select name="a" defaultValue={sp.a}>{versions.map((v) => <option key={v.id} value={v.number}>Version {v.number}</option>)}</select></label>
          <label>with <select name="b" defaultValue={sp.b}>{versions.map((v) => <option key={v.id} value={v.number}>Version {v.number}</option>)}</select></label>
          <button type="submit">Compare</button>
        </form>
      )}
      {moves && (
        <section aria-label="Comparison">
          <h3>Version {va!.number} to version {vb!.number}: {moves.length} games changed slot</h3>
          <ul>{moves.map((m) => <li key={m.key}>{gameLabel(m.key)}: {slotLabel(m.from)} → {slotLabel(m.to)}</li>)}</ul>
        </section>
      )}

      <h2>Pins</h2>
      <p>A pinned game never moves; generation works around it. A pin applies to the next generation, not to versions already made.</p>
      <ul>
        {pins.map((p) => {
          const g = games.find((x) => x.id === p.gameId);
          return (
            <li key={p.id}>
              {g ? gameLabel(g.key) : '?'} · {slotLabel(p.fieldSlotId)}
              {edit && (
                <ActionForm action={bind(removePin)}>
                  {sid}
                  <input type="hidden" name="gameId" value={p.gameId} />
                  <button type="submit">Remove pin</button>
                </ActionForm>
              )}
            </li>
          );
        })}
      </ul>
      {edit && games.length > 0 && (
        <ActionForm action={bind(setPin)}>
          {sid}
          <select name="gameId" aria-label="Game">{games.filter((g) => !pins.some((p) => p.gameId === g.id)).map((g) => <option key={g.id} value={g.id}>{gameLabel(g.key)}</option>)}</select>
          <select name="fieldSlotId" aria-label="Slot">{slots.filter((s) => s.status !== 'closed' && !pins.some((p) => p.fieldSlotId === s.id)).map((s) => <option key={s.id} value={s.id}>{slotLabel(s.id)}</option>)}</select>
          <button type="submit">Pin game</button>
        </ActionForm>
      )}

      <h2>Results</h2>
      {!published && <p>Scores are entered against the published version. Publish one first.</p>}
      <ul>
        {scored.map((pl) => {
          const g = games.find((x) => x.id === pl.gameId);
          const history = results.filter((r) => r.gameId === pl.gameId);
          const last = history[history.length - 1];
          if (!g) return null;
          return (
            <li key={pl.gameId}>
              {gameLabel(g.key)} · {slotLabel(pl.fieldSlotId)} ·{' '}
              {last ? (last.forfeit ? `${last.forfeit} forfeited` : `${last.homeRuns}–${last.awayRuns}`) : 'no score'}
              {history.length > 1 && (
                <ol>
                  {history.map((r) => (
                    <li key={r.id}>{r.forfeit ? `${r.forfeit} forfeited` : `${r.homeRuns}–${r.awayRuns}`} · {author(r.enteredBy)} · {r.enteredAt.toISOString().slice(0, 16)}Z{r.reason ? ` · ${r.reason}` : ''}</li>
                  ))}
                </ol>
              )}
              {edit && (
                <ActionForm action={bind(recordResult)}>
                  <input type="hidden" name="gameId" value={g.id} />
                  <label>Home <input name="homeRuns" type="number" min={0} max={99} defaultValue={0} /></label>
                  <label>Away <input name="awayRuns" type="number" min={0} max={99} defaultValue={0} /></label>
                  <label>Forfeit by <select name="forfeit" defaultValue=""><option value="">none</option><option value="home">home</option><option value="away">away</option></select></label>
                  {last && <label><input name="correction" type="checkbox" /> This corrects the score above</label>}
                  <label>Reason (required for a correction) <input name="reason" maxLength={500} /></label>
                  <button type="submit">{last ? 'Save correction' : 'Save score'}</button>
                </ActionForm>
              )}
            </li>
          );
        })}
      </ul>

      <h2>Rules</h2>
      {edit ? (
        <ActionForm action={bind(saveRules)}>
          {sid}
          <label>Max games per team per day <input name="maxGamesPerTeamPerDay" type="number" defaultValue={rules.maxGamesPerTeamPerDay} /></label>
          <label>Minimum rest days <input name="minRestDays" type="number" defaultValue={rules.minRestDays} /></label>
          <label>Maximum gap (days) <input name="maxGapDays" type="number" defaultValue={rules.maxGapDays} /></label>
          <label>Minimum days between rematches <input name="minRematchDays" type="number" defaultValue={rules.minRematchDays} /></label>
          <label>Rest weight <input name="rest" type="number" defaultValue={rules.weights.rest} /></label>
          <label>Long-gap weight <input name="longGap" type="number" defaultValue={rules.weights.longGap} /></label>
          <label>Slot-equity weight <input name="slotEquity" type="number" defaultValue={rules.weights.slotEquity} /></label>
          <label>Field-equity weight <input name="fieldEquity" type="number" defaultValue={rules.weights.fieldEquity} /></label>
          <label>Rematch weight <input name="rematch" type="number" defaultValue={rules.weights.rematch} /></label>
          <button type="submit">Save rules</button>
        </ActionForm>
      ) : (
        <p>Max {rules.maxGamesPerTeamPerDay} game per team per day, {rules.minRestDays} rest days.</p>
      )}
    </main>
  );
}

type Stored = ScoreReport & { before: { hardCount: number; unplaced: number; softCost: number } };

/** What one run measured (D-5): before and after, effort spent, and every remaining violation in a sentence. */
function VersionReport({ v, teamName }: { v: { number: number; seed: bigint; inputHash: string; iterations: number; accepted: number; report: unknown }; teamName: (id: string) => string }) {
  const r = v.report as Stored;
  const plain = (s: string) => s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (m) => (teamName(m) === '?' ? m : teamName(m)));
  return (
    <section aria-label={`Version ${v.number} report`}>
      <h3>Version {v.number}: seed {String(v.seed)}, input {v.inputHash.slice(0, 12)}</h3>
      <table>
        <thead><tr><th></th><th>Hard</th><th>Unplaced</th><th>Soft cost</th></tr></thead>
        <tbody>
          <tr><th scope="row">Before repair</th><td>{r.before.hardCount}</td><td>{r.before.unplaced}</td><td>{r.before.softCost}</td></tr>
          <tr><th scope="row">After repair</th><td>{r.hardCount}</td><td>{r.unplaced.length}</td><td>{r.softCost}</td></tr>
        </tbody>
      </table>
      <p>{v.iterations} iterations, {v.accepted} moves accepted. A local search: this is what it measured, not a claim of the best possible.</p>
      {r.unplaced.length > 0 && <p>Cannot be published: {r.unplaced.length} games have no legal slot.</p>}
      <ul>{[...r.hard, ...r.soft].map((x, i) => <li key={i}>{plain(x.detail)}</li>)}</ul>
    </section>
  );
}
