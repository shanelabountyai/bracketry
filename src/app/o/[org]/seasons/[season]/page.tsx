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
import { closeDay, proposeReschedule, regenerateRest } from '../rainout-actions';
import { loadRainout, timeIn } from '../rainout-load';
import { recordResult, voidResult } from '../result-actions';
import { resultsOrder } from '../results-order';
import { publish, removePin, setPin } from '../version-actions';
import { addBlackout, addDivision, addField, addHoliday, addSlot, addSlotPattern, addTeam, editTeam, saveRules, setCrossover, setSlotOpen } from '../actions';

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
  const rain = await loadRainout(ctx, season.id);
  const { rows, input } = rain;
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
  /** An engine slot id (`day|start|fieldId`, D-24) in words. */
  const where = (id: string) => { const [d, t, f] = id.split('|'); return `${d} ${t} · ${fieldName(f ?? '')}`; };
  const unplayed = Object.keys(rain.current).length - Object.keys(rain.played).length;
  const author = (id: string) => { const u = [...authors, ...resultAuthors].find((x) => x.id === id); return u?.name ?? u?.email ?? 'a former member'; };
  const rules = { ...DEFAULT_RULES, ...(season.rules as Partial<Rules>) };
  const sid = <input type="hidden" name="seasonId" value={season.id} />;
  const crossovers = input.games.filter((g) => g.awayDivision).length;
  // Results for tonight (SCORE-10 to SCORE-12): unscored played games first by field, no form on a future game.
  const { owed, rest } = resultsOrder(
    scored.flatMap((pl) => {
      const [g, slot] = [games.find((x) => x.id === pl.gameId), slots.find((x) => x.id === pl.fieldSlotId)];
      const history = results.filter((r) => r.gameId === pl.gameId);
      return g && slot ? [{ g, history, day: slot.day, start: slot.start, field: fieldName(slot.fieldId), scored: history.length > 0 && !history[history.length - 1]!.voided }] : [];
    }),
    rain.today,
  );
  const owedCount = owed.reduce((n, [, rows]) => n + rows.length, 0);
  const resultItem = ({ g, history, day, start, field }: (typeof rest)[number]) => {
    // A void leaves the game with no score (D-45): the history keeps it, the form is a first entry again.
    const newest = history[history.length - 1];
    const last = newest?.voided ? undefined : newest;
    const [home, away] = [teamName(g.homeTeamId), teamName(g.awayTeamId)];
    const show = (r: (typeof results)[number]) => (r.voided ? 'Voided' : r.forfeit ? `${r.forfeit === 'home' ? home : away} forfeited` : `${r.homeRuns}–${r.awayRuns}${r.homeRuns === r.awayRuns ? ' (Tie)' : ''}`);
    return (
      <li key={g.id}>
        {home} v {away} · {day} {start} · {field} ·{' '}
        {last ? show(last) : 'no score'}
        {history.length > 1 && (
          <ol>
            {history.map((r) => (
              <li key={r.id}>{show(r)} · {author(r.enteredBy)} · {timeIn(season.timezone, r.enteredAt)}{r.reason ? ` · ${r.reason}` : ''}</li>
            ))}
          </ol>
        )}
        {edit && day <= rain.today && (
          <ActionForm action={bind(recordResult)}>
            <input type="hidden" name="gameId" value={g.id} />
            {/* No `required` on the run boxes: a forfeit leaves them empty. The action refuses an empty box otherwise (SCORE-04). */}
            <label>{home} <input name="homeRuns" type="number" min={0} max={99} /></label>
            <label>{away} <input name="awayRuns" type="number" min={0} max={99} /></label>
            <label>Forfeit by <select name="forfeit" defaultValue=""><option value="">none</option><option value="home">{home}</option><option value="away">{away}</option></select></label>
            {last && <label><input name="correction" type="checkbox" defaultChecked /> This corrects the score above</label>}
            {last && <label>Reason for the correction <input name="reason" required maxLength={500} /></label>}
            {/* The confirm line (SCORE-13): the browser will not send the form until it is ticked. */}
            <label><input type="checkbox" required /> This is {home} v {away}, {day} {start}, {field}</label>
            <button type="submit">{last ? 'Save correction' : 'Save score'}</button>
          </ActionForm>
        )}
        {edit && last && (
          <ActionForm action={bind(voidResult)}>
            <input type="hidden" name="gameId" value={g.id} />
            <label>Entered on the wrong game? Reason <input name="reason" required maxLength={500} /></label>
            <button type="submit">Void this score</button>
          </ActionForm>
        )}
      </li>
    );
  };

  return (
    <main>
      <h1>{season.name}</h1>
      <p><a href={`/o/${ctx.slug}/seasons/${season.id}/standings`}>Standings</a> · <a href={`/o/${ctx.slug}/seasons/${season.id}/bracket`}>Playoffs</a> · <a href={`/l/${ctx.slug}/${season.id}`}>Public page</a> (anyone with the link can read it once a version is published)</p>
      <p>{season.firstDay} to {season.lastDay} · {season.timezone} · {season.gameMinutes}-minute games · {season.status}</p>

      <h2>Divisions and teams</h2>
      {divisions.map((d) => (
        <section key={d.id}>
          <h3>{d.name} ({d.legs === 2 ? 'double' : 'single'} round robin)</h3>
          <ul>
            {teams.filter((t) => t.divisionId === d.id).map((t) => (
              <li key={t.id}>
                {t.name}
                {/* SEASON-08: said here, at setup, so it is not first learned from the count at publish. */}
                {!t.contactEmail && <> · <strong>no contact email</strong> (gets no notice when its games move)</>}
                {edit && (
                  <details>
                    <summary>Edit</summary>
                    <ActionForm action={bind(editTeam)}>
                      <input type="hidden" name="teamId" value={t.id} />
                      <label>Team <input name="name" required maxLength={120} defaultValue={t.name} /></label>
                      <label>Contact email (internal) <input name="contactEmail" type="email" defaultValue={t.contactEmail ?? ''} /></label>
                      <button type="submit">Save team</button>
                    </ActionForm>
                  </details>
                )}
              </li>
            ))}
          </ul>
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
      {divisions.length > 1 && (
        <section>
          <h3>Crossover games</h3>
          <p>In a crossover round every team of the smaller division plays one team of the other, never the same opponent twice. The games count in each team&apos;s own division standings. This season has {crossovers} crossover {crossovers === 1 ? 'game' : 'games'}.</p>
          {edit && (
            <ActionForm action={bind(setCrossover)}>
              {sid}
              <label>Crossover rounds <input name="rounds" type="number" min={0} max={16} defaultValue={season.crossoverRounds} required /></label>
              <button type="submit">Save crossover rounds</button>
            </ActionForm>
          )}
        </section>
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
      {edit && results.length > 0 && <p>A game in this season has a score, so a plain run is closed (it would not keep played games in place). Use &ldquo;Regenerate the rest&rdquo; under the rainout tool.</p>}
      {edit && !results.length && (
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
      {latest && <VersionReport v={latest} teamName={teamName} gameLabel={gameLabel} where={where} />}

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
                <td>{r.hardCount} hard, {r.unplaced.length} unplaced, soft {r.softCost} · <a href={`/o/${ctx.slug}/seasons/${season.id}/quality?v=${v.number}`}>Quality</a></td>
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
      {published && <p>{owedCount === 0 ? 'Every game played so far has a score.' : `${owedCount} played ${owedCount === 1 ? 'game has' : 'games have'} no score yet.`}</p>}
      {owed.map(([field, rows]) => (
        <section key={field}>
          <h3>{field}</h3>
          <ul>{rows.map(resultItem)}</ul>
        </section>
      ))}
      {owed.length > 0 && rest.length > 0 && <h3>Scored and upcoming</h3>}
      <ul>{rest.map(resultItem)}</ul>

      <h2>Rainout</h2>
      <p>Close the slots that were lost, add makeup slots if you have them, then propose a reschedule. Only games in a closed slot move; a game with a score is never moved. Free slots on or before {rain.today} are not offered. Teams are notified when the new version is published.</p>
      {edit && (
        <>
          <ActionForm action={bind(closeDay)}>
            {sid}
            <label>Close every slot on <input name="day" type="date" required /></label>
            <button type="submit">Close day</button>
          </ActionForm>
          {fields.length > 0 && (
            <ActionForm action={bind(addSlot)}>
              {sid}
              <input type="hidden" name="makeup" value="on" />
              <select name="fieldId" aria-label="Makeup field">{fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
              <label>Makeup day <input name="day" type="date" required /></label>
              <label>Start <input name="start" type="time" required /></label>
              <button type="submit">Add makeup slot</button>
            </ActionForm>
          )}
        </>
      )}
      <h3>Displaced games ({rain.displaced.length})</h3>
      <ul>{rain.displaced.map((d) => <li key={d.key}>{gameLabel(d.key)} · was {where(d.slot)}</li>)}</ul>
      {edit && published && (
        <>
          <ActionForm action={bind(proposeReschedule)}>
            {sid}
            <button type="submit" disabled={!rain.displaced.length}>Propose reschedule</button>
          </ActionForm>
          <h3>Regenerate the rest of the season</h3>
          <p role="alert">This is not a reschedule. It keeps the {Object.keys(rain.played).length} games that have a score where they were played and builds a new schedule for the other {unplayed}, so any of those {unplayed} games may move, including ones no rain touched. A game without a score counts as not played. The draft reports how many moved.</p>
          <ActionForm action={bind(regenerateRest)}>
            {sid}
            <label><input name="confirm" type="checkbox" required /> I understand up to {unplayed} games may move</label>
            <button type="submit">Regenerate the rest</button>
          </ActionForm>
        </>
      )}

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

type Stored = ScoreReport & {
  before?: { hardCount: number; unplaced: number; softCost: number };
  reschedule?: { of: number; moved: { game: string; from: string; to: string }[]; unplaced: Record<string, string> };
  regenerated?: { of: number; kept: number; unplayed: number; moved: number };
};

/** What one run measured (D-5): before and after, effort spent, and every remaining violation in a sentence. */
function VersionReport({ v, teamName, gameLabel, where }: { v: { number: number; seed: bigint; inputHash: string; iterations: number; accepted: number; report: unknown }; teamName: (id: string) => string; gameLabel: (key: string) => string; where: (slot: string) => string }) {
  const r = v.report as Stored;
  const plain = (s: string) => s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (m) => (teamName(m) === '?' ? m : teamName(m)));
  return (
    <section aria-label={`Version ${v.number} report`}>
      <h3>Version {v.number}: seed {String(v.seed)}, input {v.inputHash.slice(0, 12)}</h3>
      {r.reschedule && (
        <>
          <p>Reschedule of version {r.reschedule.of}: {r.reschedule.moved.length} displaced games moved, {r.unplaced.length} with no legal slot. Every other game kept its slot. Soft cost {r.softCost}. One pass, a game at a time: not a claim of the best joint placement.</p>
          <ul>
            {r.reschedule.moved.map((m) => <li key={m.game}>{gameLabel(m.game)}: {where(m.from)} → {where(m.to)}</li>)}
            {Object.entries(r.reschedule.unplaced).map(([key, why]) => <li key={key}>{gameLabel(key)}: not placed. {why}</li>)}
          </ul>
        </>
      )}
      {r.regenerated && <p>Regenerated from version {r.regenerated.of}: {r.regenerated.kept} played games kept, {r.regenerated.moved} of {r.regenerated.unplayed} unplayed games moved.</p>}
      {r.before && (
        <>
          <table>
            <thead><tr><th></th><th>Hard</th><th>Unplaced</th><th>Soft cost</th></tr></thead>
            <tbody>
              <tr><th scope="row">Before repair</th><td>{r.before.hardCount}</td><td>{r.before.unplaced}</td><td>{r.before.softCost}</td></tr>
              <tr><th scope="row">After repair</th><td>{r.hardCount}</td><td>{r.unplaced.length}</td><td>{r.softCost}</td></tr>
            </tbody>
          </table>
          <p>{v.iterations} iterations, {v.accepted} moves accepted. A local search: this is what it measured, not a claim of the best possible.</p>
        </>
      )}
      {r.unplaced.length > 0 && <p>Cannot be published: {r.unplaced.length} games have no legal slot.</p>}
      <ul>{[...r.hard, ...r.soft].map((x, i) => <li key={i}>{plain(x.detail)}</li>)}</ul>
    </section>
  );
}
