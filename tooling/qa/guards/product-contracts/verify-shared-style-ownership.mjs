/**
 * Package style ownership guardrail.
 * Keeps reusable styles in the UI package and out of lower-layer packages.
 */

import { collectCodeFiles } from '../../analysis/repository/shared-files.mjs';
import { isExecutedAsScript, printViolations } from '../../runtime/process/shared-cli.mjs';
import { toRelativePathForRoot } from '../../analysis/repository/repo-root-relative-path.mjs';

const PACKAGE_SOURCE_PATTERN = /^packages\/[^/]+\/src\//u;
const SHARED_STYLE_OWNER_PATTERN = /^packages\/ui\/src\//u;
const SHARED_STYLE_FILE_PATTERNS = [
  /\.css$/u,
  /(?:^|\/)(?:styles|[^/]+\.styles)\.[cm]?[jt]sx?$/u,
  /(?:^|\/)(?:styles|[^/]+-styles)\.data\.[cm]?[jt]sx?$/u,
];
const OWNER_FILE_PATTERN =
  /^tooling\/qa\/guards\/product-contracts\/verify-shared-style-ownership(?:\.test)?\.[cm]?[jt]sx?$/u;

function createViolation(rule, file, message) {
  return { rule, file, message };
}

function isAllowedSharedStyle(relativePath) {
  return SHARED_STYLE_OWNER_PATTERN.test(relativePath);
}

export function isSharedStyleOwnershipCandidate(relativePath) {
  return (
    PACKAGE_SOURCE_PATTERN.test(relativePath) &&
    SHARED_STYLE_FILE_PATTERNS.some((pattern) => pattern.test(relativePath))
  );
}

export function isSharedStyleOwnershipTrigger(relativePath) {
  return isSharedStyleOwnershipCandidate(relativePath) || OWNER_FILE_PATTERN.test(relativePath);
}

export function collectSharedStyleOwnershipViolations(files) {
  return collectSharedStyleOwnershipViolationsWithOptions(files);
}

export function collectSharedStyleOwnershipViolationsWithOptions(files, { root = null } = {}) {
  const violations = [];

  for (const filePath of files) {
    const relativePath = toRelativePathForRoot(filePath, root);
    if (!isSharedStyleOwnershipCandidate(relativePath)) {
      continue;
    }

    if (!isAllowedSharedStyle(relativePath)) {
      violations.push(
        createViolation(
          'shared-style-ownership',
          relativePath,
          [
            'Move feature-specific styling to the owning app surface',
            'or expose reusable styling through packages/ui.',
          ].join(' ')
        )
      );
    }
  }

  return violations;
}

export function runSharedStyleOwnershipCheck({ files = [], root = null } = {}) {
  const targetFiles = files.length > 0 ? files : collectCodeFiles();
  return {
    files: targetFiles.map((file) => toRelativePathForRoot(file, root)),
    violations: collectSharedStyleOwnershipViolationsWithOptions(targetFiles, { root }),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runSharedStyleOwnershipCheck();

  if (result.violations.length > 0) {
    printViolations('Shared style ownership guardrail violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Shared style ownership guardrail passed\n');
}
