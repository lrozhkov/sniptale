import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { collectCoverageViolations, resolveCoverageTargetFiles } from './verify-test-coverage.mjs';
import {
  collectCoverageRolloutFiles,
  COVERAGE_ROLLOUT_GROUPS,
  COVERAGE_THRESHOLDS,
  findCoverageRolloutGroup,
} from './verify-test-coverage.registry.mjs';
import { resolveCoverageThreshold } from './verify-test-coverage.thresholds.mjs';
import { createTempRoot, importFresh, withCwd, writeFile } from './test-helpers';
const EXACT_ROLLOUT_FILES = COVERAGE_ROLLOUT_GROUPS.flatMap((group) => group.files ?? []);
const CORE_THRESHOLD = { branches: 70, lines: 80 };
const UI_THRESHOLD = { branches: 60, lines: 70 };

it('returns the stricter core thresholds for shared and orchestration ownership areas', () => {
  expect(resolveCoverageThreshold('apps/extension/src/background/worker.ts')).toEqual(
    CORE_THRESHOLD
  );
  expect(resolveCoverageThreshold('apps/extension/src/editor/controller/session.ts')).toEqual(
    CORE_THRESHOLD
  );
});

it('returns the UI thresholds for product surface files', () => {
  expect(
    resolveCoverageThreshold('apps/extension/src/gallery/shell/app-shell/GalleryApp.tsx')
  ).toEqual(UI_THRESHOLD);
  expect(resolveCoverageThreshold('apps/extension/src/gallery/shell/app-shell/index.tsx')).toEqual(
    UI_THRESHOLD
  );
  expect(
    resolveCoverageThreshold('apps/extension/src/editor/workspace/toolbar/Toolbar.tsx')
  ).toEqual(UI_THRESHOLD);
  expect(
    resolveCoverageThreshold('apps/extension/src/scenario-editor/ScenarioEditorPage.tsx')
  ).toEqual(UI_THRESHOLD);
});

it('resolves thresholds for every rollout file enumerated from the registry', () => {
  const rolloutFiles = collectCoverageRolloutFiles();

  expect(rolloutFiles.length).toBeGreaterThan(0);

  for (const file of rolloutFiles) {
    const rolloutGroup = findCoverageRolloutGroup(file);

    expect(rolloutGroup).not.toBeNull();
    expect(resolveCoverageThreshold(file)).toEqual(COVERAGE_THRESHOLDS[rolloutGroup!.threshold]);
  }
});

it('enumerates at least one rollout file for every registry group', () => {
  for (const group of COVERAGE_ROLLOUT_GROUPS) {
    expect(collectCoverageRolloutFiles({ groupIds: [group.id] }).length).toBeGreaterThan(0);
  }
});

it('skips excluded and out-of-scope files', () => {
  expect(
    resolveCoverageThreshold(
      'apps/extension/src/content/selection/highlighter-runtime/controller.types.ts'
    )
  ).toEqual(UI_THRESHOLD);
  expect(
    resolveCoverageThreshold('apps/extension/src/platform/i18n/messages/gallery/app.ts')
  ).toBeNull();
  expect(resolveCoverageThreshold('tooling/test/harness/editor.tsx')).toBeNull();
  expect(resolveCoverageThreshold('src/shared/contracts/runtime.types.ts')).toBeNull();
  expect(resolveCoverageThreshold('@sniptale/ui/default-colors/constants')).toBeNull();
  expect(resolveCoverageThreshold('apps/extension/src/content/components/Callout.tsx')).toBeNull();
  expect(resolveCoverageThreshold('apps/extension/src/content/logic/ai-dom-apply.ts')).toBeNull();
  expect(
    resolveCoverageThreshold(
      'apps/extension/src/content/parser/pipelines/direct-extractors/index.test.helpers.ts'
    )
  ).toBeNull();
  expect(
    resolveCoverageThreshold('apps/extension/src/settings/sections/quick-actions/test-helpers.tsx')
  ).toBeNull();
});

it('references only existing exact rollout files', () => {
  for (const file of EXACT_ROLLOUT_FILES) {
    expect(existsSync(file)).toBe(true);
  }
});

it('does not enumerate duplicate rollout files from the registry', () => {
  const rolloutFiles = collectCoverageRolloutFiles();

  expect(rolloutFiles).toEqual([...new Set(rolloutFiles)]);
});

function createThresholdSummaries() {
  return new Map([
    [
      'apps/extension/src/background/session.ts',
      {
        branches: { pct: 69.5 },
        lines: { pct: 79.9 },
      },
    ],
    [
      'apps/extension/src/gallery/shell/app-shell/GalleryApp.tsx',
      {
        branches: { pct: 60 },
        lines: { pct: 70 },
      },
    ],
  ]);
}

function registerThresholdViolationTests() {
  it('flags files below the configured thresholds', () => {
    expect(
      collectCoverageViolations(
        [
          'apps/extension/src/background/session.ts',
          'apps/extension/src/gallery/shell/app-shell/GalleryApp.tsx',
        ],
        createThresholdSummaries()
      )
    ).toEqual([
      expect.objectContaining({
        file: 'apps/extension/src/background/session.ts',
        rule: 'test-coverage-lines',
      }),
      expect.objectContaining({
        file: 'apps/extension/src/background/session.ts',
        rule: 'test-coverage-branches',
      }),
    ]);
  });

  it('flags changed rollout files that are missing from the coverage artifact', () => {
    expect(
      collectCoverageViolations(['apps/extension/src/settings/shell/page/index.tsx'], new Map())
    ).toEqual([
      expect.objectContaining({
        file: 'apps/extension/src/settings/shell/page/index.tsx',
        rule: 'test-coverage-missing-file',
      }),
    ]);
  });
}

function createSettingsPageCoverageDetails() {
  return new Map([
    [
      'apps/extension/src/settings/shell/page/index.tsx',
      {
        data: {
          b: { '0': [0, 1] },
          branchMap: {
            '0': {
              locations: [
                { end: { line: 3 }, start: { line: 3 } },
                { end: { line: 4 }, start: { line: 4 } },
              ],
            },
          },
          f: { '0': 0 },
          fnMap: {
            '0': {
              loc: { end: { line: 5 }, start: { line: 1 } },
              name: 'renderSettings',
            },
          },
          s: { '0': 0 },
          statementMap: { '0': { end: { line: 3 }, start: { line: 3 } } },
        },
      },
    ],
  ]);
}

async function collectSettingsPageCoverageFeedback(root: string) {
  return withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-test-coverage.mjs')>(
      './verify-test-coverage.mjs'
    );
    return module.collectCoverageViolations(
      ['apps/extension/src/settings/shell/page/index.tsx'],
      new Map([
        [
          'apps/extension/src/settings/shell/page/index.tsx',
          { branches: { pct: 55 }, lines: { pct: 60 } },
        ],
      ]),
      {
        changedTargets: {
          changedFiles: ['apps/extension/src/settings/shell/page/index.tsx'],
          changedLineMap: new Map([
            ['apps/extension/src/settings/shell/page/index.tsx', new Set([3])],
          ]),
          untrackedFiles: new Set(),
        },
        coverageDetails: createSettingsPageCoverageDetails(),
      }
    );
  });
}

function registerCoverageFeedbackTest() {
  it('adds uncovered changed lines and suggested proof files to threshold failures', async () => {
    const root = createTempRoot('coverage-feedback-');
    writeFile(
      root,
      'apps/extension/src/settings/shell/page/index.test.tsx',
      "it('covers settings', () => {});\n"
    );

    const result = await collectSettingsPageCoverageFeedback(root);

    expect(result[0]?.message).toContain('Uncovered changed lines: 3 near renderSettings');
    expect(result[0]?.message).toContain('Uncovered changed branches near lines: 3');
    expect(result[0]?.message).toContain(
      'Suggested proof: apps/extension/src/settings/shell/page/index.test.tsx'
    );
  });
}

describe('collectCoverageViolations', () => {
  registerThresholdViolationTests();
  registerCoverageFeedbackTest();
});

describe('resolveCoverageTargetFiles basics', () => {
  it('filters explicit files down to rollout-covered production targets', () => {
    expect(
      resolveCoverageTargetFiles({
        files: [
          'apps/extension/src/settings/SettingsPage.tsx',
          'apps/extension/src/settings/shell/page/index.tsx',
          'apps/extension/src/content/components/Callout.tsx',
          'docs/tooling/code-quality.md',
        ],
        changedTargets: {
          changedFiles: [],
          changedLineMap: new Map(),
          untrackedFiles: new Set(),
        },
      })
    ).toEqual(['apps/extension/src/settings/shell/page/index.tsx']);
  });

  it('uses changed workspace files when explicit files are absent', () => {
    expect(
      resolveCoverageTargetFiles({
        changedWorkspaceFiles: [
          'apps/extension/src/gallery/shell/app-shell/index.tsx',
          'apps/extension/src/platform/i18n/messages/gallery/app.ts',
          'tooling/qa/core/verify-test-coverage.mjs',
        ],
      })
    ).toEqual(['apps/extension/src/gallery/shell/app-shell/index.tsx']);
  });
});
