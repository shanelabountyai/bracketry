import { describe, expect, it } from 'vitest';
import { roundRobin } from '@/lib/league/round-robin';
import { generateSchedule, scoreSchedule } from '@/lib/league/schedule';
import { aliased, dollars } from '../../scripts/league-bench';
import { capstoneSlots, input, teamIds } from './league-fixtures';

describe('L-025 benchmark harness', () => {
  it('prices a response from its usage', () => {
    // 1,000 in at $4/M + 2,000 out at $20/M = 0.004 + 0.040
    expect(dollars('claude-opus-5-5', { input_tokens: 1000, output_tokens: 2000 })).toBeCloseTo(0.044, 10);
  });

  const season = input(roundRobin(teamIds(6), { legs: 1 }).rounds.flat(), capstoneSlots(4));
  const a = aliased(season);
  const g = generateSchedule(season, { seed: 1 });

  it('scores an aliased answer exactly as the assignment it stands for', () => {
    const back = a.toAssignment(a.toAnswer(g.assignment));
    expect(back).toEqual({ assignment: g.assignment, unknownGames: 0 });
    expect(JSON.stringify(a.season)).not.toContain('real');
  });

  it('leaves a made-up slot to scoreSchedule and drops a made-up game', () => {
    const { assignment, unknownGames } = a.toAssignment([{ game: 'G01', slot: 'S99' }, { game: 'G99', slot: 'S01' }]);
    expect(unknownGames).toBe(1);
    const report = scoreSchedule(season, assignment);
    expect(report.hard.map((v) => v.code)).toEqual(['UNKNOWN_SLOT']);
    expect(report.unplaced).toHaveLength(season.games.length - 1);
  });
});
