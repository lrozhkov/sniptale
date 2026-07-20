import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { appendBackupAssetDescriptor, resolveBackupMediaBlob } from './index';
import { createBackupExportBudget } from '../export/blob/budget';
import { PROJECT_ASSETS_STORE, RECORDING_TELEMETRY_STORE, STORE_NAME } from '../storage/constants';
import type { MediaHubBackupAssetDescriptor } from '../contracts/types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

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
    recordingId: 'export-recording-1',
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
        return { blob: key === 'rec-1' ? recordingBlob : projectExportBlob };
      }

      if (storeName === PROJECT_ASSETS_STORE) {
        return { blob: projectAssetBlob };
      }

      return undefined;
    },
  };

  await expect(resolveBackupMediaBlob(db, recordingEntry)).resolves.toBe(recordingBlob);
  await expect(resolveBackupMediaBlob(db, projectExportEntry)).resolves.toBe(projectExportBlob);
  await expect(resolveBackupMediaBlob(db, projectAssetEntry)).resolves.toBe(projectAssetBlob);
  expect(calls).toEqual([
    { key: 'rec-1', storeName: STORE_NAME },
    { key: 'export-recording-1', storeName: STORE_NAME },
    { key: 'project-asset-1', storeName: PROJECT_ASSETS_STORE },
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
    recordingId: 'recording-1',
  });
  const zip = createZipRecorder();
  const assets: MediaHubBackupAssetDescriptor[] = [];
  const fileBlob = new Blob(['video-export']);
  const thumbnailBlob = new Blob(['thumbnail']);

  const nextThumbnailCount = await appendBackupAssetDescriptor({
    assets,
    budget: createBackupExportBudget(),
    db: {
      get: async (storeName: string, key: string) => {
        if (storeName === STORE_NAME && key === 'recording-1') {
          return { blob: fileBlob };
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

  await appendBackupAssetDescriptor({
    assets,
    budget: createBackupExportBudget(),
    db: {
      get: async (storeName: string, key: string) => {
        if (storeName === STORE_NAME && key === 'recording-1') {
          return { blob: new Blob(['recording']) };
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
});
