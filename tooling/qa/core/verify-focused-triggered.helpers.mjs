import {
  CANONICAL_FACADE_TRIGGER_FILES,
  DEPENDENCY_GRAPH_TRIGGER_FILES,
  DEPENDENCY_GRAPH_TRIGGER_PATTERNS,
  DESIGN_SYSTEM_TRIGGER_PATTERNS,
  EXPORT_ARTIFACT_BOUNDARY_TRIGGER_PATTERNS,
  HEAVY_RUNTIME_IMPORT_TRIGGER_PATTERNS,
  MANIFEST_INTEGRITY_TRIGGER_FILES,
  SECURITY_DATA_TRIGGER_PATTERNS,
  SHARED_STYLE_TRIGGER_PATTERNS,
  SRC_SOURCE_PATTERN,
  STORAGE_WRITE_PATTERN_TRIGGER_PATTERNS,
  UI_I18N_FULL_TRIGGER_PATTERNS,
} from './verify-focused.config.mjs';
import {
  collectLiveProductI18nFiles,
  isFullI18nScanTrigger,
  isLiveProductI18nFile,
} from './verify-i18n.helpers.mjs';
import { collectChangedOwnerFacadeFiles } from './verify-canonical-facades.mjs';

export const FOCUSED_TRIGGERED_STEP_DEFINITIONS = [
  { label: 'Runtime topology', tool: 'verify-runtime-topology.mjs' },
  { label: 'Manifest permissions', tool: 'verify-manifest-permissions.mjs' },
  { label: 'Config policy', tool: 'verify-config-policy.mjs' },
  { label: 'Dependency admission', tool: 'verify-dependency-admission.mjs' },
  { label: 'Secret storage', tool: 'verify-secret-storage.mjs' },
  { label: 'Sensitive retention', tool: 'verify-sensitive-retention.mjs' },
  { label: 'Fetch ownership', tool: 'verify-fetch-ownership.mjs' },
  { label: 'Diagnostic sanitization', tool: 'verify-diagnostic-sanitization.mjs' },
  { label: 'Manifest integrity', tool: 'verify-manifest-integrity.mjs' },
  { label: 'Heavy runtime imports', tool: 'verify-heavy-runtime-import-ownership.mjs' },
  { label: 'Canonical facades', tool: 'verify-canonical-facades.mjs' },
  { label: 'Root side effects', tool: 'verify-root-side-effects.mjs' },
  { label: 'Package boundaries', tool: 'verify-package-boundaries.mjs' },
  { label: 'App-core owners', tool: 'verify-app-core-owners.mjs' },
  { label: 'Target-only paths', tool: 'verify-target-only-paths.mjs' },
  { label: 'OSS release surface', tool: 'verify-oss-release-surface.mjs' },
  { label: 'Shared style ownership', tool: 'verify-shared-style-ownership.mjs' },
  { label: 'Root scatter', tool: 'verify-root-scatter.mjs' },
  { label: 'Storage write patterns', tool: 'verify-storage-write-patterns.mjs' },
  { label: 'Export artifact boundaries', tool: 'verify-export-artifact-boundaries.mjs' },
  { label: 'i18n', tool: 'verify-i18n.mjs' },
  { label: 'Design system', tool: 'verify-design-system.mjs' },
  { label: 'Dependency boundaries', tool: 'verify-boundaries.mjs' },
  { label: 'Cycles', tool: 'verify-cycles.mjs' },
  { label: 'Typecheck', tool: 'verify-typecheck.mjs' },
];

function matchesTrigger(file, { files = null, patterns = [] }) {
  return files?.has(file) || patterns.some((pattern) => pattern.test(file));
}

function collectTriggeredFiles(files, trigger) {
  return files.filter((file) => matchesTrigger(file, trigger));
}

function hasTriggeredFiles(files, trigger) {
  return files.some((file) => matchesTrigger(file, trigger));
}

export function collectFocusedSecurityDataFiles(jsLikeFiles) {
  return collectTriggeredFiles(jsLikeFiles, { patterns: SECURITY_DATA_TRIGGER_PATTERNS });
}

export function collectFocusedHeavyRuntimeImportFiles(jsLikeFiles) {
  return collectTriggeredFiles(jsLikeFiles, { patterns: HEAVY_RUNTIME_IMPORT_TRIGGER_PATTERNS });
}

export function collectFocusedSharedStyleFiles(targetFiles) {
  return collectTriggeredFiles(targetFiles, { patterns: SHARED_STYLE_TRIGGER_PATTERNS });
}

export function collectFocusedStorageWritePatternFiles(jsLikeFiles) {
  return collectTriggeredFiles(jsLikeFiles, { patterns: STORAGE_WRITE_PATTERN_TRIGGER_PATTERNS });
}

export function collectFocusedExportArtifactBoundaryFiles(jsLikeFiles) {
  return collectTriggeredFiles(jsLikeFiles, {
    patterns: EXPORT_ARTIFACT_BOUNDARY_TRIGGER_PATTERNS,
  });
}

export function shouldRunManifestIntegrity(targetFiles) {
  return (
    hasTriggeredFiles(targetFiles, { files: MANIFEST_INTEGRITY_TRIGGER_FILES }) ||
    targetFiles.some((file) => file.startsWith('apps/extension/public/'))
  );
}

export function shouldRunConfigPolicy(targetFiles) {
  return targetFiles.some(
    (file) =>
      [
        'package.json',
        'package-lock.json',
        'apps/extension/package.json',
        'apps/extension/manifest.json',
        'apps/extension/build/layout.data.json',
        'tsconfig.json',
        'tsconfig.node.json',
        'tooling/qa/core/verify-config-policy.mjs',
        'apps/extension/vite.config.ts',
      ].includes(file) || file.startsWith('apps/extension/build/')
  );
}

export function shouldRunDependencyAdmission(targetFiles) {
  return targetFiles.some((file) =>
    [
      'package.json',
      'package-lock.json',
      'apps/extension/package.json',
      'tooling/configs/qa/dependency-policy-rules.data.json',
      'tooling/configs/qa/licenses.json',
      'tooling/qa/guards/security/verify-dependency-admission.mjs',
      'tooling/qa/policy/dependency-policy-rules.mjs',
    ].includes(file)
  );
}

export function shouldRunCanonicalFacades(targetFiles) {
  return (
    hasTriggeredFiles(targetFiles, { files: CANONICAL_FACADE_TRIGGER_FILES }) ||
    targetFiles.some((file) => SRC_SOURCE_PATTERN.test(file) && /\.[cm]?[jt]sx?$/u.test(file)) ||
    collectChangedOwnerFacadeFiles(targetFiles).length > 0
  );
}

export function collectFocusedI18nFiles(targetFiles) {
  const changedScopedFiles = targetFiles.filter((file) => isLiveProductI18nFile(file));
  if (changedScopedFiles.length > 0) {
    return changedScopedFiles;
  }

  if (
    hasTriggeredFiles(targetFiles, { patterns: UI_I18N_FULL_TRIGGER_PATTERNS }) ||
    targetFiles.some((file) => isFullI18nScanTrigger(file))
  ) {
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
