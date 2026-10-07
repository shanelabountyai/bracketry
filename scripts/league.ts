// `npm run league -- <command> [args]`. Later items register commands here.
import { roundRobin } from '@/lib/league/round-robin';

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
};

const [name, ...args] = process.argv.slice(2);
const run = name ? commands[name] : undefined;
if (!run) {
  console.error(`Usage: npm run league -- <command>\nCommands: ${Object.keys(commands).join(', ') || '(none yet)'}`);
  process.exit(name ? 1 : 0);
}
run(args);
