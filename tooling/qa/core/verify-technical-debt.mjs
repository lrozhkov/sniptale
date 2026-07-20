import { verifyTechnicalDebtReport } from './technical-debt-report.mjs';
import { isExecutedAsScript, printViolations } from './shared.mjs';

export function collectTechnicalDebtViolations() {
  return verifyTechnicalDebtReport();
}

export function runTechnicalDebtCheck() {
  return { skipped: false, files: [], violations: collectTechnicalDebtViolations() };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runTechnicalDebtCheck();
  if (result.violations.length > 0) {
    printViolations('Technical debt registry violations found:', result.violations);
    process.exit(1);
  }
  process.stdout.write('Technical debt registry guard passed\n');
}
