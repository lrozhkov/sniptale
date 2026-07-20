/**
 * Deterministic dependency-boundary gate powered by dependency-cruiser.
 */

import { runDependencyGraphCheck } from '../../core/dependency-graph-runner.mjs';
import { isExecutedAsScript } from '../../core/shared.mjs';

export async function runBoundaryCheck(options = {}) {
  const result = await runDependencyGraphCheck(options);
  return result.boundary;
}

if (isExecutedAsScript(import.meta.url)) {
  const { output, exitCode } = await runBoundaryCheck();

  if (output) {
    process.stdout.write(`${output}\n`);
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }

  process.stdout.write('Dependency boundaries passed\n');
}
