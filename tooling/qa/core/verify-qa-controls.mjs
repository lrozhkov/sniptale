import { generateControlInventory } from './qa-controls/generate.mjs';
import { isExecutedAsScript, printViolations } from './shared.mjs';

export function collectQaControlViolations() {
  return generateControlInventory().violations;
}

export function runQaControlCheck() {
  const violations = collectQaControlViolations();
  return { skipped: false, files: [], violations };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runQaControlCheck();
  if (result.violations.length > 0) {
    printViolations('QA control inventory violations found:', result.violations);
    process.exit(1);
  }
  process.stdout.write('QA control inventory guard passed\n');
}
