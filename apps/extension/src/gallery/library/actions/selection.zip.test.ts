// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createController, createMediaItem, runBusyAction } from './test-support/index';
import { createSelectionZipAction } from './selection';

const { exportMediaHubBackupMock } = vi.hoisted(() => ({
  exportMediaHubBackupMock: vi.fn(),
}));

vi.mock('../../../workflows/media-hub-backup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub-backup')>()),
  exportMediaHubBackup: exportMediaHubBackupMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  exportMediaHubBackupMock.mockResolvedValue(undefined);
});

describe('gallery selection v6 package export', () => {
  it('exports selected media as a portable v6 profile through the direct sink pipeline', async () => {
    const { controller } = createController({
      selectedItems: [
        createMediaItem({ entityId: 'asset-1', filename: '../asset.png' }),
        createMediaItem({ entityId: 'asset-2', filename: 'nested/asset.png' }),
        createMediaItem({ entityId: 'asset-3', filename: 'CON' }),
      ],
    });

    await createSelectionZipAction(controller)(runBusyAction);

    expect(exportMediaHubBackupMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'selected',
        selected: {
          mediaAssetIds: ['asset-1', 'asset-2', 'asset-3'],
          scenarioProjectIds: [],
          videoProjectIds: [],
        },
      }),
      expect.objectContaining({ filename: expect.stringMatching(/^media-hub-selection-.*\.zip$/) })
    );
  });

  it('surfaces direct sink and writer failures without a compatibility download path', async () => {
    const { controller } = createController({
      selectedItems: [createMediaItem({ entityId: 'asset-1', filename: 'asset.png' })],
    });
    exportMediaHubBackupMock.mockRejectedValue(new Error('disk full'));

    await expect(createSelectionZipAction(controller)(runBusyAction)).rejects.toThrow('disk full');
    expect(exportMediaHubBackupMock).toHaveBeenCalledOnce();
  });
});
