/**
 * Canonical limits and file classification for Sniptale quality gates.
 */

export const QUALITY_LIMITS = {
  preferredWrapWidth: 100,
  maxLineLength: 120,
  maxFileLines: 300,
  maxFunctionLines: 50,
  maxLogicTokens: 1800,
  maxStaticLineLength: 500,
  deadCommentRunLength: 6,
};

export const QUALITY_BASELINE_PATH = 'tooling/configs/qa/quality-baseline.json';

export const PRODUCT_SOURCE_ROOTS = [
  'apps/extension/src',
  'packages/foundation/src',
  'packages/runtime-contracts/src',
  'packages/platform/src',
  'packages/ui/src',
];
export const DEFAULT_SCAN_ROOTS = [...PRODUCT_SOURCE_ROOTS, 'apps/extension/build', 'tooling'];

export const CODE_FILE_PATTERN = /\.(?:ts|tsx|js|mjs|cjs|py|css)$/;

export const IGNORED_ROOT_SEGMENTS = new Set([
  '.git',
  '.husky',
  '.oldcodebase',
  '.backup',
  '.hatiqo',
  'cases',
  'dist',
  'node_modules',
]);

export const FORMATTABLE_FILE_PATTERN = /\.(?:ts|tsx|js|mjs|cjs|json|css|html|yml|yaml|py)$/;
export const FORMATTER_EXCLUDE_PATTERNS = [/^tooling\/configs\//];

export const WORKSPACE_ONLY_IGNORE_PATTERNS = [/^tasks\//];

export const DATA_FILE_PATTERNS = [
  /^tooling\/configs\//,
  /^packages\/ui\/src\/styles\//,
  /\.constants\.[cm]?[jt]sx?$/,
  /\.data\.[cm]?[jt]sx?$/,
  /^apps\/extension\/src\/platform\/i18n\//,
  /^apps\/extension\/src\/design-system\/catalog\/registry\/index\.ts$/,
  /^apps\/extension\/manifest\.json$/,
  /^apps\/extension\/build\/.*\.data\.json$/,
];

export const TOKEN_BUDGET_EXCLUDE_PATTERNS = [
  /^tooling\/qa\/core\/focused-coverage\/maps\//,
  /\.d\.ts$/,
  /\.test\.[cm]?[jt]sx?$/,
  /\.spec\.[cm]?[jt]sx?$/,
  /\.types\.[cm]?[jt]sx?$/,
  /\.constants\.[cm]?[jt]sx?$/,
  /\.data\.[cm]?[jt]sx?$/,
  /^packages\/ui\/src\//,
  /^apps\/extension\/src\/platform\/i18n\//,
];

export const TOKEN_BUDGET_INCLUDE_PATTERNS = [
  /^tooling\/qa\//,
  /^apps\/extension\/build\//,
  /^apps\/extension\/src\/background\//,
  /^apps\/extension\/src\/offscreen\//,
  /^apps\/extension\/src\/content\/(?:hooks|logic|store)\//,
  /^apps\/extension\/src\/editor\/(?:controller|document|objects|browser-frame|runtime|state)\//,
  /^apps\/extension\/src\/video-editor\/(?:runtime|state|project)\//,
  /^apps\/extension\/src\/video-editor\/library\/effects-dock\b/,
  /^apps\/extension\/src\/video-editor\/preview\/(?:placement|stage\/(?:geometry|motion-area))\b/,
  /^apps\/extension\/src\/video-editor\/preview\/stage\/(?:import-handlers|runtime)\b/,
  /^apps\/extension\/src\/effect-runtime-sandbox\//,
  /^apps\/extension\/src\/video-editor\/timeline\/previews\.ts$/,
  /^apps\/extension\/src\/video-editor\/timeline\/project\/(?:effect-lanes|interaction-state)\//,
  /^apps\/extension\/src\/(?:composition|contracts|features|foundation|platform|ui|workflows)\//,
  /^packages\/(?:foundation|runtime-contracts|platform)\/src\//,
];

export const SECURITY_IGNORE_PATTERNS = [
  /^tooling\/qa\/guards\/security\/verify-security\.mjs$/,
  /\.test\.[cm]?[jt]sx?$/,
  /\.spec\.[cm]?[jt]sx?$/,
];

export const CODE_COMMENT_KEYWORD_PATTERN =
  /\b(?:if|else|for|while|switch|case|try|catch|return|throw|const|let|var|function)\b/u;

export const CODE_COMMENT_DECLARATION_PATTERN =
  /\b(?:class|import|export|await|yield|new)\b|=>|[{}();=<>]/u;
