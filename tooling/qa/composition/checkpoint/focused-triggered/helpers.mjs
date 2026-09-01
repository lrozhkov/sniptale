import {
  DEPENDENCY_GRAPH_TRIGGER_FILES,
  DEPENDENCY_GRAPH_TRIGGER_PATTERNS,
  DESIGN_SYSTEM_TRIGGER_PATTERNS,
  HEAVY_RUNTIME_IMPORT_TRIGGER_PATTERNS,
  MANIFEST_INTEGRITY_TRIGGER_FILES,
  SECURITY_DATA_FULL_CLOSURE_TRIGGER_PATTERNS,
  SECURITY_DATA_TRIGGER_PATTERNS,
} from '../focused/config.mjs';
import { collectCodeFiles } from '../../../analysis/repository/shared-files.mjs';
import {
  collectLiveProductI18nFiles,
  isFullI18nScanTrigger,
  isLiveProductI18nFile,
} from '../../../guards/product-contracts/verify-i18n.helpers.mjs';
import { isSharedStyleOwnershipTrigger } from '../../../guards/product-contracts/verify-shared-style-ownership.mjs';
import { collectQaOccurrences } from '../../catalog/catalog.mjs';
import { isDependencyAdmissionInputPath } from '../../../guards/security/verify-dependency-admission.mjs';

export const FOCUSED_TRIGGERED_STEP_DEFINITIONS = collectQaOccurrences({
  lane: 'focused-triggered',
}).map(({ id, label, tool }) => ({ id, label, tool }));

function matchesTrigger(file, { files = null, patterns = [] }) {
  return files?.has(file) || patterns.some((pattern) => pattern.test(file));
}

function collectTriggeredFiles(files, trigger) {
  return files.filter((file) => matchesTrigger(file, trigger));
}

function hasTriggeredFiles(files, trigger) {
  return files.some((file) => matchesTrigger(file, trigger));
}

export function collectFocusedSecurityDataFiles(
  targetFiles,
  { collectAllCodeFiles = collectCodeFiles } = {}
) {
  if (hasTriggeredFiles(targetFiles, { patterns: SECURITY_DATA_FULL_CLOSURE_TRIGGER_PATTERNS })) {
    return collectAllCodeFiles();
  }
  return collectTriggeredFiles(targetFiles, { patterns: SECURITY_DATA_TRIGGER_PATTERNS });
}

export function collectFocusedHeavyRuntimeImportFiles(jsLikeFiles) {
  return collectTriggeredFiles(jsLikeFiles, { patterns: HEAVY_RUNTIME_IMPORT_TRIGGER_PATTERNS });
}

export function collectFocusedSharedStyleFiles(targetFiles) {
  return targetFiles.filter(isSharedStyleOwnershipTrigger);
}

export function shouldRunManifestIntegrity(targetFiles) {
  return (
    hasTriggeredFiles(targetFiles, { files: MANIFEST_INTEGRITY_TRIGGER_FILES }) ||
    targetFiles.some((file) => file.startsWith('apps/extension/public/'))
  );
}

export function shouldRunConfigPolicy(targetFiles) {
  return targetFiles.some((file) =>
    [
      '.nvmrc',
      '.npmrc',
      'package.json',
      'package-lock.json',
      'apps/extension/manifest.json',
      'tsconfig.json',
      'tsconfig.node.json',
      'tooling/qa/guards/product-contracts/config/config-policy/check.mjs',
      'apps/extension/vite.config.ts',
    ].includes(file)
  );
}

export function shouldRunExtensionBuildLayout(targetFiles) {
  return targetFiles.some(
    (file) =>
      [
        'package.json',
        'apps/extension/package.json',
        'apps/extension/vite.config.ts',
        'packages/ui/src/styles/tailwind.css',
        'tooling/qa/guards/product-contracts/build-layout/extension-build-layout-policy.mjs',
        'tooling/qa/guards/product-contracts/extension-build/verify-extension-build-layout.mjs',
      ].includes(file) || file.startsWith('apps/extension/build/')
  );
}

export function shouldRunDependencyAdmission(targetFiles) {
  return targetFiles.some(isDependencyAdmissionInputPath);
}

export function collectFocusedI18nFiles(targetFiles) {
  const changedScopedFiles = targetFiles.filter((file) => isLiveProductI18nFile(file));
  if (changedScopedFiles.length > 0) {
    return changedScopedFiles;
  }

  if (targetFiles.some((file) => isFullI18nScanTrigger(file))) {
    return collectLiveProductI18nFiles();
  }

  return [];
}

export function shouldRunDesignSystem(targetFiles) {
  return hasTriggeredFiles(targetFiles, { patterns: DESIGN_SYSTEM_TRIGGER_PATTERNS });
}

export function shouldRunDependencyGraph(targetFiles) {
  return hasTriggeredFiles(targetFiles, {
    files: DEPENDENCY_GRAPH_TRIGGER_FILES,
    patterns: DEPENDENCY_GRAPH_TRIGGER_PATTERNS,
  });
}

export function shouldRunFocusedTypecheck(jsLikeFiles) {
  return jsLikeFiles.some((file) => /\.(?:ts|tsx|cts|mts)$/u.test(file));
}
