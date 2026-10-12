import { describe, expect, it } from 'vitest';
import { compareAssignments } from '@/lib/league/compare';

describe('compareAssignments', () => {
  it('lists only games whose slot differs, sorted, with null for a game placed in one version only', () => {
    expect(compareAssignments({ b: 's1', a: 's1', c: 's3' }, { a: 's1', b: 's2', d: 's4' })).toEqual([
      { key: 'b', from: 's1', to: 's2' },
      { key: 'c', from: 's3', to: null },
      { key: 'd', from: null, to: 's4' },
    ]);
  });
});
