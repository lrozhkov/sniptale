import { expect, it } from 'vitest';
import { createLibraryLifecycle } from '../../../composition/persistence/library-lifecycle';
import { shouldExportMediaEntry } from './filters';

const entry = {
  id: 'project-asset:asset-saved',
  lifecycle: createLibraryLifecycle('library', 10),
  source: { kind: 'project-asset' as const, projectAssetId: 'asset-saved' },
};
const allOptions = {
  includeSourceMetadata: false,
  includeTelemetry: false,
  includeWebSnapshots: true,
  scope: 'all' as const,
};

it('exports an independently saved project asset in an all-scope backup exactly once', () => {
  expect(shouldExportMediaEntry(entry, allOptions)).toBe(true);
  expect(shouldExportMediaEntry(entry, allOptions, new Set(['asset-saved']))).toBe(false);
});

it('exports an independently selected project asset and rejects an unselected one', () => {
  const selected = {
    ...allOptions,
    scope: 'selected' as const,
    selected: {
      mediaAssetIds: [entry.id],
      scenarioProjectIds: [],
      videoProjectIds: [],
    },
  };
  expect(shouldExportMediaEntry(entry, selected)).toBe(true);
  expect(
    shouldExportMediaEntry(entry, {
      ...selected,
      selected: { ...selected.selected, mediaAssetIds: [] },
    })
  ).toBe(false);
});
