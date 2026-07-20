/**
 * Deterministic circular-dependency gate powered by dependency-cruiser.
 */

import { runDependencyGraphCheck } from '../../core/dependency-graph-runner.mjs';
import { isExecutedAsScript } from '../../core/shared.mjs';

export async function runCycleCheck(options = {}) {
  const result = await runDependencyGraphCheck(options);
  return result.cycles;
}

if (isExecutedAsScript(import.meta.url)) {
  const circular = await runCycleCheck();

  if (circular.length > 0) {
    process.stderr.write('Circular dependencies found:\n\n');
    for (const cycle of circular) {
      process.stderr.write(`- ${cycle.join(' -> ')}\n`);
    }
    process.exit(1);
  }

  process.stdout.write('Cycle check passed\n');
}
