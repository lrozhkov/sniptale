// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openSnapshotScreenshotInEditor } from './snapshot-screenshot';
import { createController, createMediaItem, runBusyAction } from './test-support/index';

const {
  browserTabsCreateMock,
  getMediaAssetBlobMock,
  loadWebSnapshotScreenshotBlobMock,
  persistPendingEditorBootstrapPayloadMock,
} = vi.hoisted(() => ({
  browserTabsCreateMock: vi.fn(),
  getMediaAssetBlobMock: vi.fn(),
  loadWebSnapshotScreenshotBlobMock: vi.fn(),
  persistPendingEditorBootstrapPayloadMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { create: browserTabsCreateMock },
}));

vi.mock('../../../composition/persistence/media-library/index.library.ts', async () => ({
  ...(await vi.importActual<
    typeof import('../../../composition/persistence/media-library/index.library.ts')
  >('../../../composition/persistence/media-library/index.library.ts')),
  getMediaAssetBlob: getMediaAssetBlobMock,
}));

vi.mock('../../../workflows/editor/bootstrap/index', async (importOriginal) => ({
  ...(await importOriginal()),
  persistPendingEditorBootstrapPayload: persistPendingEditorBootstrapPayloadMock,
}));

vi.mock('@sniptale/platform/security/secure-random-id', async (importOriginal) => ({
  ...(await importOriginal()),
  createSecureRandomUuid: vi.fn(() => 'session-1'),
}));

vi.mock('../../../platform/navigation/extension-pages/editor', () => ({
  buildEditorUrl: vi.fn(
    () => 'chrome-extension://test/apps/extension/src/editor/index.html?session=session-1'
  ),
}));

vi.mock('../../web-snapshot/package', () => ({
  loadWebSnapshotScreenshotBlob: loadWebSnapshotScreenshotBlobMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  persistPendingEditorBootstrapPayloadMock.mockResolvedValue('bootstrap-1');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('opens web snapshot screenshots in the image editor', async () => {
  const packageBlob = new Blob(['zip'], { type: 'application/zip' });
  const screenshotBlob = new Blob(['png'], { type: 'image/png' });
  const previewItem = createMediaItem({
    entityId: 'snapshot-1',
    filename: 'snapshot.zip',
    kind: 'web-archive',
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
    sourceTitle: 'Snapshot page',
    sourceUrl: 'https://example.com/page',
  });
  const { controller } = createController({ previewItem });

  getMediaAssetBlobMock.mockResolvedValue(packageBlob);
  loadWebSnapshotScreenshotBlobMock.mockResolvedValue(screenshotBlob);

  await openSnapshotScreenshotInEditor(controller, runBusyAction);

  expect(loadWebSnapshotScreenshotBlobMock).toHaveBeenCalledWith(packageBlob);
  expect(persistPendingEditorBootstrapPayloadMock).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceFaviconUrl: null,
      title: 'Snapshot page',
      url: 'https://example.com/page',
    })
  );
  expect(browserTabsCreateMock).toHaveBeenCalledWith({
    url: expect.stringContaining('session=session-1'),
  });
});

it('ignores non-web-snapshot preview items and reports missing packages', async () => {
  const image = createMediaItem({ id: 'image-1', kind: 'image' });
  const { controller: imageController } = createController({ previewItem: image });

  await openSnapshotScreenshotInEditor(imageController, runBusyAction);
  expect(getMediaAssetBlobMock).not.toHaveBeenCalled();

  const snapshot = createMediaItem({
    id: 'asset-web',
    kind: 'web-archive',
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
  });
  const { controller: snapshotController } = createController({ previewItem: snapshot });
  const runBusy = vi.fn(async (task: () => Promise<void>) => {
    await expect(task()).rejects.toThrow(snapshot.filename);
  });
  getMediaAssetBlobMock.mockResolvedValue(null);

  await openSnapshotScreenshotInEditor(snapshotController, runBusy);
});

it('uses snapshot fallback metadata when opening the screenshot editor', async () => {
  const packageBlob = new Blob(['zip'], { type: 'application/zip' });
  const screenshotBlob = new Blob(['png'], { type: 'image/png' });
  const previewItem = createMediaItem({
    filename: 'fallback.zip',
    id: 'snapshot-asset-1',
    kind: 'web-archive',
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
    sourceTitle: null,
    sourceUrl: null,
  });
  const { controller } = createController({ previewItem });

  getMediaAssetBlobMock.mockResolvedValue(packageBlob);
  loadWebSnapshotScreenshotBlobMock.mockResolvedValue(screenshotBlob);

  await openSnapshotScreenshotInEditor(controller, runBusyAction);

  expect(getMediaAssetBlobMock).toHaveBeenCalledWith('snapshot-asset-1');
  expect(persistPendingEditorBootstrapPayloadMock).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'fallback.zip', url: '' })
  );
});

it('surfaces screenshot read errors through the busy action', async () => {
  class ErroringFileReader {
    onerror: (() => void) | null = null;
    onload: (() => void) | null = null;
    result: string | null = null;

    readAsDataURL() {
      this.onerror?.();
    }
  }

  const previewItem = createMediaItem({
    kind: 'web-archive',
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
  });
  const { controller } = createController({ previewItem });
  const runBusy = vi.fn(async (task: () => Promise<void>) => {
    await expect(task()).rejects.toThrow('Failed to read snapshot screenshot.');
  });

  vi.stubGlobal('FileReader', ErroringFileReader);
  getMediaAssetBlobMock.mockResolvedValue(new Blob(['zip']));
  loadWebSnapshotScreenshotBlobMock.mockResolvedValue(new Blob(['png']));

  await openSnapshotScreenshotInEditor(controller, runBusy);
});
