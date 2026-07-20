import { expect, it } from 'vitest';

import {
  collectContractParserCoverageViolations,
  collectHotLoopWorkViolations,
  collectPrivacyFeatureSettingsViolations,
  collectResourceBudgetConsistencyViolations,
  collectResourceLifecyclePairViolations,
  collectStateMachineProofViolations,
  collectStatsCounterSemanticsViolations,
  collectStorageMutationOwnershipViolations,
} from './audit-guardrail-core.mjs';
import { createTempRoot, writeFile } from './test-helpers';

function rules(violations: { rule: string }[]) {
  return violations.map((violation) => violation.rule);
}

it('reports incomplete sensitive privacy feature settings contracts', () => {
  const root = createTempRoot('audit-privacy-settings-');
  const bad = writeFile(
    root,
    'apps/extension/src/composition/persistence/settings/privacy.ts',
    'export const defaults = { authenticatedSnapshotAssetsEnabled: true };\n'
  );
  const good = writeFile(
    root,
    'apps/extension/src/composition/persistence/settings/privacy-ok.ts',
    [
      'export const defaults = { rawDiagnosticsEnabled: false };',
      "parseOptionalBoolean(record, 'rawDiagnosticsEnabled');",
    ].join('\n')
  );

  expect(rules(collectPrivacyFeatureSettingsViolations([bad]))).toContain(
    'privacy-feature-settings-incomplete'
  );
  expect(collectPrivacyFeatureSettingsViolations([good])).toEqual([]);
});

it('reports boundary domain casts that bypass canonical parsers', () => {
  const root = createTempRoot('audit-parser-coverage-');
  const bad = writeFile(
    root,
    'apps/extension/src/workflows/media-hub-backup/restore/index.ts',
    'export function restore(value: unknown) { return value as VideoProject; }\n'
  );
  const good = writeFile(
    root,
    'apps/extension/src/workflows/media-hub-backup/restore/index-ok.ts',
    'export function restore(value: unknown) { return parseVideoProject(value); }\n'
  );

  expect(rules(collectContractParserCoverageViolations([bad]))).toContain(
    'contract-parser-coverage'
  );
  expect(collectContractParserCoverageViolations([good])).toEqual([]);
});

it('reports inconsistent resource budget layers', () => {
  const root = createTempRoot('audit-budget-consistency-');
  const contentLimits = writeFile(
    root,
    'apps/extension/src/content/parser/web-snapshot/limits.ts',
    'export const MAX_WEB_SNAPSHOT_PACKAGE_BLOB_BYTES = 1000;\n'
  );
  const runtimeLimits = writeFile(
    root,
    'apps/extension/src/background/capture/routing/web-snapshot/staged-blobs.ts',
    'const MAX_PACKAGE_BYTES = 10;\n'
  );

  expect(
    rules(collectResourceBudgetConsistencyViolations([contentLimits, runtimeLimits]))
  ).toContain('resource-budget-ordering');
});

it('reports unpaired resource lifecycle acquisition', () => {
  const root = createTempRoot('audit-resource-lifecycle-');
  const bad = writeFile(
    root,
    'apps/extension/src/offscreen/project-export/video.ts',
    'export function make(blob) { return URL.createObjectURL(blob); }\n'
  );
  const good = writeFile(
    root,
    'apps/extension/src/offscreen/project-export/video-ok.ts',
    'export function make(blob) { const url = URL.createObjectURL(blob); URL.revokeObjectURL(url); }\n'
  );

  expect(rules(collectResourceLifecyclePairViolations([bad]))).toContain(
    'resource-lifecycle-object-url'
  );
  expect(collectResourceLifecyclePairViolations([good])).toEqual([]);
});

it('requires proof files for hard state-machine owners', () => {
  const root = createTempRoot('audit-state-proof-');
  const bad = writeFile(
    root,
    'apps/extension/src/offscreen/recording/session.ts',
    "export const state = { status: 'pending', jobId: 'job' };\n"
  );
  const good = writeFile(
    root,
    'apps/extension/src/offscreen/recording/session-ok.ts',
    "export const state = { status: 'running', jobId: 'job' };\n"
  );

  expect(rules(collectStateMachineProofViolations([bad]))).toContain('state-machine-proof-missing');

  writeFile(
    root,
    'apps/extension/src/offscreen/recording/owner-state.test.ts',
    "it('rejects duplicate replay stale terminal failure cancel', () => {});\n"
  );

  expect(collectStateMachineProofViolations([bad])).toEqual([]);
  expect(collectStateMachineProofViolations([good])).toEqual([]);
});

it('reports expensive work inside hot loops', () => {
  const root = createTempRoot('audit-hot-loop-');
  const bad = writeFile(
    root,
    'apps/extension/src/offscreen/project-export/render.ts',
    'export function renderFrame(clips) { return clips.filter(Boolean); }\n'
  );
  const good = writeFile(
    root,
    'apps/extension/src/offscreen/project-export/render-ok.ts',
    'export function renderFrame(indexedClips) { return indexedClips.byTime; }\n'
  );

  expect(rules(collectHotLoopWorkViolations([bad]))).toContain('hot-loop-expensive-work');
  expect(collectHotLoopWorkViolations([good])).toEqual([]);
});

it('reports ambiguous warning counters used for failure semantics', () => {
  const root = createTempRoot('audit-stats-counter-');
  const bad = writeFile(
    root,
    'apps/extension/src/features/web-snapshot/package-manifest.ts',
    'export const stats = { warningCount: errors.length };\n'
  );
  const good = writeFile(
    root,
    'apps/extension/src/features/web-snapshot/package-manifest-ok.ts',
    'export const stats = { failedAssetCount: errors.length, warningCount: warnings.length };\n'
  );

  expect(rules(collectStatsCounterSemanticsViolations([bad]))).toContain('stats-counter-semantics');
  expect(collectStatsCounterSemanticsViolations([good])).toEqual([]);
});

it('reports UI/runtime persistence writes that bypass mutation owners', () => {
  const root = createTempRoot('audit-storage-mutation-');
  const bad = writeFile(
    root,
    'apps/extension/src/video-editor/actions/save.ts',
    'export function save(project) { return saveVideoProject(project); }\n'
  );
  const good = writeFile(
    root,
    'apps/extension/src/video-editor/actions/save-ok.ts',
    'export function save(project) { return saveVideoProject(project, { baseRevision: project.revision }); }\n'
  );

  expect(rules(collectStorageMutationOwnershipViolations([bad]))).toContain(
    'storage-mutation-owner-bypass'
  );
  expect(collectStorageMutationOwnershipViolations([good])).toEqual([]);
});
