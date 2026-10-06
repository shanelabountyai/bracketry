// L-004. Spec: docs/prds/01-generator-spec.md §3. Pending suite: tests/unit/league-feasibility.pending.ts
import { NotImplementedError, type FeasibilityReport, type ScheduleInput } from './types';

/** Necessary conditions only, with the arithmetic shown. Runs before any generation. */
export function checkFeasibility(_input: ScheduleInput): FeasibilityReport {
  throw new NotImplementedError('checkFeasibility');
}
