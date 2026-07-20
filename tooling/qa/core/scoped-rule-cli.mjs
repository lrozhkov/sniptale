import { printViolations } from './shared.mjs';

function parseScopedRuleArguments(argv) {
  const repoWide = argv.includes('--repo-wide');
  const reportOnly = argv.includes('--report-only');
  const filesIndex = argv.indexOf('--files');
  const files = filesIndex >= 0 ? argv.slice(filesIndex + 1) : [];
  return {
    files: files.filter((file) => !file.startsWith('--')),
    reportOnly,
    scope: repoWide ? 'repo-wide' : 'workspace',
  };
}

export function runScopedRuleCli({ messages, runCheck, argv = process.argv.slice(2) }) {
  const options = parseScopedRuleArguments(argv);
  const result = runCheck({ files: options.files, scope: options.scope });

  if (result.skipped) {
    process.stdout.write(
      options.scope === 'repo-wide' ? messages.repoWideSkipped : messages.workspaceSkipped
    );
    return 0;
  }
  if (result.violations.length > 0) {
    printViolations(
      options.reportOnly ? messages.reportViolations : messages.blockingViolations,
      result.violations
    );
    return options.reportOnly ? 0 : 1;
  }

  process.stdout.write(
    options.scope === 'repo-wide' ? messages.repoWidePassed : messages.workspacePassed
  );
  return 0;
}
