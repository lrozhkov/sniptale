import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  blobToDataUrlMock,
  browserDownloadsDownloadMock,
  executeDownloadBlobMock,
  getRecordingMock,
  loadSettingsMock,
} = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
  browserDownloadsDownloadMock: vi.fn(),
  executeDownloadBlobMock: vi.fn(),
  getRecordingMock: vi.fn(),
  loadSettingsMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/downloads', () => ({
  BrowserDownloadsAdapter: undefined,
  browserDownloads: {
    download: browserDownloadsDownloadMock,
  },
}));

vi.mock('../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/recordings/index')>()),
  getRecording: getRecordingMock,
}));

vi.mock('../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/media-utils/data-url')>()),
  blobToDataUrl: blobToDataUrlMock,
  dataUrlToBlob: vi.fn(),
}));

vi.mock('../../platform/media-utils/image-thumbnail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/media-utils/image-thumbnail')>()),
  createImageThumbnailBlob: vi.fn(),
}));

vi.mock('../../platform/media-utils/video-thumbnails', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/media-utils/video-thumbnails')>()),
  createVideoThumbnailBlob: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/media/image-load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-load')>()),
  loadImageFromBlob: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: vi.fn(),
}));

vi.mock('../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/media-hub/store')>()),
  deleteMediaLibraryAssetsBatchSafely: vi.fn(),
  deleteOrphanedRawRecordingsSafely: vi.fn(),
  deleteStorageCleanupCandidatesSafely: vi.fn(),
  filterMediaItemsByTags: vi.fn(),
  getStorageCleanupReport: vi.fn(),
  saveProjectAssetSafely: vi.fn(),
  saveProjectExportSafely: vi.fn(),
  saveRecordingSafely: vi.fn(),
  saveRecordingTelemetrySafely: vi.fn(),
  saveScreenshotMediaAssetSafely: vi.fn(),
  saveWebSnapshotMediaAssetSafely: vi.fn(),
  updateMediaLibraryEntrySafely: vi.fn(),
}));

vi.mock('../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

vi.mock('../routing-contracts/download-port', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../routing-contracts/download-port')>()),
  executeDownloadBlob: executeDownloadBlobMock,
}));

import { downloadRecordingSidecar, downloadStoredRecording } from './recording-download';

beforeEach(() => {
  vi.clearAllMocks();
  browserDownloadsDownloadMock.mockResolvedValue(17);
  executeDownloadBlobMock.mockResolvedValue(17);
  blobToDataUrlMock.mockResolvedValue('data:video/webm;base64,dmlkZW8=');
  getRecordingMock.mockResolvedValue({ file: new Blob(['video'], { type: 'video/webm' }) });
  loadSettingsMock.mockResolvedValue({
    defaultVideoPresetId: 'preset-1',
    presets: [{ id: 'preset-1', path: '../../Recordings\\Today' }],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('downloads stored recordings through the blob download owner', async () => {
  const blob = new Blob(['video'], { type: 'video/webm' });
  getRecordingMock.mockResolvedValue({ file: blob });

  await expect(downloadStoredRecording('recording-1', '../clip?.webm')).resolves.toBe(17);

  expect(getRecordingMock).toHaveBeenCalledWith('recording-1');
  expect(executeDownloadBlobMock).toHaveBeenCalledWith(blob, '../clip?.webm', 'preset-1');
  expect(blobToDataUrlMock).not.toHaveBeenCalled();
  expect(browserDownloadsDownloadMock).not.toHaveBeenCalled();
});

it('downloads sidecar payloads without accepting arbitrary URL input', async () => {
  await expect(
    downloadRecordingSidecar({
      content: 'WEBVTT',
      filename: 'clip.vtt',
      mimeType: 'text/vtt',
    })
  ).resolves.toBe(17);

  expect(executeDownloadBlobMock).toHaveBeenCalledWith(expect.any(Blob), 'clip.vtt', 'preset-1');
  expect(browserDownloadsDownloadMock).not.toHaveBeenCalled();
});

it('rejects unsafe sidecar filenames before starting a download', async () => {
  await expect(
    downloadRecordingSidecar({
      content: 'WEBVTT',
      filename: '../clip.vtt',
      mimeType: 'text/vtt',
    })
  ).rejects.toThrow('Invalid recording sidecar payload');

  expect(browserDownloadsDownloadMock).not.toHaveBeenCalled();
});

it('rejects oversized sidecar payloads before starting a download', async () => {
  await expect(
    downloadRecordingSidecar({
      content: 'A'.repeat(5 * 1024 * 1024 + 1),
      filename: 'clip.vtt',
      mimeType: 'text/vtt',
    })
  ).rejects.toThrow('Recording sidecar payload is too large');

  expect(browserDownloadsDownloadMock).not.toHaveBeenCalled();
});
