import { createFileContentFingerprint } from './file-fingerprint.mjs';
import { collectCodeFiles } from './shared.mjs';

export const QA_SUITES = ['product', 'harness', 'all'];
export const PRODUCT_QA_SUITE = 'product';
export const HARNESS_QA_SUITE = 'harness';
export const ALL_QA_SUITE = 'all';
export const HARNESS_QA_GUIDANCE = [
  'run npm run qa:release-harness for executable tooling/**, QA-affecting root configuration,',
  'hooks, .agents/**, AGENTS.md, or active tooling guidance; generated inventory-only changes',
  'use their owner validators without a fresh harness stamp',
].join(' ');

const JS_LIKE_FILE_PATTERN = /\.(?:ts|tsx|js|mjs|cjs)$/u;
const HARNESS_ROOT_PATTERN = /^tooling\//u;
const HARNESS_INVENTORY_ONLY_FILES = new Set([
  'tooling/configs/qa/oss-release-consumers.data.json',
  'tooling/configs/qa/technical-debt.data.json',
]);
const SHARED_CONTROL_PATTERNS = [/^\.github\/workflows\//u, /^\.husky\//u, /^docs\/tooling\//u];
const VITE_CONFIG_PATTERN = /(?:^|\/)vite\.config\.[cm]?[jt]s$/u;
const SHARED_CONTROL_FILES = new Set([
  '.dependency-cruiser.cjs',
  '.editorconfig',
  '.npmrc',
  '.prettierignore',
  '.prettierrc.json',
  'AGENTS.md',
  'eslint.config.js',
  'package-lock.json',
  'package.json',
  'playwright.config.ts',
  'vitest.config.ts',
]);
export function isSharedControlQaFile(file) {
  const basename = file.slice(file.lastIndexOf('/') + 1);
  const isTypeScriptConfig =
    basename === 'tsconfig.json' ||
    (basename.startsWith('tsconfig.') && basename.endsWith('.json'));
  return (
    SHARED_CONTROL_FILES.has(file) ||
    file.startsWith('.agents/') ||
    SHARED_CONTROL_PATTERNS.some((pattern) => pattern.test(file)) ||
    isTypeScriptConfig ||
    VITE_CONFIG_PATTERN.test(file)
  );
}

export function isHarnessQaFile(file) {
  return HARNESS_ROOT_PATTERN.test(file) || isSharedControlQaFile(file);
}

export function isHarnessInventoryOnlyFile(file) {
  return HARNESS_INVENTORY_ONLY_FILES.has(file);
}

export function isHarnessVerificationQaFile(file) {
  return isHarnessQaFile(file) && !isHarnessInventoryOnlyFile(file);
}

export function isProductQaFile(file) {
  return !isHarnessQaFile(file) || isSharedControlQaFile(file);
}

export function normalizeQaSuite(suite = PRODUCT_QA_SUITE) {
  if (QA_SUITES.includes(suite)) {
    return suite;
  }

  throw new Error(`Unsupported QA suite "${suite}". Expected one of: ${QA_SUITES.join(', ')}`);
}

export function partitionQaScopeFiles(files = []) {
  const productFiles = [];
  const harnessFiles = [];

  for (const file of files) {
    if (isHarnessQaFile(file)) {
      harnessFiles.push(file);
    }
    if (isProductQaFile(file)) {
      productFiles.push(file);
    }
  }

  return {
    productFiles,
    harnessFiles,
  };
}

export function createQaScopeFingerprint(files = []) {
  return createFileContentFingerprint(files);
}

function selectSuiteFiles(suite, partitionedFiles, allFiles) {
  if (suite === HARNESS_QA_SUITE) return partitionedFiles.harnessFiles;
  if (suite === PRODUCT_QA_SUITE) return partitionedFiles.productFiles;
  return allFiles;
}

function collectHarnessInventoryScope(partitionedTargets, partitionedExistingTargets) {
  return {
    harnessInventoryTargetFiles: partitionedTargets.harnessFiles.filter(isHarnessInventoryOnlyFile),
    harnessInventoryExistingTargetFiles: partitionedExistingTargets.harnessFiles.filter(
      isHarnessInventoryOnlyFile
    ),
    harnessVerificationTargetFiles: partitionedTargets.harnessFiles.filter(
      isHarnessVerificationQaFile
    ),
    harnessVerificationExistingTargetFiles: partitionedExistingTargets.harnessFiles.filter(
      isHarnessVerificationQaFile
    ),
  };
}

function collectQualityScope(context, { allTargetFiles, targetFiles, existingTargetFiles }) {
  const targetFileSet = new Set(targetFiles);
  const existingTargetFileSet = new Set(existingTargetFiles);
  const codeFiles = existingTargetFiles.length > 0 ? collectCodeFiles(existingTargetFiles) : [];
  const jsLikeFiles = existingTargetFiles.filter((file) => JS_LIKE_FILE_PATTERN.test(file));
  return {
    codeFiles,
    jsLikeFiles,
    qualityTargetFiles: (context.qualityTargetFiles ?? allTargetFiles).filter((file) =>
      targetFileSet.has(file)
    ),
    qualityCodeFiles: (context.qualityCodeFiles ?? codeFiles).filter((file) =>
      existingTargetFileSet.has(file)
    ),
    qualityJsLikeFiles: (context.qualityJsLikeFiles ?? jsLikeFiles).filter((file) =>
      existingTargetFileSet.has(file)
    ),
  };
}

export function createScopedQaContext(context, { suite = PRODUCT_QA_SUITE } = {}) {
  const resolvedSuite = normalizeQaSuite(suite);
  const allTargetFiles = context.allTargetFiles ?? context.targetFiles ?? [];
  const allExistingTargetFiles =
    context.allExistingTargetFiles ?? context.existingTargetFiles ?? [];
  const allQualityTargetFiles =
    context.allQualityTargetFiles ?? context.qualityTargetFiles ?? allTargetFiles;
  const allQualityCodeFiles =
    context.allQualityCodeFiles ??
    context.qualityCodeFiles ??
    collectCodeFiles(allExistingTargetFiles);
  const allQualityJsLikeFiles =
    context.allQualityJsLikeFiles ??
    context.qualityJsLikeFiles ??
    allExistingTargetFiles.filter((file) => JS_LIKE_FILE_PATTERN.test(file));
  const partitionedTargets = partitionQaScopeFiles(allTargetFiles);
  const partitionedExistingTargets = partitionQaScopeFiles(allExistingTargetFiles);
  const inventoryScope = collectHarnessInventoryScope(
    partitionedTargets,
    partitionedExistingTargets
  );
  const targetFiles = selectSuiteFiles(resolvedSuite, partitionedTargets, allTargetFiles);
  const existingTargetFiles = selectSuiteFiles(
    resolvedSuite,
    partitionedExistingTargets,
    allExistingTargetFiles
  );
  const qualityScope = collectQualityScope(context, {
    allTargetFiles,
    targetFiles,
    existingTargetFiles,
  });

  return {
    ...context,
    suite: resolvedSuite,
    allTargetFiles,
    allExistingTargetFiles,
    allQualityTargetFiles,
    allQualityCodeFiles,
    allQualityJsLikeFiles,
    allFingerprint: createQaScopeFingerprint(allTargetFiles),
    productTargetFiles: partitionedTargets.productFiles,
    productExistingTargetFiles: partitionedExistingTargets.productFiles,
    harnessTargetFiles: partitionedTargets.harnessFiles,
    harnessExistingTargetFiles: partitionedExistingTargets.harnessFiles,
    ...inventoryScope,
    harnessFingerprint: createQaScopeFingerprint(inventoryScope.harnessVerificationTargetFiles),
    targetFiles,
    existingTargetFiles,
    ...qualityScope,
    fingerprint: createQaScopeFingerprint(targetFiles),
  };
}

export function hasHarnessQaTargets(context) {
  return (context.harnessTargetFiles ?? []).length > 0;
}

export function hasHarnessVerificationQaTargets(context) {
  return (context.harnessVerificationTargetFiles ?? context.harnessTargetFiles ?? []).length > 0;
}
