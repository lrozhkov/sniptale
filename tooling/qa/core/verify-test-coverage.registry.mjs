import { existsSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';
import {
  NH5_CONTENT_PARSER_ROLLOUT_FILES,
  NH5_CORE_ROLLOUT_FILES,
} from './focused-coverage/nh5-rollout-files.mjs';

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
    files: NH5_CORE_ROLLOUT_FILES,
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
    files: [
      ...NH5_CONTENT_PARSER_ROLLOUT_FILES,
      'apps/extension/src/content/parser/export-manager/formats/froala.ts',
      'apps/extension/src/content/parser/dom-tree-parser/index.ts',
      'apps/extension/src/content/parser/dom-tree-parser/ai/format.ts',
      'apps/extension/src/content/parser/parsers/types.ts',
    ],
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
    files: ['apps/extension/src/content/selection/highlighter-runtime/controller.types.ts'],
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
    files: [
      'apps/extension/src/content/selection/locker/index.ts',
      'apps/extension/src/content/selection/selection-mode/controller/index.ts',
      'apps/extension/src/content/selection/selection-mode/runtime/graph.ts',
      'apps/extension/src/content/parser/dom-utils/dom-helpers-selectors.ts',
      'apps/extension/src/content/parser/dom-utils/dom-helpers-text.ts',
      'apps/extension/src/content/parser/dom-utils/id-generator.ts',
    ],
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
