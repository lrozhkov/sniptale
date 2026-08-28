// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openSnapshotScreenshotInEditor } from './snapshot-screenshot';
import { createController, createMediaItem, runBusyAction } from './test-support/index';

const {
  browserTabsCreateMock,
  getWebSnapshotScreenshotFileMock,
  persistPendingEditorBootstrapPayloadMock,
  validateWebSnapshotScreenshotBlobMock,
} = vi.hoisted(() => ({
  browserTabsCreateMock: vi.fn(),
  getWebSnapshotScreenshotFileMock: vi.fn(),
  persistPendingEditorBootstrapPayloadMock: vi.fn(),
  validateWebSnapshotScreenshotBlobMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { create: browserTabsCreateMock },
}));

vi.mock('../../../composition/persistence/web-snapshots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/web-snapshots')>()),
  getWebSnapshotScreenshotFile: getWebSnapshotScreenshotFileMock,
}));

vi.mock('../../../features/web-snapshot/screenshot-validation', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../features/web-snapshot/screenshot-validation')
  >()),
  validateWebSnapshotScreenshotBlob: validateWebSnapshotScreenshotBlobMock,
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

beforeEach(() => {
  vi.clearAllMocks();
  persistPendingEditorBootstrapPayloadMock.mockResolvedValue('bootstrap-1');
  validateWebSnapshotScreenshotBlobMock.mockResolvedValue({ height: 720, width: 1280 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('opens web snapshot screenshots in the image editor', async () => {
  const screenshotBlob = new File(['png'], 'screenshot.png', { type: 'image/png' });
  const previewItem = createMediaItem({
    entityId: 'snapshot-1',
    filename: 'snapshot.sniptale-page-package.zip',
    kind: 'web-archive',
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
    sourceTitle: 'Snapshot page',
    sourceUrl: 'https://example.com/page',
  });
  const { controller } = createController({ previewItem });

  getWebSnapshotScreenshotFileMock.mockResolvedValue(screenshotBlob);

  await openSnapshotScreenshotInEditor(controller, runBusyAction);

  expect(getWebSnapshotScreenshotFileMock).toHaveBeenCalledWith('snapshot-1');
  expect(validateWebSnapshotScreenshotBlobMock).toHaveBeenCalledWith(screenshotBlob);
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

it.each([
  ['corrupt', 'Web snapshot screenshot is invalid.'],
  ['over-dimension', 'Web snapshot screenshot dimensions exceed safe limits.'],
])('rejects %s web snapshot screenshots before editor bootstrap', async (_case, message) => {
  const screenshotBlob = new File(['unsafe'], 'screenshot.png', { type: 'image/png' });
  const previewItem = createMediaItem({
    entityId: 'snapshot-1',
    kind: 'web-archive',
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
  });
  const { controller } = createController({ previewItem });
  const runBusy = vi.fn(async (task: () => Promise<void>) => {
    await expect(task()).rejects.toThrow(message);
  });
  getWebSnapshotScreenshotFileMock.mockResolvedValue(screenshotBlob);
  validateWebSnapshotScreenshotBlobMock.mockRejectedValue(new Error(message));

  await openSnapshotScreenshotInEditor(controller, runBusy);

  expect(validateWebSnapshotScreenshotBlobMock).toHaveBeenCalledWith(screenshotBlob);
  expect(persistPendingEditorBootstrapPayloadMock).not.toHaveBeenCalled();
  expect(browserTabsCreateMock).not.toHaveBeenCalled();
});

it('ignores non-web-snapshot preview items and reports missing packages', async () => {
  const image = createMediaItem({ id: 'image-1', kind: 'image' });
  const { controller: imageController } = createController({ previewItem: image });

  await openSnapshotScreenshotInEditor(imageController, runBusyAction);
  expect(getWebSnapshotScreenshotFileMock).not.toHaveBeenCalled();

  const snapshot = createMediaItem({
    id: 'asset-web',
    kind: 'web-archive',
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
  });
  const { controller: snapshotController } = createController({ previewItem: snapshot });
  const runBusy = vi.fn(async (task: () => Promise<void>) => {
    await expect(task()).rejects.toThrow(snapshot.filename);
  });
  getWebSnapshotScreenshotFileMock.mockResolvedValue(null);

  await openSnapshotScreenshotInEditor(snapshotController, runBusy);
});

it('uses snapshot fallback metadata when opening the screenshot editor', async () => {
  const screenshotBlob = new File(['png'], 'screenshot.png', { type: 'image/png' });
  const previewItem = createMediaItem({
    filename: 'fallback.zip',
    id: 'snapshot-asset-1',
    kind: 'web-archive',
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
    sourceTitle: null,
    sourceUrl: null,
  });
  const { controller } = createController({ previewItem });

  getWebSnapshotScreenshotFileMock.mockResolvedValue(screenshotBlob);

  await openSnapshotScreenshotInEditor(controller, runBusyAction);

  expect(getWebSnapshotScreenshotFileMock).toHaveBeenCalledWith('snapshot-asset-1');
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
  getWebSnapshotScreenshotFileMock.mockResolvedValue(new File(['png'], 'screenshot.png'));

  await openSnapshotScreenshotInEditor(controller, runBusy);
});
