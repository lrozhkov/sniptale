import { existsSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';
import { COVERAGE_ROLLOUT_EXACT_FILES } from './verify-test-coverage.rollout-files.data.mjs';

const COVERAGE_ROLLOUT_EXACT_GROUPS = [
  'coreRuntimeOwners',
  'contentParserExport',
  'contentHighlighterAndQuickEdit',
  'contentSelectionAndCapture',
];

export const COVERAGE_THRESHOLDS = {
  core: { branches: 70, lines: 80 },
  ui: { branches: 60, lines: 70 },
};

export const COVERAGE_TARGET_FILE_RE =
  /^(?:apps\/extension\/src|packages\/[^/]+\/src)\/.*\.(?:ts|tsx)$/u;

export const COVERAGE_EXCLUDE_PATTERNS = [
  /^packages\/platform\/src\/i18n\//u,
  /^apps\/extension\/src\/platform\/i18n\//u,
  /^src\/test-harness\//u,
  /\.d\.ts$/u,
  /\.test\.(?:ts|tsx)$/u,
  /\.spec\.(?:ts|tsx)$/u,
  /\.test-support\.(?:ts|tsx)$/u,
  /\.test\.helpers\.(?:ts|tsx)$/u,
  /(?:^|\/)test-helpers\.(?:ts|tsx)$/u,
  /\.test\.fixtures\.(?:ts|tsx)$/u,
  /\.fixtures\.(?:ts|tsx)$/u,
  /(?:^|\/)constants\.(?:ts|tsx)$/u,
  /\.types\.(?:ts|tsx)$/u,
  /\.constants\.(?:ts|tsx)$/u,
  /\.data\.(?:ts|tsx)$/u,
];

export const COVERAGE_ROLLOUT_GROUPS = [
  {
    id: 'core-runtime-owners',
    threshold: 'core',
    prefixes: [
      'packages/',
      'apps/extension/src/composition/',
      'apps/extension/src/contracts/',
      'apps/extension/src/features/',
      'apps/extension/src/effect-runtime-sandbox/',
      'apps/extension/src/foundation/',
      'apps/extension/src/platform/',
      'apps/extension/src/background/',
      'apps/extension/src/offscreen/',
      'apps/extension/src/editor/controller/',
      'apps/extension/src/editor/document/',
      'apps/extension/src/editor/objects/',
      'apps/extension/src/editor/browser-frame/',
      'apps/extension/src/editor/color/',
      'apps/extension/src/editor/runtime/',
      'apps/extension/src/video-editor/state/',
      'apps/extension/src/video-editor/project/state/',
    ],
    files: COVERAGE_ROLLOUT_EXACT_FILES?.coreRuntimeOwners,
  },
  {
    id: 'ui-product-surfaces',
    threshold: 'ui',
    prefixes: [
      'apps/extension/src/popup',
      'apps/extension/src/settings',
      'apps/extension/src/gallery',
      'apps/extension/src/design-system',
      'apps/extension/src/editor/workspace/',
      'apps/extension/src/editor/inspector/',
      'apps/extension/src/scenario-editor/',
    ],
  },
  {
    id: 'content-parser-export',
    threshold: 'ui',
    prefixes: [
      'apps/extension/src/content/parser/export-manager/',
      'apps/extension/src/content/parser/dom-tree-parser/',
      'apps/extension/src/content/parser/pipelines/',
      'apps/extension/src/content/parser/page-profile/',
      'apps/extension/src/content/parser/page-snapshot/',
      'apps/extension/src/content/parser/ir/',
      'apps/extension/src/content/parser/parsers/generic/',
      'apps/extension/src/content/parser/parsers/gwt/',
    ],
    files: COVERAGE_ROLLOUT_EXACT_FILES?.contentParserExport,
  },
  {
    id: 'content-ai-pick',
    threshold: 'ui',
    prefixes: ['apps/extension/src/content/overlay/ai/pick/runtime/'],
  },
  {
    id: 'content-highlighter-and-quick-edit',
    threshold: 'ui',
    prefixes: [
      'apps/extension/src/content/selection/highlighter-runtime/',
      'apps/extension/src/content/selection/quick-edit-runtime/',
    ],
    files: COVERAGE_ROLLOUT_EXACT_FILES?.contentHighlighterAndQuickEdit,
  },
  {
    id: 'content-selection-and-capture',
    threshold: 'ui',
    prefixes: [
      'apps/extension/src/content/selection/highlighter-hover-preview/',
      'apps/extension/src/content/selection/locker/',
      'apps/extension/src/content/parser/popup-export/',
      'apps/extension/src/content/selection/region-capture/',
      'apps/extension/src/content/selection/region-selector/',
      'apps/extension/src/content/selection/selection-mode/',
      'apps/extension/src/content/runtime/tab-capture-fallback/',
      'apps/extension/src/content/overlay/video-annotations/',
      'apps/extension/src/content/overlay/video-clicks/',
    ],
    files: COVERAGE_ROLLOUT_EXACT_FILES?.contentSelectionAndCapture,
  },
];

function matchesAny(relativePath, patterns) {
  return patterns.some((pattern) => pattern.test(relativePath));
}

function matchesCoverageGroup(relativePath, group, { exactOnly = false } = {}) {
  if (group.files?.includes(relativePath)) {
    return true;
  }

  if (exactOnly) {
    return false;
  }

  return group.prefixes?.some((prefix) => relativePath.startsWith(prefix)) ?? false;
}

function walkCoveragePrefix(prefix) {
  if (!existsSync(prefix)) {
    return [];
  }

  return readdirSync(prefix, { withFileTypes: true }).flatMap((entry) => {
    const nextPath = posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      return walkCoveragePrefix(nextPath);
    }
    if (!entry.isFile()) {
      return [];
    }
    return nextPath;
  });
}

export function isCoverageTargetFile(relativePath) {
  return COVERAGE_TARGET_FILE_RE.test(relativePath);
}

export function isCoverageExcluded(relativePath) {
  return matchesAny(relativePath, COVERAGE_EXCLUDE_PATTERNS);
}

function collectExactCoverageFileViolations({ file, fileExists, group, seenFiles }) {
  if (typeof file !== 'string' || file.trim().length === 0) {
    return [`Exact coverage rollout group ${group} contains a non-path entry.`];
  }

  const violations = [];
  if (!isCoverageTargetFile(file)) {
    violations.push(`Exact coverage rollout path is outside product TypeScript scope: ${file}`);
  }
  if (!fileExists(file)) {
    violations.push(`Exact coverage rollout path does not exist: ${file}`);
  }

  const previousGroup = seenFiles.get(file);
  if (previousGroup != null) {
    violations.push(`Duplicate exact coverage rollout path: ${file} (${previousGroup}, ${group})`);
  } else {
    seenFiles.set(file, group);
  }
  return violations;
}

function collectExactCoverageGroupViolations({ exactFiles, fileExists, group, seenFiles }) {
  const files = exactFiles[group];
  if (!Array.isArray(files)) {
    return [`Exact coverage rollout group ${group} must be an array.`];
  }

  return [
    ...(files.length === 0 ? [`Exact coverage rollout group ${group} must not be empty.`] : []),
    ...files.flatMap((file) =>
      collectExactCoverageFileViolations({ file, fileExists, group, seenFiles })
    ),
  ];
}

export function collectCoverageRolloutInventoryViolations({
  exactFiles = COVERAGE_ROLLOUT_EXACT_FILES,
  fileExists = existsSync,
} = {}) {
  if (exactFiles == null || typeof exactFiles !== 'object' || Array.isArray(exactFiles)) {
    return ['Exact coverage rollout inventory must export an object keyed by rollout group.'];
  }

  const violations = [];
  const expectedGroups = new Set(COVERAGE_ROLLOUT_EXACT_GROUPS);
  const seenFiles = new Map();

  violations.push(
    ...Object.keys(exactFiles)
      .filter((group) => !expectedGroups.has(group))
      .map((group) => `Unexpected exact coverage rollout group: ${group}`)
  );

  for (const group of COVERAGE_ROLLOUT_EXACT_GROUPS) {
    violations.push(
      ...collectExactCoverageGroupViolations({ exactFiles, fileExists, group, seenFiles })
    );
  }

  return violations;
}

export function findCoverageRolloutGroup(relativePath, { exactOnly = false } = {}) {
  return (
    COVERAGE_ROLLOUT_GROUPS.find((group) =>
      matchesCoverageGroup(relativePath, group, { exactOnly })
    ) ?? null
  );
}

export function collectCoverageRolloutFiles({ groupIds = null } = {}) {
  const groups =
    groupIds == null
      ? COVERAGE_ROLLOUT_GROUPS
      : COVERAGE_ROLLOUT_GROUPS.filter((group) => groupIds.includes(group.id));
  const files = new Set();

  for (const group of groups) {
    for (const file of group.files ?? []) {
      if (isCoverageTargetFile(file)) {
        files.add(file);
      }
    }

    for (const prefix of group.prefixes ?? []) {
      for (const file of walkCoveragePrefix(prefix)) {
        if (isCoverageTargetFile(file) && !isCoverageExcluded(file)) {
          files.add(file);
        }
      }
    }
  }

  return [...files].sort();
}
