import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { appendBackupAssetDescriptor, resolveBackupMediaBlob } from './index';
import { createBackupExportBudget } from '../export/blob/budget';
import { createMediaHubBackupExportOptions } from '../export/options';
import {
  ASSET_REFS_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  RECORDING_TELEMETRY_STORE,
  STORE_NAME,
} from '../storage/constants';
import type { MediaHubBackupAssetDescriptor } from '../contracts/types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const { getStoredImageWorkspaceMock, readAssetFileMock } = vi.hoisted(() => ({
  getStoredImageWorkspaceMock: vi.fn(),
  readAssetFileMock: vi.fn(),
}));
vi.mock('../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/assets')>()),
  readAssetFile: readAssetFileMock,
}));
vi.mock('../../../composition/persistence/image-workspaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/image-workspaces')>()),
  recoverAndGetStoredImageWorkspace: getStoredImageWorkspaceMock,
}));
vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: async (blob: Blob) =>
    `data:${blob.type || 'application/octet-stream'};base64,dGVzdA==`,
}));

function createEntry(
  source: MediaLibraryEntry['source'],
  overrides: Partial<MediaLibraryEntry> = {}
): MediaLibraryEntry {
  return {
    blob: new Blob(['asset']),
    createdAt: 10,
    duration: null,
    filename: 'asset.webm',
    height: 1080,
    id: 'asset-1',
    kind: 'video',
    mimeType: 'video/webm',
    originalFilename: 'asset.webm',
    size: 5,
    source,
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 20,
    width: 1920,
    ...overrides,
  };
}

async function assertResolvesScreenshotBlob(): Promise<void> {
  const entry = createEntry({ kind: 'screenshot' });

  const blob = await resolveBackupMediaBlob(
    {
      get: async () => {
        throw new Error('should not query stores for screenshots');
      },
    },
    entry
  );

  expect(blob).toBe(entry.blob);
}

async function assertResolvesStoreBackedBlobs(): Promise<void> {
  const recordingEntry = createEntry({
    kind: 'recording',
    recordingId: 'rec-1',
  });
  const projectExportEntry = createEntry({
    exportId: 'export-1',
    kind: 'project-export',
    projectId: 'project-1',
  });
  const projectAssetEntry = createEntry(
    {
      kind: 'project-asset',
      projectAssetId: 'project-asset-1',
    },
    {}
  );
  const recordingBlob = new Blob(['recording']);
  const projectExportBlob = new Blob(['project-export']);
  const projectAssetBlob = new Blob(['project-asset']);
  const calls: Array<{ key: string; storeName: string }> = [];

  const db = {
    get: async (storeName: string, key: string) => {
      calls.push({ key, storeName });

      if (storeName === STORE_NAME) {
        return {
          assetId: 'asset-recording',
          createdAt: 1,
          filename: `${key}.webm`,
          id: key,
          mimeType: 'video/webm',
          size: recordingBlob.size,
        };
      }

      if (storeName === PROJECT_EXPORTS_STORE) {
        return {
          assetId: 'asset-export',
          createdAt: 1,
          duration: 1,
          filename: `${key}.webm`,
          fps: 30,
          height: 100,
          id: key,
          mimeType: 'video/webm',
          projectId: 'project-1',
          size: projectExportBlob.size,
          width: 100,
        };
      }

      if (storeName === ASSET_REFS_STORE) {
        return {
          assetId: key,
          createdAt: 1,
          location: { kind: 'opfs', objectKey: `objects/${key}` },
          mimeType: 'video/webm',
          sha256: null,
          size: key === 'asset-recording' ? recordingBlob.size : projectExportBlob.size,
        };
      }

      if (storeName === PROJECT_ASSETS_STORE) {
        return {
          assetId: 'asset-project',
          createdAt: 1,
          id: key,
          mimeType: 'video/webm',
          size: projectAssetBlob.size,
        };
      }

      return undefined;
    },
  };
  readAssetFileMock.mockReset();
  readAssetFileMock
    .mockResolvedValueOnce(recordingBlob)
    .mockResolvedValueOnce(projectExportBlob)
    .mockResolvedValueOnce(projectAssetBlob);

  await expect(resolveBackupMediaBlob(db, recordingEntry)).resolves.toBe(recordingBlob);
  await expect(resolveBackupMediaBlob(db, projectExportEntry)).resolves.toBe(projectExportBlob);
  await expect(resolveBackupMediaBlob(db, projectAssetEntry)).resolves.toBe(projectAssetBlob);
  expect(calls).toEqual([
    { key: 'rec-1', storeName: STORE_NAME },
    { key: 'asset-recording', storeName: ASSET_REFS_STORE },
    { key: 'export-1', storeName: PROJECT_EXPORTS_STORE },
    { key: 'asset-export', storeName: ASSET_REFS_STORE },
    { key: 'project-asset-1', storeName: PROJECT_ASSETS_STORE },
    { key: 'asset-project', storeName: ASSET_REFS_STORE },
  ]);
}

function createZipRecorder(): RecordingJSZip {
  return new RecordingJSZip();
}

class RecordingJSZip extends JSZip {
  readonly entries = new Set<string>();

  override file(path: string): JSZip.JSZipObject | null;
  override file(path: RegExp): JSZip.JSZipObject[];
  override file(path: string, data: unknown, options?: JSZip.JSZipFileOptions): this;
  override file(path: string, data: null, options?: JSZip.JSZipFileOptions & { dir: true }): this;
  override file(
    path: string | RegExp,
    data?: unknown
  ): JSZip.JSZipObject | JSZip.JSZipObject[] | null | this {
    if (path instanceof RegExp) {
      return [];
    }
    if (data === undefined) {
      return null;
    }
    this.entries.add(path);
    return this;
  }
}

function createRecordingTelemetry(recordingId = 'recording-1'): RecordingTelemetryEntry {
  return {
    actionEvents: [],
    captureMode: CaptureMode.TAB,
    createdAt: 1,
    cursorTrack: null,
    recordingId,
    signals: [],
    updatedAt: 2,
    viewport: null,
  };
}

function createExpectedAssetDescriptor(
  entry: MediaLibraryEntry,
  archivedSize = entry.size
): MediaHubBackupAssetDescriptor {
  const { blob: _blob, ...entryWithoutBlob } = entry;

  return {
    assetPath: `assets/${encodeURIComponent(entry.id)}`,
    entry: { ...entryWithoutBlob, size: archivedSize },
    thumbnailPath: `thumbnails/${encodeURIComponent(entry.id)}`,
  };
}

function expectArchiveZipCalls(entry: MediaLibraryEntry, zip: RecordingJSZip): void {
  expect([...zip.entries]).toEqual([
    `assets/${encodeURIComponent(entry.id)}`,
    `thumbnails/${encodeURIComponent(entry.id)}`,
  ]);
}

async function assertAppendsArchiveDescriptor(): Promise<void> {
  const entry = createEntry({
    kind: 'project-export',
    exportId: 'export-1',
    projectId: 'project-1',
  });
  const zip = createZipRecorder();
  const assets: MediaHubBackupAssetDescriptor[] = [];
  const fileBlob = new Blob(['video-export']);
  const thumbnailBlob = new Blob(['thumbnail']);
  readAssetFileMock.mockReset();
  readAssetFileMock.mockResolvedValueOnce(fileBlob);

  const nextThumbnailCount = await appendBackupAssetDescriptor({
    assets,
    budget: createBackupExportBudget(),
    db: {
      get: async (storeName: string, key: string) => {
        if (storeName === PROJECT_EXPORTS_STORE && key === 'export-1') {
          return {
            assetId: 'asset-export',
            createdAt: 1,
            duration: 1,
            filename: 'asset.webm',
            fps: 30,
            height: 1080,
            id: 'export-1',
            mimeType: 'video/webm',
            projectId: 'project-1',
            size: fileBlob.size,
            width: 1920,
          };
        }

        if (storeName === ASSET_REFS_STORE && key === 'asset-export') {
          return createAssetRef('asset-export', fileBlob.size);
        }

        if (storeName === 'thumbnails' && key === entry.id) {
          return { blob: thumbnailBlob };
        }

        return undefined;
      },
    },
    encodePathSegment: encodeURIComponent,
    entry,
    thumbnailCount: 0,
    zip,
  });

  expect(nextThumbnailCount).toBe(1);
  expect(assets).toEqual([createExpectedAssetDescriptor(entry, fileBlob.size)]);
  expectArchiveZipCalls(entry, zip);
}

async function assertAppendsRecordingTelemetryDescriptor(): Promise<void> {
  const entry = createEntry(
    { kind: 'recording', recordingId: 'recording-1' },
    { id: 'recording:recording-1' }
  );
  const zip = createZipRecorder();
  const assets: MediaHubBackupAssetDescriptor[] = [];
  const telemetry = createRecordingTelemetry();
  readAssetFileMock.mockReset();
  readAssetFileMock.mockResolvedValueOnce(new Blob(['recording']));

  await appendBackupAssetDescriptor({
    assets,
    budget: createBackupExportBudget(),
    db: {
      get: async (storeName: string, key: string) => {
        if (storeName === STORE_NAME && key === 'recording-1') {
          return createStoredRecording('recording-1', 'asset-recording', 9);
        }

        if (storeName === ASSET_REFS_STORE && key === 'asset-recording') {
          return createAssetRef('asset-recording', 9);
        }

        if (storeName === RECORDING_TELEMETRY_STORE && key === 'recording-1') {
          return telemetry;
        }

        return undefined;
      },
    },
    encodePathSegment: encodeURIComponent,
    entry,
    thumbnailCount: 0,
    zip,
  });

  expect(assets[0]).toEqual(
    expect.objectContaining({
      assetPath: 'assets/recording%3Arecording-1',
      recordingTelemetry: telemetry,
      thumbnailPath: null,
    })
  );
}

function createStoredRecording(id: string, assetId: string, size: number) {
  return {
    assetId,
    createdAt: 1,
    filename: `${id}.webm`,
    id,
    mimeType: 'video/webm',
    size,
  };
}

function createAssetRef(assetId: string, size: number) {
  return {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    mimeType: 'video/webm',
    sha256: null,
    size,
  };
}

async function assertThrowsWhenBlobIsMissing(): Promise<void> {
  const entry = createEntry({ kind: 'recording', recordingId: 'recording-1' });

  await expect(
    appendBackupAssetDescriptor({
      assets: [],
      budget: createBackupExportBudget(),
      db: {
        get: async () => undefined,
      },
      encodePathSegment: encodeURIComponent,
      entry,
      thumbnailCount: 0,
      zip: createZipRecorder(),
    })
  ).rejects.toThrow('asset.webm');
}

function createStoredPrivateWorkspace() {
  return {
    aggregateId: 'asset-1',
    createdAt: 1,
    document: {
      assets: [
        { assetId: 'editor-source', role: 'source-image' },
        { assetId: 'editor-favicon', role: 'browser-favicon' },
      ],
      browserFrame: {
        canvasMode: 'resize' as const,
        contentMode: 'push-down' as const,
        favicon: { assetId: 'editor-favicon' },
        title: 'Private browser title',
        url: 'https://private.test/reset?token=secret',
      },
      canvasHeight: 80,
      canvasJson: '{"objects":[]}',
      canvasWidth: 100,
      frame: {
        backgroundBlurAmount: 0,
        backgroundColor: '#fff',
        backgroundGradientAngle: 90,
        backgroundGradientFrom: '#fff',
        backgroundGradientTo: '#000',
        backgroundImage: null,
        backgroundImageFit: 'cover' as const,
        backgroundMode: 'color' as const,
        browserMode: true,
        browserTitle: 'Private frame title',
        browserUrl: 'https://private.test/invite?code=secret',
        layoutMode: 'fit-image' as const,
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0,
        paddingTop: 0,
      },
      sourceDisplayHeight: 80,
      sourceDisplayWidth: 100,
      sourceHeight: 80,
      sourceImage: { assetId: 'editor-source' },
      sourceLeft: 0,
      sourceName: 'capture.png',
      sourceTop: 0,
      sourceWidth: 100,
      version: 3 as const,
    },
    revision: 1,
    sourceTitle: 'Private workspace title',
    sourceUrl: 'https://private.test/workspace?token=secret',
    updatedAt: 2,
  };
}

async function appendPrivateWorkspaceDescriptor(includeSourceMetadata: boolean) {
  const entry = createEntry(
    { kind: 'screenshot' },
    { id: 'asset-1', kind: 'screenshot', mimeType: 'image/png' }
  );
  const assets: MediaHubBackupAssetDescriptor[] = [];
  readAssetFileMock.mockReset();
  readAssetFileMock.mockResolvedValue(new File(['private-file-bytes'], 'asset.png'));
  getStoredImageWorkspaceMock.mockResolvedValueOnce(createStoredPrivateWorkspace());

  await appendBackupAssetDescriptor({
    assets,
    budget: createBackupExportBudget(),
    db: {
      get: async (storeName: string, key: string) => {
        if (storeName === ASSET_REFS_STORE) return createAssetRef(key, 18);
        return undefined;
      },
    },
    encodePathSegment: encodeURIComponent,
    entry,
    options: createMediaHubBackupExportOptions({ includeSourceMetadata }),
    thumbnailCount: 0,
    zip: createZipRecorder(),
  });

  return assets[0]?.workspace;
}

describe('media-hub backup archive helpers', () => {
  it('resolves screenshot blobs directly from the media entry', assertResolvesScreenshotBlob);

  it(
    'reads recording and project-asset blobs from the owning stores',
    assertResolvesStoreBackedBlobs
  );

  it(
    'appends archive descriptor and thumbnail path to the zip payload',
    assertAppendsArchiveDescriptor
  );
  it(
    'attaches recording telemetry to backup descriptors for recording assets',
    assertAppendsRecordingTelemetryDescriptor
  );
  it('fails when the backing asset blob is missing', assertThrowsWhenBlobIsMissing);

  it('strips source metadata from a file-backed image workspace', async () => {
    const workspace = await appendPrivateWorkspaceDescriptor(false);

    expect(workspace).toEqual(
      expect.objectContaining({
        sourceTitle: null,
        sourceUrl: null,
        document: expect.objectContaining({
          browserFrame: expect.objectContaining({
            faviconDataUrl: null,
            title: '',
            url: '',
          }),
          frame: expect.objectContaining({ browserTitle: '', browserUrl: '' }),
        }),
      })
    );
    expect(JSON.stringify(workspace)).not.toContain('private.test');
    expect(JSON.stringify(workspace)).not.toContain('private-file-bytes');
  });

  it('retains and sanitizes declared source metadata in a file-backed image workspace', async () => {
    const workspace = await appendPrivateWorkspaceDescriptor(true);

    expect(workspace?.document.browserFrame).toEqual(
      expect.objectContaining({
        title: 'Private browser title',
        url: 'https://private.test/',
      })
    );
    expect(workspace?.document.frame).toEqual(
      expect.objectContaining({
        browserTitle: 'Private frame title',
        browserUrl: 'https://private.test/',
      })
    );
    expect(workspace?.document.browserFrame?.faviconDataUrl).toMatch(/^data:/);
  });
});
