/**
 * Deterministic AI-readiness gate.
 * Checks file size, token pressure, long inline static blobs, and dead commented code.
 */

import { collectAiLimitReport } from './ai-limit-utils.mjs';
import {
  filterAllowedViolations,
  isExecutedAsScript,
  loadBaseline,
  parseFilesArgument,
  printViolations,
} from './shared.mjs';
import { collectCodeFiles, getOptionValue } from './shared.mjs';

export function runAiLimitCheck({ files = [], requestedChecks } = {}) {
  const reportFiles = collectCodeFiles(files);
  const report = collectAiLimitReport(reportFiles, requestedChecks);
  const baseline = loadBaseline();

  return {
    files: reportFiles,
    report,
    violations: filterAllowedViolations(report.violations, baseline),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const argv = process.argv.slice(2);
  const explicitFiles = parseFilesArgument(argv);
  const checksOption = getOptionValue(argv, '--checks');
  const requestedChecks = checksOption
    ? checksOption
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined;
  const { files, report, violations } = runAiLimitCheck({
    files: explicitFiles,
    requestedChecks,
  });

  if (argv.includes('--json')) {
    process.stdout.write(
      `${JSON.stringify(
        {
          files,
          violations,
          tokenHotspots: report.tokenHotspots.slice(0, 50),
          lineHotspots: report.lineHotspots.slice(0, 50),
        },
        null,
        2
      )}\n`
    );
  }

  if (violations.length > 0) {
    printViolations('AI limit violations found:', violations);
    process.exit(1);
  }

  process.stdout.write('AI limits passed\n');
}
