// Per pending suite: how many tests fail with NotImplementedError vs any other way (D-20).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join(mkdtempSync(join(tmpdir(), 'pending-')), 'r.json');
spawnSync('npx', ['vitest', 'run', '-c', 'vitest.pending.config.ts', '--reporter=json', `--outputFile=${out}`], { stdio: 'ignore' });
// Vitest writes no report when the include pattern matches no file: every suite has been renamed.
if (!existsSync(out)) { console.log('pending:check: no report written, no pending suites left'); process.exit(0); }
const report = JSON.parse(readFileSync(out, 'utf8'));

let total = 0, notImpl = 0, other = 0;
for (const suite of report.testResults) {
  const name = suite.name.split('/').pop();
  let ni = 0, ot = 0, pass = 0;
  for (const t of suite.assertionResults) {
    if (t.status === 'passed') pass++;
    else if ((t.failureMessages ?? []).join('\n').includes('NotImplementedError')) ni++;
    else ot++;
  }
  if (suite.assertionResults.length === 0) { ot++; console.log(`${name}: suite failed to load: ${suite.message.split('\n')[0]}`); }
  console.log(`${name}: ${suite.assertionResults.length} tests, ${ni} NotImplementedError, ${ot} other failure, ${pass} passing`);
  total += suite.assertionResults.length; notImpl += ni; other += ot;
}
console.log(`TOTAL: ${total} tests, ${notImpl} NotImplementedError, ${other} other failure`);
