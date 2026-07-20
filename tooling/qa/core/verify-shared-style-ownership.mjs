/**
 * Package style ownership guardrail.
 * Keeps reusable styles in the UI package and out of lower-layer packages.
 */

import { collectCodeFiles, isExecutedAsScript, printViolations } from './shared.mjs';
import { toRelativePathForRoot } from './repo-root-relative-path.mjs';

function createViolation(rule, file, message) {
  return { rule, file, message };
}

function isAllowedSharedStyle(relativePath) {
  return relativePath.startsWith('packages/ui/src/');
}

function isSharedStyleFile(relativePath) {
  if (!relativePath.startsWith('packages/')) {
    return false;
  }

  return (
    relativePath.endsWith('.css') ||
    relativePath.endsWith('.styles.ts') ||
    relativePath.endsWith('.styles.tsx') ||
    (relativePath.includes('/glass-popover/') && relativePath.endsWith('.data.ts'))
  );
}

export function collectSharedStyleOwnershipViolations(files) {
  return collectSharedStyleOwnershipViolationsWithOptions(files);
}

export function collectSharedStyleOwnershipViolationsWithOptions(files, { root = null } = {}) {
  const violations = [];

  for (const filePath of files) {
    const relativePath = toRelativePathForRoot(filePath, root);
    if (!isSharedStyleFile(relativePath)) {
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
