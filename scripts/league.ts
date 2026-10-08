// `npm run league -- <command> [args]`. Later items register commands here.
import { readFileSync } from 'node:fs';
import { checkFeasibility } from '@/lib/league/feasibility';
import { roundRobin } from '@/lib/league/round-robin';
import type { ScheduleInput } from '@/lib/league/types';
import { capstone } from './league-capstone';

const flag = (args: string[], name: string) => args[args.indexOf(`--${name}`) + 1];

const commands: Record<string, ((args: string[]) => void) | undefined> = {
  // league pairings --teams N [--legs 2]
  pairings(args) {
    const n = Number(flag(args, 'teams'));
    const legs = flag(args, 'legs') === '2' ? 2 : 1;
    if (!Number.isInteger(n) || n < 2) throw new Error('Usage: league pairings --teams N [--legs 2]');
    const rr = roundRobin(Array.from({ length: n }, (_, i) => `T${String(i + 1).padStart(2, '0')}`), { legs });
    rr.rounds.forEach((round, i) => {
      const bye = rr.byes[i]!.length ? `  (bye: ${rr.byes[i]!.join(', ')})` : '';
      console.log(`Round ${i + 1}: ${round.map((p) => `${p.home} v ${p.away}`).join(' | ')}${bye}`);
    });
  },
  // league feasibility <file.json>   (a ScheduleInput)
  feasibility(args) {
    if (!args[0]) throw new Error('Usage: league feasibility <file.json>');
    const f = checkFeasibility(JSON.parse(readFileSync(args[0], 'utf8')) as ScheduleInput);
    console.log(`${f.gamesNeeded} games, ${f.slotsAvailable} slots, room for ${f.effectiveCapacity} once teams, blackouts and daily limits are counted.`);
    if (f.feasible) console.log('No necessary condition fails: these inputs could fit. The generator may still leave games unplaced.');
    else for (const s of f.shortfalls) console.log(`- ${s.code}: ${s.detail}`);
  },
  // league capstone [--seed 2027]
  capstone(args) {
    const seed = args.includes('--seed') ? Number(flag(args, 'seed')) : 2027;
    if (!Number.isInteger(seed)) throw new Error('Usage: league capstone [--seed N]');
    console.log(capstone(seed));
  },
};

const [name, ...args] = process.argv.slice(2);
const run = name ? commands[name] : undefined;
if (!run) {
  console.error(`Usage: npm run league -- <command>\nCommands: ${Object.keys(commands).join(', ') || '(none yet)'}`);
  process.exit(name ? 1 : 0);
}
run(args);
