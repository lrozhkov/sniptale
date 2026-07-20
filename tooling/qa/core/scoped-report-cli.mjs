import { parseFilesArgument, printViolations } from './shared.mjs';

export function parseScopedReportCliArgs(argv) {
  const repoWide = argv.includes('--repo-wide');
  const reportOnly = argv.includes('--report-only');
  const explicitFiles = parseFilesArgument(
    argv.filter((arg) => arg !== '--repo-wide' && arg !== '--report-only')
  );

  return {
    explicitFiles,
    reportOnly,
    repoWide,
    scope: repoWide ? 'repo-wide' : 'workspace',
  };
}

export function emitScopedReportCliResult({ labels, repoWide, reportOnly, result }) {
  if (result.skipped) {
    process.stdout.write(repoWide ? labels.skippedRepoWide : labels.skippedWorkspace);
    return 0;
  }

  if (result.violations.length > 0) {
    printViolations(reportOnly ? labels.reportOnlyHeader : labels.failureHeader, result.violations);
    return reportOnly ? 0 : 1;
  }

  process.stdout.write(repoWide ? labels.passedRepoWide : labels.passedWorkspace);
  return 0;
}
