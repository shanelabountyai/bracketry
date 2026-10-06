// L-005 (score), L-006 (greedy + repair), L-007 (reschedule).
// Spec: docs/prds/01-generator-spec.md §4–§7. Pending suites: tests/unit/league-score.pending.ts, league-generate.pending.ts
import {
  NotImplementedError,
  type Assignment,
  type GenerateOptions,
  type GenerationResult,
  type RescheduleRequest,
  type RescheduleResult,
  type ScheduleInput,
  type ScoreReport,
} from './types';

/** The one scoring function. The repair loop, the publish gate and the quality report all call this (D-4). */
export function scoreSchedule(_input: ScheduleInput, _assignment: Assignment): ScoreReport {
  throw new NotImplementedError('scoreSchedule');
}

/** Greedy draft, then repair. */
export function generateSchedule(_input: ScheduleInput, _opts: GenerateOptions): GenerationResult {
  throw new NotImplementedError('generateSchedule');
}

/** The repair loop alone, from any starting assignment (an imported or hand-edited schedule included). */
export function repair(_input: ScheduleInput, _start: Assignment, _opts: GenerateOptions): GenerationResult {
  throw new NotImplementedError('repair');
}

/** Rainout: move only the displaced games. Everything else stays exactly where it was. */
export function reschedule(_req: RescheduleRequest): RescheduleResult {
  throw new NotImplementedError('reschedule');
}
