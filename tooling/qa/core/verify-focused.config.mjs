const PRIMARY_RUNTIME_SOURCE_PATTERN =
  /^src\/(?:background|content|popup|settings|gallery|design-system)\//u;
const SECONDARY_RUNTIME_SOURCE_PATTERN =
  /^src\/(?:editor|video-editor|offscreen|scenario-editor|web-snapshot-viewer)\//u;
const APP_RUNTIME_SOURCE_PATTERN = /^apps\/extension\/src\/[^/]+\//u;

export const RUNTIME_SOURCE_PATTERN = {
  test(file) {
    return (
      PRIMARY_RUNTIME_SOURCE_PATTERN.test(file) ||
      SECONDARY_RUNTIME_SOURCE_PATTERN.test(file) ||
      APP_RUNTIME_SOURCE_PATTERN.test(file)
    );
  },
};

export const SRC_SOURCE_PATTERN = /^(?:apps\/extension\/src|packages\/[^/]+\/src)\//u;

export const RUNTIME_TOPOLOGY_TRIGGER_FILES = new Set([
  'AGENTS.md',
  '.dependency-cruiser.cjs',
  'DESIGN.md',
  'docs/architecture/code-organization.md',
  'docs/architecture/runtime-contexts.md',
  'docs/tooling/code-quality.md',
  'docs/tooling/operator-handbook.md',
  'tooling/qa/core/runtime-topology.data.json',
  'tooling/qa/core/runtime-topology.mjs',
  'tooling/qa/guards/architecture/verify-runtime-topology.mjs',
  'apps/extension/manifest.json',
]);

export const MANIFEST_PERMISSION_TRIGGER_FILES = new Set([
  'tooling/configs/qa/manifest-permissions.data.json',
  'tooling/qa/guards/architecture/verify-manifest-permissions.mjs',
  'apps/extension/manifest.json',
]);

export const SECURITY_DATA_TRIGGER_PATTERNS = [
  /^src\/(?:background|content|shared|settings|popup|gallery)\//u,
  /^src\/(?:editor|video-editor|offscreen|scenario-editor|web-snapshot-viewer)\//u,
  APP_RUNTIME_SOURCE_PATTERN,
  /^tooling\/configs\/qa\/security-(?:network|storage)-ownership\.data\.json$/u,
  /^tooling\/qa\/guards\/security\/verify-(?:secret-storage|sensitive-retention)\.mjs$/u,
  /^tooling\/qa\/guards\/security\/verify-(?:fetch-ownership|diagnostic-sanitization)\.mjs$/u,
  /^tooling\/qa\/guards\/security\/helpers\/.+\.mjs$/u,
  /^tooling\/qa\/guards\/security\/security-policy-utils\.mjs$/u,
];

export const HEAVY_RUNTIME_IMPORT_TRIGGER_PATTERNS = [
  SRC_SOURCE_PATTERN,
  /^tooling\/qa\/core\/verify-heavy-runtime-import-ownership\.mjs$/u,
];

export const SHARED_STYLE_TRIGGER_PATTERNS = [
  /^packages\/ui\/src\//u,
  /^apps\/extension\/src\/ui\//u,
  /^tooling\/qa\/core\/verify-shared-style-ownership\.mjs$/u,
];

export const STORAGE_WRITE_PATTERN_TRIGGER_PATTERNS = [
  /^apps\/extension\/src\/composition\/persistence\/storage\/.+\.[cm]?[jt]sx?$/u,
  /^src\/settings\/sections\/.+\/actions\.[cm]?[jt]sx?$/u,
  /^src\/settings\/sections\/.+\/actions\/.+\.[cm]?[jt]sx?$/u,
  /^apps\/extension\/src\/settings\/sections\/.+\/actions\.[cm]?[jt]sx?$/u,
  /^apps\/extension\/src\/settings\/sections\/.+\/actions\/.+\.[cm]?[jt]sx?$/u,
  /^apps\/extension\/src\/composition\/persistence\/db\/.+\.[cm]?[jt]sx?$/u,
  /^tooling\/qa\/core\/verify-storage-write-patterns(?:\.helpers)?\.mjs$/u,
];

export const EXPORT_ARTIFACT_BOUNDARY_TRIGGER_PATTERNS = [
  /^apps\/extension\/src\/content\/logic\/export-manager\/.+\.[cm]?[jt]sx?$/u,
  /^tooling\/qa\/core\/verify-export-artifact-boundaries\.mjs$/u,
];

export const MANIFEST_INTEGRITY_TRIGGER_FILES = new Set([
  'tooling/qa/core/verify-manifest-integrity.mjs',
  'apps/extension/src/background/media/video/runtime/offscreen-document-dto.ts',
  'apps/extension/manifest.json',
  'apps/extension/vite.config.ts',
  'apps/extension/build/layout.data.json',
]);

export const CANONICAL_FACADE_FILES = [];

export const CANONICAL_FACADE_TRIGGER_FILES = new Set([
  ...CANONICAL_FACADE_FILES,
  'tooling/qa/core/verify-canonical-facades.mjs',
]);

export const UI_I18N_FULL_TRIGGER_PATTERNS = [
  /^apps\/extension\/src\/platform\/i18n\//u,
  /^packages\/platform\/src\/i18n\//u,
  APP_RUNTIME_SOURCE_PATTERN,
  /^tooling\/qa\/core\/verify-i18n(?:\.helpers)?\.mjs$/u,
  /^tooling\/qa\/core\/verify-focused(?:\.config|-triggered\.helpers)?\.mjs$/u,
];

export const DESIGN_SYSTEM_TRIGGER_PATTERNS = [
  ...UI_I18N_FULL_TRIGGER_PATTERNS,
  /^src\/design-system\/.*\.(?:ts|tsx|css)$/u,
  /^src\/(?:popup|settings|gallery|content|editor)\/.*\.(?:ts|tsx|css)$/u,
  /^src\/(?:video-editor|scenario-editor|web-snapshot-viewer)\/.*\.(?:ts|tsx|css)$/u,
  /^apps\/extension\/src\/.*\.(?:ts|tsx|css)$/u,
  /^tooling\/qa\/core\/verify-design-system\.mjs$/u,
  /^tooling\/qa\/core\/verify-design-system-.+\.mjs$/u,
];

export const DEPENDENCY_GRAPH_TRIGGER_FILES = new Set([
  '.dependency-cruiser.cjs',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'apps/extension/vite.config.ts',
  'apps/extension/build/layout.ts',
  'apps/extension/build/extension-html-inputs.ts',
  'tooling/qa/core/dependency-cruiser-default-rules.cjs',
  'tooling/qa/core/dependency-cruiser-options.cjs',
  'tooling/qa/core/dependency-graph-runner.mjs',
  'tooling/qa/guards/architecture/verify-boundaries.mjs',
  'tooling/qa/core/verify-build.mjs',
  'tooling/qa/guards/architecture/verify-cycles.mjs',
  'tooling/qa/core/verify-typecheck.mjs',
  ...CANONICAL_FACADE_FILES,
]);

export const DEPENDENCY_GRAPH_TRIGGER_PATTERNS = [
  /^apps\/extension\/(?:manifest\.json|build\/|public\/)/u,
  /^src\/(?:background|content|popup)\/(?:index|App|[\w-]+Page)\.(?:ts|tsx|html)$/u,
  /^src\/(?:settings|gallery)\/(?:index|App|[\w-]+Page)\.(?:ts|tsx|html)$/u,
  /^src\/(?:design-system|editor|video-editor)\/(?:index|App|[\w-]+Page)\.(?:ts|tsx|html)$/u,
  /^src\/(?:offscreen|scenario-editor)\/(?:index|App|[\w-]+Page)\.(?:ts|tsx|html)$/u,
  /^src\/web-snapshot-viewer\/(?:index|App|[\w-]+Page)\.(?:ts|tsx|html)$/u,
  /^apps\/extension\/src\/[^/]+\/(?:index|App|[\w-]+Page)\.(?:ts|tsx|html)$/u,
  /^packages\/[^/]+\/src\//u,
];
