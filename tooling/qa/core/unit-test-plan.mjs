import fs from 'node:fs';
import path from 'node:path';

import { fromRelativePath } from './shared.mjs';
import { requiresRelatedUnitTests } from './verify-test-coverage.thresholds.mjs';

const SOURCE_EXTENSION_PATTERN = /\.(?:ts|tsx|js|mjs|cjs)$/u;
const TEST_SUFFIXES = ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'];

function ownerLocalTestCandidates(file) {
  const extension = path.posix.extname(file);
  if (!SOURCE_EXTENSION_PATTERN.test(file) || file.includes('.test.') || file.includes('.spec.')) {
    return [];
  }
  const base = extension ? file.slice(0, -extension.length) : file;
  return TEST_SUFFIXES.map((suffix) => `${base}${suffix}`);
}

function collectOwnerLocalTestFiles(relatedFiles = []) {
  const tests = new Set();
  for (const file of relatedFiles) {
    for (const candidate of ownerLocalTestCandidates(file)) {
      if (fs.existsSync(fromRelativePath(candidate))) tests.add(candidate);
    }
  }
  return [...tests].sort();
}

/** Related runs include exact owner-local tests; Vitest resolves broader import consumers itself. */
export function expandRelatedTestScope(relatedFiles = []) {
  return [...new Set([...relatedFiles, ...collectOwnerLocalTestFiles(relatedFiles)])];
}

export function createUnitTestPlan({ relatedFiles = [], coverage = false } = {}) {
  const expandedRelatedFiles = expandRelatedTestScope(relatedFiles);
  return {
    mode: expandedRelatedFiles.length > 0 ? 'related' : 'full-suite',
    relatedFiles: [...relatedFiles],
    expandedRelatedFiles,
    allowNoTests: !requiresRelatedUnitTests(expandedRelatedFiles),
    coverage,
  };
}
