import fs from 'node:fs';
import path from 'node:path';

import { collectCodeFiles, isExecutedAsScript } from './shared.mjs';
import { resolveScopedTargetFiles } from '../runtime/target-files.helpers.mjs';
import { collectRenameSourceByTarget, isImportOrMockOnlyDiffFile } from './import-only-diff.mjs';
import { collectChangedTargets } from '../runtime/changed-targets.helpers.mjs';
import { runScopedRuleCli } from './scoped-rule-cli.mjs';
import { isProductSourcePath, normalizeRepoSrcPath } from './src-production-targets.mjs';
import { readHeadFileTexts } from './git-head-sources.mjs';

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const DOMAIN_TYPE_PATTERN =
  '(?:VideoProject|ScenarioProject|VideoProjectEntry|ScenarioProjectEntry|' +
  'WebSnapshotRecord|RuntimeMessage|Process\\w+Message|Save\\w+Message|' +
  'Backup\\w+Manifest|MediaHubBackupMetadata)';
const DOMAIN_CAST_PATTERN = new RegExp(
  `\\bas\\s+(?:never|unknown\\s+as|${DOMAIN_TYPE_PATTERN}\\b)`,
  'u'
);
const INTENTIONAL_INVALID_PATTERN = /\b(?:invalid|malformed|boundary|corrupt|broken)\b/iu;
// QA_RULE_CONTRACT_REQUIRED: true

function normalizePath(filePath) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const relativePath = path.relative(process.cwd(), absolutePath).replaceAll(path.sep, '/');
  return normalizeRepoSrcPath(relativePath);
}

function isTestFile(file) {
  return TEST_FILE_PATTERN.test(file);
}

function collectTestFiles(explicitFiles = []) {
  return collectCodeFiles(explicitFiles).filter(isTestFile);
}

function createViolation(rule, file, line, message) {
  return { rule, file, line, message };
}

function hasInvalidFixtureIntentPath(relativePath) {
  return INTENTIONAL_INVALID_PATTERN.test(relativePath);
}

function hasInvalidFixtureIntentNearLine(lines, index) {
  const start = Math.max(0, index - 2);
  for (let lineIndex = start; lineIndex <= index; lineIndex += 1) {
    if (INTENTIONAL_INVALID_PATTERN.test(lines[lineIndex] ?? '')) {
      return true;
    }
  }
  return false;
}

function shouldCheckLine(relativePath, lineNumber, context) {
  if (!context?.changedLineMap) {
    return true;
  }
  if (context.addedFiles?.has(relativePath) || context.untrackedFiles?.has(relativePath)) {
    return true;
  }
  const changedLines = context.changedLineMap.get(relativePath);
  return changedLines == null ? true : changedLines.has(lineNumber);
}

function collectSourceViolations(relativePath, source, context) {
  const violations = [];
  if (hasInvalidFixtureIntentPath(relativePath)) {
    return violations;
  }
  const lines = source.split(/\r?\n/u);
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (
      !shouldCheckLine(relativePath, lineNumber, context) ||
      !DOMAIN_CAST_PATTERN.test(line) ||
      hasInvalidFixtureIntentNearLine(lines, index)
    ) {
      return;
    }
    violations.push(
      createViolation(
        'domain-fixture-realism',
        relativePath,
        lineNumber,
        [
          'Valid domain fixtures should use builders/factories instead of broad casts;',
          'reserve casts for explicit malformed-boundary tests.',
        ].join(' ')
      )
    );
  });
  return violations;
}

export function collectDomainFixtureRealismViolations(files, context = {}) {
  return files.flatMap((file) => {
    const relativePath = normalizePath(file);
    if (!isProductSourcePath(relativePath) || !isTestFile(relativePath)) {
      return [];
    }
    return collectSourceViolations(relativePath, fs.readFileSync(file, 'utf8'), context);
  });
}

function countPreviousViolations(relativePath) {
  const renameSource = collectRenameSourceByTarget().get(relativePath);
  const paths = renameSource ? [renameSource, relativePath] : [relativePath];
  const sources = readHeadFileTexts(paths);
  const source = (renameSource ? sources.get(renameSource) : null) ?? sources.get(relativePath);
  return source == null ? 0 : collectSourceViolations(relativePath, source, {}).length;
}

function filterNetNewWorkspaceViolations(targetFiles, changedTargets) {
  const currentViolations = collectDomainFixtureRealismViolations(targetFiles);
  const changedViolations = collectDomainFixtureRealismViolations(targetFiles, {
    addedFiles: new Set(changedTargets.addedFiles),
    changedLineMap: changedTargets.changedLineMap,
    untrackedFiles: changedTargets.untrackedFiles,
  });
  const excessByFile = new Map();
  for (const file of targetFiles) {
    const relativePath = normalizePath(file);
    const currentCount = currentViolations.filter(
      (violation) => violation.file === relativePath
    ).length;
    excessByFile.set(
      relativePath,
      Math.max(0, currentCount - countPreviousViolations(relativePath))
    );
  }
  return changedViolations.filter((violation) => {
    const excess = excessByFile.get(violation.file) ?? 0;
    excessByFile.set(violation.file, Math.max(0, excess - 1));
    return excess > 0;
  });
}

export function runDomainFixtureRealismCheck({ files = [], scope = 'workspace' } = {}) {
  const changedTargets = scope === 'repo-wide' ? null : collectChangedTargets({ scope });
  const targets = resolveScopedTargetFiles({
    collectFiles: collectTestFiles,
    files,
    scope,
  });
  const relativeFiles =
    scope === 'repo-wide'
      ? targets.relativeFiles
      : targets.relativeFiles.filter((file) => !isImportOrMockOnlyDiffFile(file));
  const targetFiles = relativeFiles.map((file) => path.join(process.cwd(), file));
  return {
    skipped: targetFiles.length === 0,
    files: relativeFiles,
    violations:
      changedTargets == null
        ? collectDomainFixtureRealismViolations(targetFiles)
        : filterNetNewWorkspaceViolations(targetFiles, changedTargets),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  process.exitCode = runScopedRuleCli({
    messages: {
      blockingViolations: 'Domain fixture realism violations found:',
      repoWidePassed: 'Domain fixture realism repo-wide guard passed\n',
      repoWideSkipped: 'Domain fixture realism repo-wide check skipped: no test files\n',
      reportViolations: 'Domain fixture realism report found violations:',
      workspacePassed: 'Domain fixture realism guard passed\n',
      workspaceSkipped: 'Domain fixture realism check skipped: no changed test files\n',
    },
    runCheck: runDomainFixtureRealismCheck,
  });
}
