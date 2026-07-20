#!/usr/bin/env node

import { getOptionValue, isExecutedAsScript } from '../core/shared.mjs';
import {
  collectRepoAuditEvidence,
  printTextReport,
} from '../evidence/repo-audit-evidence/core.mjs';

export { collectRepoAuditEvidence } from '../evidence/repo-audit-evidence/core.mjs';

if (isExecutedAsScript(import.meta.url)) {
  const argv = process.argv.slice(2);
  const topCount = Number(getOptionValue(argv, '--top') ?? '10');
  const evidence = collectRepoAuditEvidence({
    topCount: Number.isFinite(topCount) ? topCount : 10,
  });

  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
    process.exit(0);
  }

  printTextReport(evidence);
}
