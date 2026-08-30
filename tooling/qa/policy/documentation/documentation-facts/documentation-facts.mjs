import { collectDocumentationFactViolations } from './check.mjs';
import { isExecutedAsScript, printViolations } from '../../../runtime/process/shared-cli.mjs';

export function runDocumentationFactsCheck(options = {}) {
  return { violations: collectDocumentationFactViolations(options) };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runDocumentationFactsCheck();
  if (result.violations.length > 0) {
    printViolations('Documentation fact violations found:', result.violations);
    process.exit(1);
  }
  process.stdout.write('Documentation facts passed\n');
}
