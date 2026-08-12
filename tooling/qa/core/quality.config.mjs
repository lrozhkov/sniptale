/**
 * Canonical limits and file classification for Sniptale quality gates.
 */

export const QUALITY_LIMITS = {
  preferredWrapWidth: 100,
  maxLineLength: 120,
  maxModuleSpecifierLength: 200,
  maxClassifiedLiteralLength: 240,
  maxGeneratedDataLineLength: 1000,
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

export const WORKSPACE_ONLY_IGNORE_PATTERNS = [
  /^\.agents(?:\/|$)/u,
  /^AGENTS\.md$/u,
  /^artifacts\/agent-tooling-[^/]+\.zip$/u,
  /^artifacts\/agent-tooling\.zip$/u,
  /^tasks\//u,
];

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

export const SECURITY_IGNORE_PATTERNS = [
  /^tooling\/qa\/guards\/security\/verify-security\.mjs$/,
  /\.test\.[cm]?[jt]sx?$/,
  /\.spec\.[cm]?[jt]sx?$/,
];

export const CODE_COMMENT_KEYWORD_PATTERN =
  /\b(?:if|else|for|while|switch|case|try|catch|return|throw|const|let|var|function)\b/u;

export const CODE_COMMENT_DECLARATION_PATTERN =
  /\b(?:class|import|export|await|yield|new)\b|=>|[{}();=<>]/u;
