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
  'docs/agent-tooling/AGENTS.md',
  '.dependency-cruiser.cjs',
  'docs/agent-tooling/DESIGN.md',
  'docs/architecture/code-organization.md',
  'docs/architecture/runtime-contexts.md',
  'docs/tooling/code-quality.md',
  'docs/tooling/operator-handbook.md',
  'tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json',
  'tooling/qa/guards/architecture/runtime-topology/model.mjs',
  'tooling/qa/guards/architecture/runtime-topology/check.mjs',
  'apps/extension/manifest.json',
]);

export const MANIFEST_PERMISSION_TRIGGER_FILES = new Set([
  'tooling/configs/qa/manifest-permissions.data.json',
  'tooling/qa/guards/architecture/manifest-permissions/check.mjs',
  'apps/extension/manifest.json',
]);

export const SECURITY_DATA_TRIGGER_PATTERNS = [
  /^src\/(?:background|content|shared|settings|popup|gallery)\//u,
  /^src\/(?:editor|video-editor|offscreen|scenario-editor|web-snapshot-viewer)\//u,
  APP_RUNTIME_SOURCE_PATTERN,
  /^tooling\/configs\/qa\/security-(?:network|storage)-ownership\.data\.json$/u,
  /^tooling\/qa\/guards\/security\/network\//u,
  /^tooling\/qa\/guards\/security\/verify-(?:secret-storage|sensitive-retention)\.mjs$/u,
  /^tooling\/qa\/guards\/security\/verify-(?:fetch-ownership|diagnostic-sanitization)\.mjs$/u,
  /^tooling\/qa\/guards\/security\/helpers\/.+\.mjs$/u,
  /^tooling\/qa\/guards\/security\/security-policy-utils\.mjs$/u,
];

export const SECURITY_DATA_FULL_CLOSURE_TRIGGER_PATTERNS = [
  /^tooling\/configs\/qa\/security-(?:network|storage)-ownership\.data\.json$/u,
  /^tooling\/qa\/guards\/security\/network\//u,
  /^tooling\/qa\/guards\/security\/verify-(?:secret-storage|sensitive-retention)\.mjs$/u,
  /^tooling\/qa\/guards\/security\/verify-(?:fetch-ownership|diagnostic-sanitization)\.mjs$/u,
  /^tooling\/qa\/guards\/security\/helpers\/.+\.mjs$/u,
  /^tooling\/qa\/guards\/security\/security-policy-utils\.mjs$/u,
];

export const MANIFEST_INTEGRITY_TRIGGER_FILES = new Set([
  'tooling/qa/guards/product-contracts/manifest-integrity/check.mjs',
  'apps/extension/src/background/offscreen-document/create-options.ts',
  'apps/extension/manifest.json',
  'apps/extension/vite.config.ts',
  'apps/extension/build/layout.data.json',
]);

export const UI_I18N_FULL_TRIGGER_PATTERNS = [
  /^apps\/extension\/src\/platform\/i18n\//u,
  /^packages\/platform\/src\/i18n\//u,
  APP_RUNTIME_SOURCE_PATTERN,
  /^tooling\/qa\/guards\/product-contracts\/verify-i18n(?:\.helpers|\.test)?\.[cm]?[jt]sx?$/u,
  /^tooling\/qa\/composition\/checkpoint\/focused(?:-triggered\/helpers|\/config)\.mjs$/u,
];

export const DESIGN_SYSTEM_TRIGGER_PATTERNS = [
  ...UI_I18N_FULL_TRIGGER_PATTERNS,
  /^apps\/extension\/src\/.*\.(?:ts|tsx|css)$/u,
  /^packages\/ui\/src\/.*\.(?:ts|tsx|css)$/u,
  /^packages\/ui\/package\.json$/u,
  /^tooling\/qa\/guards\/product-contracts\/verify-design-system\.mjs$/u,
  /^tooling\/qa\/guards\/product-contracts\/design-system\//u,
  /^tooling\/configs\/qa\/ast-grep\//u,
];

export const DEPENDENCY_GRAPH_TRIGGER_FILES = new Set([
  '.dependency-cruiser.cjs',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'apps/extension/vite.config.ts',
  'apps/extension/build/layout.ts',
  'apps/extension/build/extension-html-inputs.ts',
  'tooling/qa/analysis/dependency-graph/dependency-cruiser-default-rules.cjs',
  'tooling/qa/analysis/dependency-graph/dependency-cruiser-options.cjs',
  'tooling/qa/analysis/dependency-graph/dependency-graph-runner.mjs',
  'tooling/qa/guards/architecture/verify-boundaries.mjs',
  'tooling/qa/composition/build/build-step.mjs',
  'tooling/qa/guards/architecture/verify-cycles.mjs',
  'tooling/qa/proof/typecheck/execution/check.mjs',
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
