import fs from 'node:fs';
import path from 'node:path';

import { fromRelativePath } from './shared.mjs';
import { QUALITY_LIMITS } from './quality.config.mjs';
import { OWNER_LOCAL_SCOPES } from './verify-all.scope.mjs';
import { resolveBuildCloseoutScope } from './verify-build.scope.mjs';
import { findCoverageRolloutGroup } from './verify-test-coverage.registry.mjs';
import { resolveCoverageThreshold } from './verify-test-coverage.thresholds.mjs';
import { expandRelatedTestScope } from './unit-test-plan.mjs';

const COVERAGE_HINT_FILE_PATTERN = /\.(?:ts|tsx)$/u;
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:ts|tsx)$/u;
const BROAD_BUILD_SCOPE_FAMILIES = new Set([
  'package-and-app-core',
  'messaging-runtime',
  'storage-persistence',
]);

function collectClusterKeys(targetFiles) {
  return targetFiles.map((file) => {
    const ownerScope = OWNER_LOCAL_SCOPES.find((scope) => file.startsWith(scope.prefix));
    if (ownerScope) return `owner:${ownerScope.name}`;
    const rolloutGroup = findCoverageRolloutGroup(file);
    if (rolloutGroup) return `rollout:${rolloutGroup.id}`;
    if (file.startsWith('tooling/qa/core/')) return 'tooling:quality-gates';
    if (file.startsWith('docs/tooling/')) return 'tooling:docs';
    const segments = file.split('/');
    return segments.slice(0, Math.min(3, segments.length)).join('/');
  });
}

export function summarizeClusterKeys(targetFiles) {
  const counts = new Map();
  for (const key of collectClusterKeys(targetFiles)) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([key, count]) => `${key}=${count}`);
}

function directoryHasAdjacentTests(relativePath) {
  const directory = path.posix.dirname(relativePath);
  const absoluteDirectory = fromRelativePath(directory);
  return (
    directory !== '.' &&
    fs.existsSync(absoluteDirectory) &&
    fs.statSync(absoluteDirectory).isDirectory() &&
    fs.readdirSync(absoluteDirectory).some((entry) => TEST_FILE_PATTERN.test(entry))
  );
}

export function collectCoverageSensitiveHints(codeFiles) {
  const files = codeFiles.filter((file) => resolveCoverageThreshold(file) !== null);
  if (files.length === 0) return [];
  const uncovered = files.filter(
    (file) => COVERAGE_HINT_FILE_PATTERN.test(file) && !directoryHasAdjacentTests(file)
  );
  return [
    `coverage-sensitive seam: ${files.length} file(s) need owner-local diff proof`,
    ...(uncovered.length > 0
      ? [`coverage-sensitive files without adjacent tests: ${uncovered.slice(0, 3).join(', ')}`]
      : []),
  ];
}

export function collectScopeHints(targetFiles, codeFiles) {
  const hints = [];
  const nonCodeFiles = targetFiles.filter((file) => !codeFiles.includes(file));
  if (nonCodeFiles.some((file) => file.startsWith('docs/'))) {
    hints.push(
      `docs changed with code: qa:build stays diff-based, release verify pays full-suite tests (${nonCodeFiles[0]})`
    );
  }
  if (targetFiles.some((file) => file.startsWith('tooling/qa/core/'))) {
    hints.push('wrapper/tooling seam changed: include wrapper-contract and runner tests');
  }
  if (
    codeFiles.some(
      (file) =>
        file.startsWith('packages/') ||
        /^apps\/extension\/src\/(?:composition|contracts|features|foundation|platform|ui|workflows)\//u.test(
          file
        )
    )
  ) {
    hints.push('package or app-core seam changed: include transitive consumer tests');
  }
  return hints;
}

function countFileLines(file) {
  const absolutePath = fromRelativePath(file);
  try {
    return fs.readFileSync(absolutePath, 'utf8').split(/\r?\n/u).length;
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      (error.code === 'ENOENT' || error.code === 'EISDIR')
    ) {
      return 0;
    }
    throw error;
  }
}

function collectRelatedTestBudgetRisks(files) {
  const warningLimit = Math.floor(QUALITY_LIMITS.maxFileLines * 0.8);
  return files
    .filter((file) => TEST_FILE_PATTERN.test(file))
    .map((file) => ({ file, lines: countFileLines(file) }))
    .filter((entry) => entry.lines >= warningLimit)
    .sort((left, right) => right.lines - left.lines || left.file.localeCompare(right.file))
    .slice(0, 6)
    .map((entry) => `related test near size limit: ${entry.file}: ${entry.lines} lines`);
}

export function collectBuildScopeForecast({ targetFiles, codeFiles, addedFiles = [] }) {
  if (targetFiles.length === 0) return { budgetRisks: [], details: [] };
  const { testScope } = resolveBuildCloseoutScope({ targetFiles, codeFiles, addedFiles });
  const selectedUnitFiles =
    testScope.directTestFiles.length > 0
      ? testScope.directTestFiles
      : expandRelatedTestScope(testScope.relatedFiles);
  const selectedScopeDetail = testScope.fullSuite ? 'full-suite' : selectedUnitFiles.length;
  const details = [
    `qa:build forecast: ${testScope.detail}; selected unit-test scope=${selectedScopeDetail}`,
  ];
  const broadFamilies = testScope.matchedFamilies.filter((family) =>
    BROAD_BUILD_SCOPE_FAMILIES.has(family)
  );
  if (testScope.profile === 'related-transitive' && broadFamilies.length > 0) {
    details.push(
      `broad transitive scope expected for ${broadFamilies.join(', ')}: check related mocks and tests before closeout`
    );
  }
  return { budgetRisks: collectRelatedTestBudgetRisks(selectedUnitFiles), details };
}
