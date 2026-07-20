import { describe, expect, it } from 'vitest';

import { translate } from '../../platform/i18n';
import type { StorageCleanupCandidate } from './types';

import { buildStorageCleanupReport } from './report';

function createCandidate(
  overrides: Partial<StorageCleanupCandidate> = {}
): StorageCleanupCandidate {
  return {
    id: 'asset-1',
    filename: 'asset.png',
    size: 10,
    createdAt: 1,
    kind: 'screenshot',
    target: 'asset',
    ...overrides,
  };
}

function createExpectedGroups() {
  return [
    {
      id: 'orphaned-raw-recordings',
      title: translate('shared.mediaHub.orphanedRecordingsTitle'),
      description: translate('shared.mediaHub.orphanedRecordingsDescription'),
      irreversibleLabel: translate('shared.mediaHub.orphanedRecordingsIrreversible'),
      potentialBytes: 5,
      items: [
        createCandidate({ id: 'recording-1', kind: 'recording', target: 'recording', size: 5 }),
      ],
    },
    {
      id: 'heavy-files',
      title: translate('shared.mediaHub.heavyFilesTitle'),
      description: createHeavyFilesDescription(3),
      irreversibleLabel: translate('shared.mediaHub.heavyFilesIrreversible'),
      potentialBytes: 15,
      items: [createCandidate({ id: 'asset-2', size: 15 })],
    },
    {
      id: 'old-screenshots',
      title: translate('shared.mediaHub.oldScreenshotsTitle'),
      description: translate('shared.mediaHub.oldScreenshotsDescription'),
      irreversibleLabel: translate('shared.mediaHub.oldScreenshotsIrreversible'),
      potentialBytes: 20,
      items: [createCandidate({ id: 'asset-3', size: 20, createdAt: 2 })],
    },
  ];
}

function createHeavyFilesDescription(topN: number): string {
  return `${translate('shared.mediaHub.heavyFilesDescriptionPrefix')}${topN}${translate(
    'shared.mediaHub.heavyFilesDescriptionSuffix'
  )}`;
}

describe('media-hub-cleanup-report', () => {
  it('builds localized cleanup groups and totals when topN is provided', () => {
    const report = buildStorageCleanupReport({
      orphanedRawRecordings: [
        createCandidate({ id: 'recording-1', kind: 'recording', target: 'recording', size: 5 }),
      ],
      heavyFiles: [createCandidate({ id: 'asset-2', size: 15 })],
      oldScreenshots: [createCandidate({ id: 'asset-3', size: 20, createdAt: 2 })],
      topN: 3,
    });

    expect(report.potentialBytes).toBe(40);
    expect(report.groups).toEqual(expect.arrayContaining(createExpectedGroups()));
    expect(report.groups.map((group) => group.id)).toEqual([
      'orphaned-raw-recordings',
      'orphaned-project-assets',
      'broken-media-mirrors',
      'heavy-files',
      'old-screenshots',
      'orphaned-thumbnails',
      'stale-editor-drafts',
      'orphaned-scenario-pending-assets',
      'orphaned-scenario-artifacts',
      'old-diagnostics',
    ]);
  });

  it('uses the default topN value when the caller omits it', () => {
    const report = buildStorageCleanupReport({
      orphanedRawRecordings: [],
      heavyFiles: [],
      oldScreenshots: [],
    });

    expect(report.groups.find((group) => group.id === 'heavy-files')).toMatchObject({
      id: 'heavy-files',
      description: createHeavyFilesDescription(10),
      potentialBytes: 0,
      items: [],
    });
    expect(report.potentialBytes).toBe(0);
  });
});
