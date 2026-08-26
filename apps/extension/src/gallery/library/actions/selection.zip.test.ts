// @vitest-environment jsdom

import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createArchiveMemorySink } from '../../../composition/archive-transfer/test-support';
import {
  createController,
  createMediaItem,
  createScenarioItem,
  createVideoProjectItem,
  runBusyAction,
} from './test-support/index';
import { createSelectionBackupAction, createSelectionZipAction } from './selection-export';

const { createDirectFileSinkMock, exportMediaHubBackupMock, getMediaAssetBlobMock } = vi.hoisted(
  () => ({
    createDirectFileSinkMock: vi.fn(),
    exportMediaHubBackupMock: vi.fn(),
    getMediaAssetBlobMock: vi.fn(),
  })
);

vi.mock('../../../composition/archive-transfer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/archive-transfer')>()),
  createDirectFileSink: createDirectFileSinkMock,
}));

vi.mock(
  '../../../composition/persistence/media-library/index.library.ts',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/media-library/index.library.ts')
    >()),
    getMediaAssetBlob: getMediaAssetBlobMock,
  })
);

vi.mock('../../../workflows/media-hub-backup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub-backup')>()),
  exportMediaHubBackup: exportMediaHubBackupMock,
}));

beforeEach(() => {
  createDirectFileSinkMock.mockReset();
  exportMediaHubBackupMock.mockReset();
  getMediaAssetBlobMock.mockReset();
  exportMediaHubBackupMock.mockResolvedValue(undefined);
});

function createReadableBlob(value: string, type: string): Blob {
  const bytes = new TextEncoder().encode(value);
  const blob = new Blob([bytes], { type });
  Object.defineProperty(blob, 'stream', {
    configurable: true,
    value: () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
  });
  return blob;
}

describe('gallery selected export modes', () => {
  it('keeps the existing portable package as the selected backup action', async () => {
    const { controller } = createController({
      selectedItems: [
        createMediaItem({
          entityId: 'asset-1',
          filename: 'asset.png',
          lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1 },
        }),
        createMediaItem({ entityId: 'asset-2', filename: 'recording.webm' }),
        createScenarioItem({ entityId: 'scenario-1' }),
        createVideoProjectItem({ entityId: 'video-project-1' }),
      ],
    });

    await createSelectionBackupAction(controller)(runBusyAction);

    expect(exportMediaHubBackupMock).toHaveBeenCalledWith(
      expect.objectContaining({
        includeSourceMetadata: true,
        includeTelemetry: true,
        includeWebSnapshots: true,
        includeDrafts: true,
        scope: 'selected',
        selected: {
          mediaAssetIds: ['asset-1', 'asset-2'],
          scenarioProjectIds: ['scenario-1'],
          videoProjectIds: ['video-project-1'],
        },
      }),
      expect.objectContaining({
        filename: expect.stringMatching(/^media-hub-selection-backup-.*\.zip$/),
      })
    );
    expect(createDirectFileSinkMock).not.toHaveBeenCalled();
  });

  it('exports a selected project even when no media asset is selected', async () => {
    const { controller } = createController({
      selectedItems: [createVideoProjectItem({ entityId: 'video-project-1' })],
    });

    await createSelectionBackupAction(controller)(runBusyAction);

    expect(exportMediaHubBackupMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'selected',
        selected: {
          mediaAssetIds: [],
          scenarioProjectIds: [],
          videoProjectIds: ['video-project-1'],
        },
      }),
      expect.any(Object)
    );
  });

  it('writes only original asset bytes with safe unique filenames to raw ZIP', async () => {
    const output = createArchiveMemorySink();
    createDirectFileSinkMock.mockResolvedValue(output.sink);
    getMediaAssetBlobMock
      .mockResolvedValueOnce(createReadableBlob('first-original', 'image/png'))
      .mockResolvedValueOnce(createReadableBlob('second-original', 'image/png'))
      .mockResolvedValueOnce(createReadableBlob('third-original', 'video/webm'));
    const { controller } = createController({
      selectedItems: [
        createMediaItem({
          entityId: 'asset-1',
          filename: 'edited.png',
          originalFilename: '../asset.png',
        }),
        createMediaItem({
          entityId: 'asset-2',
          filename: 'renamed.png',
          originalFilename: '../asset.png',
        }),
        createMediaItem({
          entityId: 'asset-3',
          filename: 'recording.webm',
          originalFilename: 'CON',
        }),
      ],
    });

    await createSelectionZipAction(controller)(runBusyAction);

    const zip = await JSZip.loadAsync(output.bytes());
    const paths = Object.keys(zip.files);
    expect(paths).toEqual(['..-asset.png', '..-asset (2).png', '_CON']);
    await expect(zip.file('..-asset.png')?.async('text')).resolves.toBe('first-original');
    await expect(zip.file('..-asset (2).png')?.async('text')).resolves.toBe('second-original');
    await expect(zip.file('_CON')?.async('text')).resolves.toBe('third-original');
    expect(paths).not.toContain('manifest.json');
    expect(exportMediaHubBackupMock).not.toHaveBeenCalled();
    expect(createDirectFileSinkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: expect.stringMatching(/^media-hub-assets-.*\.zip$/),
        mimeType: 'application/zip',
      })
    );
  });

  it('aborts the raw archive and surfaces missing original assets', async () => {
    const output = createArchiveMemorySink();
    const abort = vi.spyOn(output.sink, 'abort');
    createDirectFileSinkMock.mockResolvedValue(output.sink);
    getMediaAssetBlobMock.mockResolvedValue(undefined);
    const { controller } = createController({
      selectedItems: [
        createMediaItem({
          entityId: 'missing',
          filename: 'missing.png',
          originalFilename: 'missing.png',
        }),
      ],
    });

    await expect(createSelectionZipAction(controller)(runBusyAction)).rejects.toThrow(
      'missing.png'
    );
    expect(abort).toHaveBeenCalledOnce();
  });

  it('surfaces backup sink failures without falling back to raw ZIP', async () => {
    const { controller } = createController({
      selectedItems: [createMediaItem({ entityId: 'asset-1', filename: 'asset.png' })],
    });
    exportMediaHubBackupMock.mockRejectedValue(new Error('disk full'));

    await expect(createSelectionBackupAction(controller)(runBusyAction)).rejects.toThrow(
      'disk full'
    );
    expect(createDirectFileSinkMock).not.toHaveBeenCalled();
  });
});
