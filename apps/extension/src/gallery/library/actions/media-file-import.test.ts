// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createController, createMediaItem } from './test-support';

const mocks = vi.hoisted(() => ({
  assertSafe: vi.fn(),
  saveRecordings: vi.fn(),
  saveScreenshot: vi.fn(),
  getMediaAssetBlob: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/media-library/index.library.ts',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/media-library/index.library.ts')
    >()),
    getMediaAssetBlob: mocks.getMediaAssetBlob,
  })
);

vi.mock('../../../features/media-hub/project-assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/media-hub/project-assets')>()),
  assertSafeProjectAssetStorageInput: mocks.assertSafe,
}));

vi.mock('../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub/store')>()),
  saveRecordingsBatchSafely: mocks.saveRecordings,
  saveScreenshotMediaAssetSafely: mocks.saveScreenshot,
}));

import { createCancelActiveImportAction } from './backup';
import { createImportMediaFilesAction } from './media-file-import';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMediaAssetBlob.mockReset();
  mocks.saveScreenshot.mockResolvedValue({ id: 'image-1' });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createImage(name: string): File {
  return new File(['image'], name, { type: 'image/png' });
}

it('imports supported images independently and reports skipped files', async () => {
  const { controller, getState } = createController();
  const action = createImportMediaFilesAction(controller, async (run) => run());

  await action([createImage('photo.png'), new File(['text'], 'notes.txt', { type: 'text/plain' })]);

  expect(mocks.assertSafe).toHaveBeenCalledTimes(1);
  expect(mocks.saveScreenshot).toHaveBeenCalledWith(
    expect.objectContaining({ filename: 'photo.png', kind: 'image' })
  );
  expect(getState().storage.activeImport).toMatchObject({
    failedFilenames: ['notes.txt'],
    kind: 'media-files',
    result: { imported: 1, skipped: 1 },
    status: 'completed',
  });
  expect(controller.actions.storage.refresh).toHaveBeenCalledTimes(1);
});

it('pauses before importing exact filename, size, and content matches', async () => {
  const file = createImage('photo.png');
  const existing = createMediaItem({ filename: file.name, size: file.size });
  const { controller, getState } = createController({ filteredItems: [existing] });
  mocks.getMediaAssetBlob.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  const action = createImportMediaFilesAction(controller, async (run) => run());

  await action([file]);

  expect(mocks.saveScreenshot).not.toHaveBeenCalled();
  expect(getState().storage.activeImport).toBeNull();
  const pendingMediaImport = getState().storage.pendingMediaImport;
  expect(pendingMediaImport).toMatchObject({
    conflicts: [{ filename: 'photo.png', size: file.size }],
  });

  await action([file], 'skip');

  expect(mocks.saveScreenshot).not.toHaveBeenCalled();
  expect(getState().storage.pendingMediaImport).toBeNull();
  expect(getState().storage.activeImport).toMatchObject({
    progress: { bytesRead: file.size, rootsComplete: 1 },
    result: { conflictsResolved: 1, imported: 0, skipped: 1 },
    status: 'completed',
  });
});

it('imports an exact match when the user explicitly keeps both copies', async () => {
  const file = createImage('photo.png');
  const existing = createMediaItem({ filename: file.name, size: file.size });
  const { controller, getState } = createController({ filteredItems: [existing] });
  mocks.getMediaAssetBlob.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  const action = createImportMediaFilesAction(controller, async (run) => run());

  await action([file], 'duplicate');

  expect(mocks.getMediaAssetBlob).not.toHaveBeenCalled();
  expect(mocks.saveScreenshot).toHaveBeenCalledTimes(1);
  expect(getState().storage.activeImport).toMatchObject({
    result: { conflictsResolved: 0, imported: 1, skipped: 0 },
    status: 'completed',
  });
});

it('does not report a conflict for a same-name and same-size file with different bytes', async () => {
  const file = createImage('photo.png');
  const existing = createMediaItem({ filename: file.name, size: file.size });
  const { controller, getState } = createController({ filteredItems: [existing] });
  mocks.getMediaAssetBlob.mockResolvedValue(new Blob(['other'], { type: 'image/png' }));
  const action = createImportMediaFilesAction(controller, async (run) => run());

  await action([file]);

  expect(getState().storage.pendingMediaImport).toBeNull();
  expect(mocks.saveScreenshot).toHaveBeenCalledTimes(1);
});

it('marks a selection as failed when no file can be imported', async () => {
  const { controller, getState } = createController();
  const action = createImportMediaFilesAction(controller, async (run) => run());

  await action([new File(['text'], 'notes.txt', { type: 'text/plain' })]);

  expect(getState().storage.activeImport).toMatchObject({
    failedFilenames: ['notes.txt'],
    result: { imported: 0, skipped: 1 },
    status: 'failed',
  });
  expect(controller.actions.storage.refresh).not.toHaveBeenCalled();
});

it('stores decoded dimensions and duration for an imported video', async () => {
  const { controller, getState } = createController();
  const nativeCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
    const element = nativeCreateElement(tagName);
    if (tagName === 'canvas') {
      Object.defineProperty(element, 'getContext', {
        configurable: true,
        value: vi.fn(() => ({ drawImage: vi.fn() })),
      });
      return element;
    }
    if (tagName !== 'video') return element;
    const video = element as HTMLVideoElement;
    Object.defineProperties(video, {
      duration: { configurable: true, value: 14.5 },
      videoHeight: { configurable: true, value: 1080 },
      videoWidth: { configurable: true, value: 1920 },
      src: {
        configurable: true,
        set: () =>
          queueMicrotask(() => {
            video.onloadedmetadata?.(new Event('loadedmetadata'));
            video.onloadeddata?.(new Event('loadeddata'));
          }),
      },
    });
    return video;
  });
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:video'),
    revokeObjectURL: vi.fn(),
  });
  const action = createImportMediaFilesAction(controller, async (run) => run());

  await action([new File(['video'], 'clip.mp4', { type: 'video/mp4' })]);

  expect(mocks.saveRecordings).toHaveBeenCalledWith([
    expect.objectContaining({
      filename: 'clip.mp4',
      mediaMetadata: { duration: 14.5, height: 1080, kind: 'video', width: 1920 },
      mimeType: 'video/mp4',
    }),
  ]);
  expect(getState().storage.activeImport).toMatchObject({
    result: { imported: 1, skipped: 0 },
    status: 'completed',
  });
});

it('rejects a video that exposes metadata but cannot decode a frame', async () => {
  const { controller, getState } = createController();
  const nativeCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
    const element = nativeCreateElement(tagName);
    if (tagName !== 'video') return element;
    const video = element as HTMLVideoElement;
    Object.defineProperties(video, {
      duration: { configurable: true, value: 14.5 },
      videoHeight: { configurable: true, value: 1080 },
      videoWidth: { configurable: true, value: 1920 },
      src: {
        configurable: true,
        set: () =>
          queueMicrotask(() => {
            video.onloadedmetadata?.(new Event('loadedmetadata'));
            video.onerror?.(new Event('error'));
          }),
      },
    });
    return video;
  });
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:corrupt-video'),
    revokeObjectURL: vi.fn(),
  });
  const action = createImportMediaFilesAction(controller, async (run) => run());

  await action([new File(['video'], 'corrupt.mp4', { type: 'video/mp4' })]);

  expect(mocks.saveRecordings).not.toHaveBeenCalled();
  expect(getState().storage.activeImport).toMatchObject({
    failedFilenames: ['corrupt.mp4'],
    result: { imported: 0, skipped: 1 },
    status: 'failed',
  });
});

it('stops before the next file when the user cancels an active import', async () => {
  const { controller, getState } = createController();
  let releaseSave: (() => void) | undefined;
  mocks.saveScreenshot.mockImplementationOnce(
    () => new Promise<void>((resolve) => (releaseSave = resolve))
  );
  const action = createImportMediaFilesAction(controller, async (run) => run());
  const pending = action([createImage('first.png'), createImage('second.png')]);

  createCancelActiveImportAction(controller)();
  releaseSave?.();
  await pending;

  expect(mocks.saveScreenshot).toHaveBeenCalledTimes(1);
  expect(getState().storage.activeImport).toMatchObject({
    result: { imported: 1, skipped: 0 },
    status: 'cancelled',
  });
});
