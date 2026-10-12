import { notFound } from 'next/navigation';
import { z } from 'zod';
import { inOrg, requireOrg } from '@/core/authz/guards';
import { can } from '@/core/authz/permissions';
import { db } from '@/core/db';
import { ActionForm } from '@/core/ui/action-form';
import { DEFAULT_RULES, type Rules } from '@/lib/league/types';
import { addBlackout, addDivision, addField, addHoliday, addSlot, addSlotPattern, addTeam, saveRules, setSlotOpen } from '../actions';

export const metadata = { title: 'Season setup' };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default async function SeasonSetup({ params }: { params: Promise<{ org: string; season: string }> }) {
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
  const edit = can(ctx.role, 'org.update');
  const bind = <A extends unknown[], R>(fn: (slug: string, ...a: A) => R) => fn.bind(null, ctx.slug);
  const fieldName = (id: string) => fields.find((f) => f.id === id)?.name ?? '?';
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? '?';
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
