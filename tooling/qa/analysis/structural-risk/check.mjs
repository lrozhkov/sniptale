import fs from 'node:fs';

import { createHeadFileTextResolver, readHeadFileTexts } from '../git/git-head-sources.mjs';
import {
  collectRenameSourceByTarget,
  filterImportOrMockOnlyDiffFiles,
} from '../imports/import-only-diff/check.mjs';
import { collectCodeFiles } from '../repository/shared-files.mjs';
import { isIgnoredRelativePath, readText, toRelativePath } from '../repository/shared-paths.mjs';
import { isExecutedAsScript, parseFilesArgument } from '../../runtime/process/shared-cli.mjs';
import { JAVASCRIPT_FILE_PATTERN } from './config.mjs';
import { createStructuralRiskReport, formatStructuralRiskConsole } from './report.mjs';
import { resolveScopedTargetFiles } from '../../runtime/scope/target-files.helpers.mjs';
import {
  collectSensitiveEnvironmentValues,
  sanitizeBoundedConsoleOutput,
} from '../../runtime/observability/sanitize.mjs';
import { collectChangedTargets } from '../../runtime/scope/changed-targets.helpers.mjs';
import { applyRepositoryFindingBaseline } from '../../policy/baselines/repository-finding-baseline.mjs';

const REPOSITORY_BASELINE_PATH = 'tooling/configs/qa/structural-risk-repository-baseline.json';

function resolveStructuralFiles({ files = [], scope = 'workspace' } = {}) {
  const targets = resolveScopedTargetFiles({
    files,
    scope,
    collectFiles: collectCodeFiles,
    relativeFilter: (file) => JAVASCRIPT_FILE_PATTERN.test(file),
  });
  const behavioral =
    scope === 'repo-wide'
      ? targets.relativeFiles
      : filterImportOrMockOnlyDiffFiles(targets.relativeFiles);
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
  const repositoryMode = reportScope === 'repository';
  const targetFiles = resolveStructuralFiles({
    files,
    scope: repositoryMode ? 'repo-wide' : 'workspace',
  });
  const previous =
    getPreviousSource ?? (repositoryMode ? () => null : createPreviousSourceResolver(targetFiles));
  const report = createStructuralRiskReport({
    files: targetFiles,
    getCurrentSource,
    getPreviousSource: previous,
    previousCandidateSources: collectPreviousCandidateSources({ enforce, reportScope }),
    scope: reportScope,
    enforce,
  });
  const repositoryBaseline = repositoryMode
    ? applyRepositoryFindingBaseline({
        baselinePath: REPOSITORY_BASELINE_PATH,
        controlId: 'qa.rule.structural-risk',
        findings: report.violations,
      })
    : null;
  return {
    skipped: targetFiles.length === 0,
    files: targetFiles,
    report,
    violations: repositoryBaseline?.violations ?? report.violations,
    advisories: [...report.advisories, ...(repositoryBaseline?.advisories ?? [])],
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
