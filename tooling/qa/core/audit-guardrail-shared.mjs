import fs from 'node:fs';

import { collectCodeFiles, isExecutedAsScript, toRelativePath } from './shared.mjs';
import { emitScopedReportCliResult, parseScopedReportCliArgs } from './scoped-report-cli.mjs';
import { runScopedCodeFileCheck } from './repo-scoped-typescript-scan.mjs';
import { normalizeRepoSrcPath } from './src-production-targets.mjs';

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const CODE_FILE_PATTERN = /\.(?:ts|tsx|js|mjs|cjs)$/u;

const CLI_LABELS = {
  skippedRepoWide: '{label} repo-wide check skipped: no code files\n',
  skippedWorkspace: '{label} check skipped: no changed code files\n',
  reportOnlyHeader: '{label} report found violations:',
  failureHeader: '{label} violations found:',
  passedRepoWide: '{label} repo-wide guard passed\n',
  passedWorkspace: '{label} guard passed\n',
};

function formatLabels(label) {
  return Object.fromEntries(
    Object.entries(CLI_LABELS).map(([key, value]) => [key, value.replaceAll('{label}', label)])
  );
}

export function createViolation(rule, file, line, message) {
  return { rule, file, line, message };
}

export function normalizePath(filePath) {
  return normalizeRepoSrcPath(toRelativePath(filePath));
}

export function isProductionCodeFile(relativePath) {
  return (
    CODE_FILE_PATTERN.test(relativePath) &&
    !relativePath.startsWith('tooling/test/support/') &&
    !TEST_FILE_PATTERN.test(relativePath) &&
    !/(?:\.test\.(?:fixtures?|support)\.|\.test-support\.)/u.test(relativePath) &&
    !/(?:^|\/)(?:test-support|fixtures?|__fixtures__)(?:\/|\.|-)/u.test(relativePath)
  );
}

export function readFileLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/u);
}

export function lineNumber(index) {
  return index + 1;
}

export function hasAnyLine(lines, pattern) {
  return lines.some((line) => pattern.test(line));
}

export function collectLineViolations(files, collector) {
  const violations = [];
  for (const filePath of files) {
    const relativePath = normalizePath(filePath);
    if (!isProductionCodeFile(relativePath)) {
      continue;
    }
    const lines = readFileLines(filePath);
    violations.push(...collector({ filePath, lines, relativePath, source: lines.join('\n') }));
  }
  return violations;
}

export function runGuardrailCheck({ collectViolations, files = [], scope = 'workspace' }) {
  return runScopedCodeFileCheck({
    collectFiles: collectCodeFiles,
    collectViolations,
    files,
    scope,
  });
}

export function runGuardrailCli({ collectViolations, label }) {
  const { explicitFiles, reportOnly, repoWide, scope } = parseScopedReportCliArgs(
    process.argv.slice(2)
  );
  const result = runGuardrailCheck({ collectViolations, files: explicitFiles, scope });
  return emitScopedReportCliResult({
    labels: formatLabels(label),
    repoWide,
    reportOnly,
    result,
  });
}

export function runIfExecutedAsScript(metaUrl, args) {
  if (isExecutedAsScript(metaUrl)) {
    process.exit(runGuardrailCli(args));
  }
}
