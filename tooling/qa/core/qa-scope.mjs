import { createFileContentFingerprint } from './file-fingerprint.mjs';
import { collectCodeFiles } from './shared.mjs';

export const QA_SUITES = ['product', 'harness', 'all'];
export const PRODUCT_QA_SUITE = 'product';
export const HARNESS_QA_SUITE = 'harness';
export const ALL_QA_SUITE = 'all';
export const HARNESS_QA_GUIDANCE = [
  'run npm run qa:release-harness for tooling/**, QA-affecting root configuration,',
  'hooks, .agents/**, AGENTS.md, or active tooling guidance',
].join(' ');

const JS_LIKE_FILE_PATTERN = /\.(?:ts|tsx|js|mjs|cjs)$/u;
const HARNESS_ROOT_PATTERN = /^tooling\//u;
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

export function createScopedQaContext(context, { suite = PRODUCT_QA_SUITE } = {}) {
  const resolvedSuite = normalizeQaSuite(suite);
  const allTargetFiles = context.allTargetFiles ?? context.targetFiles ?? [];
  const allExistingTargetFiles =
    context.allExistingTargetFiles ?? context.existingTargetFiles ?? [];
  const partitionedTargets = partitionQaScopeFiles(allTargetFiles);
  const partitionedExistingTargets = partitionQaScopeFiles(allExistingTargetFiles);
  const targetFiles =
    resolvedSuite === HARNESS_QA_SUITE
      ? partitionedTargets.harnessFiles
      : resolvedSuite === PRODUCT_QA_SUITE
        ? partitionedTargets.productFiles
        : allTargetFiles;
  const existingTargetFiles =
    resolvedSuite === HARNESS_QA_SUITE
      ? partitionedExistingTargets.harnessFiles
      : resolvedSuite === PRODUCT_QA_SUITE
        ? partitionedExistingTargets.productFiles
        : allExistingTargetFiles;

  return {
    ...context,
    suite: resolvedSuite,
    allTargetFiles,
    allExistingTargetFiles,
    allFingerprint: createQaScopeFingerprint(allTargetFiles),
    productTargetFiles: partitionedTargets.productFiles,
    productExistingTargetFiles: partitionedExistingTargets.productFiles,
    harnessTargetFiles: partitionedTargets.harnessFiles,
    harnessExistingTargetFiles: partitionedExistingTargets.harnessFiles,
    harnessFingerprint: createQaScopeFingerprint(partitionedTargets.harnessFiles),
    targetFiles,
    existingTargetFiles,
    codeFiles: existingTargetFiles.length > 0 ? collectCodeFiles(existingTargetFiles) : [],
    jsLikeFiles: existingTargetFiles.filter((file) => JS_LIKE_FILE_PATTERN.test(file)),
    fingerprint: createQaScopeFingerprint(targetFiles),
  };
}

export function hasHarnessQaTargets(context) {
  return (context.harnessTargetFiles ?? []).length > 0;
}
