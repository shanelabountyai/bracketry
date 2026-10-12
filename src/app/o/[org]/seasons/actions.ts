'use server';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/core/audit';
import { orgAction, ref } from '@/core/authz/action';
import { inOrg, type OrgCtx } from '@/core/authz/guards';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import { dayNumber } from '@/lib/league/days';
import { materializeSlots } from '@/lib/league/materialize';
import { DEFAULT_RULES, DEFAULT_STANDINGS } from '@/lib/league/types';

// Season setup (SEASON-01..06). Commissioner = owner or admin = `org.update` (D-16); no template edit needed.
// Every write maps its unique violation to a message (never check-then-write, CLAUDE.md).
const PERM = 'org.update' as const;
const seasonPage = (ctx: OrgCtx, id: string) => `/o/${ctx.slug}/seasons/${id}`;

const name = (what: string) => z.string().trim().min(1, `Give the ${what} a name.`).max(120);
// Day and time are checked in the body, after the scoped lookup, so a foreign id is always "not found" first.
const day = z.string();
const hm = z.string();
function validDay(s: string) {
  try {
    dayNumber(s);
  } catch {
    throw new Refused('Enter a real day as YYYY-MM-DD.');
  }
}
const validHm = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s) || ((): never => { throw new Refused('Enter a start time as HH:MM, 24-hour.'); })();
const int = (min: number, max: number, what: string) => z.coerce.number().int(`${what} must be a whole number.`).min(min, `${what} must be at least ${min}.`).max(max, `${what} must be at most ${max}.`);

async function write<T>(fn: () => Promise<T>, dup: string): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') throw new Refused(dup);
    throw e;
  }
}
// A row that is not this org's is "not found" (INV-04), never a domain refusal.
const mine = async <T>(row: Promise<T | null>): Promise<T> => (await row) ?? notFound();

export const addSeason = orgAction(
  PERM,
  z.object({
    name: name('season'),
    timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }, 'Use an IANA timezone like America/Chicago.'),
    firstDay: day,
    lastDay: day,
    gameMinutes: int(15, 480, 'Game length'),
  }).refine((i) => i.lastDay >= i.firstDay, { message: 'The last day cannot be before the first day.', path: ['lastDay'] }),
  async (ctx, i) => {
    const s = await db.$transaction(async (tx) => {
      const s = await tx.season.create({ data: { ...inOrg(ctx), ...i, rules: DEFAULT_RULES as object, standingsConfig: DEFAULT_STANDINGS as object } });
      await audit(ctx, 'season.created', { targetType: 'season', targetId: s.id }, tx);
      return s;
    });
    redirect(seasonPage(ctx, s.id));
  },
);

export const addField = orgAction(PERM, z.object({ seasonId: ref('season'), name: name('field') }), async (ctx, i) => {
  const s = await mine(db.season.findFirst({ where: { id: i.seasonId, ...inOrg(ctx) }, select: { id: true } }));
  await write(() => db.field.create({ data: { ...inOrg(ctx), name: i.name } }), 'A field with that name already exists.');
  revalidatePath(seasonPage(ctx, s.id));
});

export const addDivision = orgAction(
  PERM,
  z.object({ seasonId: ref('season'), name: name('division'), legs: z.enum(['1', '2']) }),
  async (ctx, i) => {
    const s = await mine(db.season.findFirst({ where: { id: i.seasonId, ...inOrg(ctx) }, select: { id: true } }));
    await write(() => db.division.create({ data: { ...inOrg(ctx), seasonId: s.id, name: i.name, legs: Number(i.legs) } }), 'A division with that name already exists in this season.');
    revalidatePath(seasonPage(ctx, s.id));
  },
);

export const addTeam = orgAction(
  PERM,
  z.object({ divisionId: ref('division'), name: name('team'), contactEmail: z.union([z.literal(''), z.email('Enter a valid email or leave it blank.')]).default('') }),
  async (ctx, i) => {
    const d = await mine(db.division.findFirst({ where: { id: i.divisionId, ...inOrg(ctx) }, select: { id: true, seasonId: true } }));
    await write(
      () => db.team.create({ data: { ...inOrg(ctx), seasonId: d.seasonId, divisionId: d.id, name: i.name, contactEmail: i.contactEmail || null } }),
      'A team with that name already exists in this season.',
    );
    revalidatePath(seasonPage(ctx, d.seasonId));
  },
);

/** Saves the weekly pattern, then materializes it across the season window. Re-running adds only slots that are missing. */
export const addSlotPattern = orgAction(
  PERM,
  z.object({ seasonId: ref('season'), fieldId: ref('field'), weekday: int(0, 6, 'Weekday'), start: hm }),
  async (ctx, i) => {
    const s = await mine(db.season.findFirst({ where: { id: i.seasonId, ...inOrg(ctx) } }));
    const f = await mine(db.field.findFirst({ where: { id: i.fieldId, ...inOrg(ctx) }, select: { id: true } }));
    validHm(i.start);
    await db.$transaction(async (tx) => {
      await write(() => tx.slotPattern.create({ data: { ...inOrg(ctx), seasonId: s.id, fieldId: f.id, weekday: i.weekday, start: i.start } }), 'That weekly slot already exists.');
      const rows = materializeSlots([{ weekday: i.weekday, start: i.start, fieldId: f.id }], s.firstDay, s.lastDay);
      await tx.fieldSlot.createMany({ data: rows.map((r) => ({ ...inOrg(ctx), seasonId: s.id, ...r })), skipDuplicates: true });
    });
    revalidatePath(seasonPage(ctx, s.id));
  },
);

export const addSlot = orgAction(
  PERM,
  z.object({ seasonId: ref('season'), fieldId: ref('field'), day, start: hm, makeup: z.string().optional() }), // a makeup slot posts makeup=on (RAIN-01)
  async (ctx, i) => {
    const s = await mine(db.season.findFirst({ where: { id: i.seasonId, ...inOrg(ctx) } }));
    const f = await mine(db.field.findFirst({ where: { id: i.fieldId, ...inOrg(ctx) }, select: { id: true } }));
    validDay(i.day);
    validHm(i.start);
    // A makeup day may fall after the last scheduled day; it may not fall before the season.
    if (i.day < s.firstDay || (!i.makeup && i.day > s.lastDay)) throw new Refused('That day is outside the season.');
    await write(() => db.fieldSlot.create({ data: { ...inOrg(ctx), seasonId: s.id, fieldId: f.id, day: i.day, start: i.start, status: i.makeup ? 'makeup' : 'open' } }), 'That slot already exists.');
    revalidatePath(seasonPage(ctx, s.id));
  },
);

/** Close or reopen one slot. Closing removes a pin on it: a pin to a closed slot can never be met. A makeup slot is left alone. */
export const setSlotOpen = orgAction(PERM, z.object({ id: ref('fieldSlot'), open: z.enum(['true', 'false']) }), async (ctx, i) => {
  const open = i.open === 'true';
  const slot = await mine(db.fieldSlot.findFirst({ where: { id: i.id, ...inOrg(ctx) }, select: { seasonId: true } }));
  const r = await db.fieldSlot.updateMany({ where: { id: i.id, ...inOrg(ctx), status: open ? 'closed' : 'open' }, data: { status: open ? 'open' : 'closed' } });
  if (!r.count) throw new Refused(open ? 'That slot is not closed.' : 'That slot is not open.');
  if (!open) await db.pin.deleteMany({ where: { fieldSlotId: i.id, ...inOrg(ctx) } });
  revalidatePath(seasonPage(ctx, slot.seasonId));
});

export const addBlackout = orgAction(
  PERM,
  z.object({ teamId: ref('team'), day, reason: z.string().trim().max(200).default('') }),
  async (ctx, i) => {
    const t = await mine(db.team.findFirst({ where: { id: i.teamId, ...inOrg(ctx) }, select: { id: true, seasonId: true } }));
    validDay(i.day);
    await write(() => db.blackout.create({ data: { ...inOrg(ctx), teamId: t.id, day: i.day, reason: i.reason || null } }), 'That team already has a blackout on that day.');
    revalidatePath(seasonPage(ctx, t.seasonId));
  },
);

/** SEASON-04: one holiday for every team in the season. Teams that already have the day are skipped. */
export const addHoliday = orgAction(
  PERM,
  z.object({ seasonId: ref('season'), day, reason: z.string().trim().max(200).default('') }),
  async (ctx, i) => {
    const s = await mine(db.season.findFirst({ where: { id: i.seasonId, ...inOrg(ctx) }, select: { id: true } }));
    validDay(i.day);
    const teams = await db.team.findMany({ where: { seasonId: s.id, ...inOrg(ctx) }, select: { id: true } });
    const r = await db.blackout.createMany({ data: teams.map((t) => ({ ...inOrg(ctx), teamId: t.id, day: i.day, reason: i.reason || null })), skipDuplicates: true });
    revalidatePath(seasonPage(ctx, s.id));
    return { notice: `Blackout added for ${r.count} of ${teams.length} teams.` };
  },
);

export const saveRules = orgAction(
  PERM,
  z.object({
    seasonId: ref('season'),
    maxGamesPerTeamPerDay: int(1, 4, 'Max games per day'),
    minRestDays: int(0, 30, 'Minimum rest days'),
    maxGapDays: int(1, 120, 'Maximum gap'),
    minRematchDays: int(0, 120, 'Minimum days between rematches'),
    rest: int(0, 100, 'Rest weight'),
    longGap: int(0, 100, 'Long-gap weight'),
    slotEquity: int(0, 100, 'Slot-equity weight'),
    fieldEquity: int(0, 100, 'Field-equity weight'),
    rematch: int(0, 100, 'Rematch weight'),
  }),
  async (ctx, { seasonId, rest, longGap, slotEquity, fieldEquity, rematch, ...hard }) => {
    const r = await db.season.updateMany({ where: { id: seasonId, ...inOrg(ctx) }, data: { rules: { ...hard, weights: { rest, longGap, slotEquity, fieldEquity, rematch } } } });
    if (!r.count) notFound();
    await audit(ctx, 'season.rules_saved', { targetType: 'season', targetId: seasonId });
    revalidatePath(seasonPage(ctx, seasonId));
    return { notice: 'Rules saved.' };
  },
);
