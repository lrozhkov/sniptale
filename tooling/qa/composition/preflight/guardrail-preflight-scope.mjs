import fs from 'node:fs';
import path from 'node:path';

import { fromRelativePath } from '../../analysis/repository/shared-paths.mjs';
import { OWNER_LOCAL_SCOPES } from '../repository/full-verification/scope.mjs';
import { findCoverageRolloutGroup } from '../../proof/coverage/test-coverage/registry.mjs';
import { resolveCoverageThreshold } from '../../proof/coverage/test-coverage/thresholds.mjs';
import { isProductQaFile } from '../scope/qa-scope.mjs';

const COVERAGE_HINT_FILE_PATTERN = /\.[cm]?[jt]sx?$/u;
const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;

function collectClusterKeys(targetFiles) {
  return targetFiles.map((file) => {
    const ownerScope = OWNER_LOCAL_SCOPES.find((scope) => file.startsWith(scope.prefix));
    if (ownerScope) return `owner:${ownerScope.name}`;
    const rolloutGroup = findCoverageRolloutGroup(file);
    if (rolloutGroup) return `rollout:${rolloutGroup.id}`;
    if (file.startsWith('tooling/qa/')) return 'tooling:quality-gates';
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
  if (targetFiles.some((file) => file.startsWith('tooling/qa/'))) {
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

export function collectBuildScopeForecast({ targetFiles }) {
  if (targetFiles.length === 0) return { details: [] };
  const productTargets = targetFiles.filter(isProductQaFile);
  return {
    details: [
      productTargets.length > 0
        ? 'qa:build forecast: fresh checkpoint reused; production artifact build required'
        : 'qa:build forecast: control-only diff; artifact build skipped',
    ],
  };
}
