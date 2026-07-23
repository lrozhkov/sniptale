import fs from 'node:fs';

import { createHeadFileTextResolver, readHeadFileTexts } from './git-head-sources.mjs';
import {
  collectRenameSourceByTarget,
  filterImportOrMockOnlyDiffFiles,
} from './import-only-diff.mjs';
import {
  collectCodeFiles,
  isExecutedAsScript,
  isIgnoredRelativePath,
  parseFilesArgument,
  readText,
  toRelativePath,
} from './shared.mjs';
import { JAVASCRIPT_FILE_PATTERN } from './structural-risk/config.mjs';
import {
  createStructuralRiskReport,
  formatStructuralRiskConsole,
} from './structural-risk/report.mjs';
import { resolveScopedTargetFiles } from '../runtime/target-files.helpers.mjs';
import {
  collectSensitiveEnvironmentValues,
  sanitizeBoundedConsoleOutput,
} from '../runtime/observability/sanitize.mjs';
import { collectChangedTargets } from '../runtime/changed-targets.helpers.mjs';

function resolveStructuralFiles({ files = [] } = {}) {
  const targets = resolveScopedTargetFiles({
    files,
    scope: 'workspace',
    collectFiles: collectCodeFiles,
    relativeFilter: (file) => JAVASCRIPT_FILE_PATTERN.test(file),
  });
  const behavioral = filterImportOrMockOnlyDiffFiles(targets.relativeFiles);
  return [...new Set(behavioral.map(toRelativePath))].sort();
}

function createPreviousSourceResolver(targetFiles) {
  const direct = createHeadFileTextResolver(targetFiles);
  const renameMap = collectRenameSourceByTarget();
  const renameSources = [
    ...new Set(targetFiles.map((file) => renameMap.get(file)).filter(Boolean)),
  ];
  const renamed = createHeadFileTextResolver(renameSources);
  return (relativePath) => direct(relativePath) ?? renamed(renameMap.get(relativePath));
}

function collectPreviousCandidateSources({ enforce, reportScope }) {
  if (!enforce || reportScope !== 'current-diff' || !fs.existsSync('.git')) return [];
  const deletedFiles = collectChangedTargets({ scope: 'workspace' }).deletedFiles.filter(
    (file) => JAVASCRIPT_FILE_PATTERN.test(file) && !isIgnoredRelativePath(file)
  );
  const sources = readHeadFileTexts(deletedFiles);
  return deletedFiles
    .map((file) => ({ file, source: sources.get(file) }))
    .filter(({ source }) => typeof source === 'string');
}

export function runStructuralRiskCheck({
  files = [],
  reportScope = files.length > 0 ? 'preflight-explicit' : 'current-diff',
  enforce = files.length === 0,
  getCurrentSource = readText,
  getPreviousSource,
} = {}) {
  const targetFiles = resolveStructuralFiles({ files });
  const previous = getPreviousSource ?? createPreviousSourceResolver(targetFiles);
  const report = createStructuralRiskReport({
    files: targetFiles,
    getCurrentSource,
    getPreviousSource: previous,
    previousCandidateSources: collectPreviousCandidateSources({ enforce, reportScope }),
    scope: reportScope,
    enforce,
  });
  return {
    skipped: targetFiles.length === 0,
    files: targetFiles,
    report,
    violations: report.violations,
    advisories: report.advisories,
    consoleOutput: formatStructuralRiskConsole(report),
  };
}

export function sanitizeStructuralCliOutput(
  value,
  { repositoryRoot = process.cwd(), sensitiveValues = collectSensitiveEnvironmentValues() } = {}
) {
  return sanitizeBoundedConsoleOutput(value, { repositoryRoot, sensitiveValues });
}

if (isExecutedAsScript(import.meta.url)) {
  const argv = process.argv.slice(2);
  const files = parseFilesArgument(argv);
  const result = runStructuralRiskCheck({ files });
  process.stdout.write(sanitizeStructuralCliOutput(result.consoleOutput));
  if (result.violations.length > 0) process.exit(1);
}
