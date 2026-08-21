import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readFile: vi.fn(), sanitizeSnapshot: vi.fn() }));
vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  readAssetFile: mocks.readFile,
}));
vi.mock('../../../../features/web-snapshot/provenance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/web-snapshot/provenance')>()),
  sanitizeWebSnapshotPackageProvenance: mocks.sanitizeSnapshot,
}));

import { createPersistedEditorDocumentFixture } from '../../../../composition/persistence/document-assets/test-support';
import { createEditorDocumentFixture } from '../../../../editor/document/page-session/document.test-support';
import type {
  MediaLibraryEntry,
  MediaLibraryItem,
} from '../../../../composition/persistence/media-library/contracts';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import { createCleanupWebSnapshotRecord } from '../../../media-hub/cleanup.test-support';
import { createWebSnapshotManifest } from '../../../../features/web-snapshot/manifest';
import { buildMediaRootInventory } from './media';
import { createMediaHubBackupExportOptions } from '../options';
import { createArchivePathAllocator } from '../../../../composition/archive-transfer';

function mediaEntry(overrides: Partial<MediaLibraryEntry> = {}): MediaLibraryEntry {
  return {
    blob: new Blob(['image'], { type: 'image/png' }),
    createdAt: 1,
    duration: null,
    filename: 'capture.png',
    height: 80,
    id: 'media-one',
    kind: 'screenshot',
    mimeType: 'image/png',
    originalFilename: 'capture.png',
    size: 5,
    source: { kind: 'screenshot' },
    sourceFavicon: 'https://example.com/favicon.png',
    sourceTitle: 'Private title',
    sourceUrl: 'https://example.com/private',
    tags: [],
    updatedAt: 2,
    width: 100,
    workspaceRevision: 1,
    ...overrides,
  };
}

function item(entry: ReturnType<typeof mediaEntry>): MediaLibraryItem {
  const { blob: _blob, ...metadata } = entry;
  return { ...metadata, hasThumbnail: false } satisfies MediaLibraryItem;
}

function ref(assetId: string) {
  return {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    mimeType: 'image/png',
    sha256: null,
    size: 6,
  };
}

describe('media v6 root inventory', () => {
  it('excludes drafts by default and places included drafts in readable folders', async () => {
    const entry = mediaEntry({
      id: 'draft-image',
      lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 2 },
    });
    const db = { get: vi.fn(async () => entry) };
    await expect(
      buildMediaRootInventory({
        db,
        items: [item(entry)],
        options: createMediaHubBackupExportOptions(),
        paths: createArchivePathAllocator(),
      })
    ).resolves.toEqual([]);
    const [root] = await buildMediaRootInventory({
      db,
      items: [item(entry)],
      options: createMediaHubBackupExportOptions({ includeDrafts: true }),
      paths: createArchivePathAllocator(),
    });
    expect(root?.summary.draftCount).toBe(1);
    await expect(root?.load()).resolves.toMatchObject({
      objects: [{ ref: { path: 'Drafts/Screenshots/capture.png' } }],
    });
  });

  it('exports screenshot, presentation and editor dependencies as separate files', async () => {
    const entry = mediaEntry();
    const document = createPersistedEditorDocumentFixture(
      createEditorDocumentFixture(),
      'workspace-source'
    );
    const db = {
      get: vi.fn(async (store: string) => {
        if (store === 'media_library') return entry;
        if (store === 'image_workspaces') {
          return {
            aggregateId: entry.id,
            createdAt: 1,
            document,
            revision: 1,
            sourceTitle: 'Private workspace',
            sourceUrl: 'https://example.com/workspace',
            updatedAt: 2,
          };
        }
        if (store === 'asset_refs') return ref('workspace-source');
        if (store === 'aggregate_presentations') {
          return {
            aggregateId: entry.id,
            aggregateKind: 'image',
            presentationRevision: 1,
            previewBlob: new Blob(['preview'], { type: 'image/png' }),
            thumbnailBlob: new Blob(['thumb'], { type: 'image/png' }),
            updatedAt: 2,
          };
        }
        return undefined;
      }),
    };
    mocks.readFile.mockResolvedValue(
      new File(['source'], 'workspace-source.png', { type: 'image/png' })
    );
    const roots = await buildMediaRootInventory({
      db,
      items: [item(entry)],
      options: createMediaHubBackupExportOptions({ includeSourceMetadata: false }),
      paths: createArchivePathAllocator(),
    });
    expect(roots).toHaveLength(1);
    expect(roots[0]?.descriptor).toMatchObject({ objectCount: 4, totalBytes: 23 });
    const payload = await roots[0]!.load();
    expect(payload.objects).toHaveLength(4);
    expect(payload.objects.map((object) => object.ref.path)).toContain('Screenshots/capture.png');
    expect(
      payload.objects.filter((object) => object.ref.path.startsWith('_sniptale/assets/'))
    ).toHaveLength(3);
    expect(payload.metadata).toMatchObject({
      entry: { sourceTitle: null, sourceUrl: null },
      presentation: expect.objectContaining({ thumbnailObjectId: expect.any(String) }),
      workspace: {
        document: expect.objectContaining({ sourceImage: { objectId: expect.any(String) } }),
        sourceTitle: null,
        sourceUrl: null,
      },
    });
    expect(JSON.stringify(payload.metadata)).not.toContain('assetId');
    expect(JSON.stringify(payload.metadata)).not.toContain('workspace-source');
  });

  it('exports recording bytes through OPFS File and telemetry only when requested', async () => {
    const entry = mediaEntry({
      duration: 3,
      filename: 'recording.webm',
      height: 720,
      id: 'recording-media',
      kind: 'video',
      mimeType: 'video/webm',
      size: 5,
      source: { kind: 'recording', recordingId: 'recording-one' },
      width: 1280,
    });
    const db = {
      get: vi.fn(async (store: string) => {
        if (store === 'media_library') return entry;
        if (store === 'recordings') {
          return {
            assetId: 'recording-asset',
            createdAt: 1,
            filename: 'recording.webm',
            id: 'recording-one',
            mimeType: 'video/webm',
            size: 5,
          };
        }
        if (store === 'asset_refs')
          return { ...ref('recording-asset'), mimeType: 'video/webm', size: 5 };
        if (store === 'recording_telemetry') {
          return {
            actionEvents: [],
            captureMode: null,
            createdAt: 1,
            cursorTrack: null,
            recordingId: 'recording-one',
            signals: [],
            updatedAt: 1,
            viewport: null,
          } satisfies RecordingTelemetryEntry;
        }
        return undefined;
      }),
    };
    mocks.readFile.mockResolvedValue(new File(['media'], 'recording.webm', { type: 'video/webm' }));
    const [root] = await buildMediaRootInventory({
      db,
      items: [item(entry)],
      options: createMediaHubBackupExportOptions({ includeTelemetry: true }),
      paths: createArchivePathAllocator(),
    });
    const payload = await root!.load();
    expect(payload.objects[0]?.ref.path).toBe('Recordings/recording.webm');
    expect(payload.metadata).toMatchObject({
      recording: {
        entry: { id: 'recording-one' },
        telemetry: { recordingId: 'recording-one' },
      },
    });
    expect(JSON.stringify(payload.metadata)).not.toContain('recording-asset');
  });

  it('places durable audio in the readable Audio directory', async () => {
    const entry = mediaEntry({
      filename: 'voice note.webm',
      id: 'audio-media',
      kind: 'audio',
      mimeType: 'audio/webm',
    });
    const [root] = await buildMediaRootInventory({
      db: { get: vi.fn(async () => entry) },
      items: [item(entry)],
      options: createMediaHubBackupExportOptions(),
      paths: createArchivePathAllocator(),
    });
    await expect(root?.load()).resolves.toMatchObject({
      objects: [{ ref: { path: 'Audio/voice note.webm' } }],
    });
  });

  it('uses the sanitized snapshot manifest in outer metadata when provenance is disabled', async () => {
    const entry = mediaEntry({
      filename: 'Private title.png',
      id: 'snapshot',
      source: { kind: 'web-snapshot', snapshotId: 'snapshot' },
    });
    const stored = createCleanupWebSnapshotRecord('snapshot');
    stored.manifest = createWebSnapshotManifest({
      id: 'snapshot',
      source: {
        faviconUrl: 'https://example.com/favicon.ico?token=secret',
        title: 'Private title',
        url: 'https://user:pass@example.com/private?token=secret',
      },
    });
    const sanitizedManifest = {
      ...stored.manifest,
      source: { faviconUrl: null, title: null, url: null },
    };
    mocks.sanitizeSnapshot.mockResolvedValue({
      changed: true,
      manifest: sanitizedManifest,
      packageBlob: new Blob(['safe-package'], { type: 'application/zip' }),
      size: 12,
    });
    mocks.readFile
      .mockResolvedValueOnce(new File(['package'], 'snapshot.zip', { type: 'application/zip' }))
      .mockResolvedValueOnce(new File(['image'], 'snapshot.png', { type: 'image/png' }));
    const db = {
      get: vi.fn(async (store: string) => {
        if (store === 'media_library') return entry;
        if (store === 'web_snapshots') return stored;
        if (store === 'asset_refs') return ref('snapshot-asset');
        return undefined;
      }),
    };

    const [root] = await buildMediaRootInventory({
      db,
      items: [item(entry)],
      options: createMediaHubBackupExportOptions({
        includeSourceMetadata: false,
        includeWebSnapshots: true,
      }),
      paths: createArchivePathAllocator(),
    });
    const payload = await root!.load();

    expect(payload.objects.map((object) => object.ref.path)).toEqual([
      'Web snapshots/Snapshot/snapshot.sniptale-web-snapshot.zip',
      'Web snapshots/Snapshot/screenshot.png',
    ]);

    expect(payload.metadata).toMatchObject({
      webSnapshot: { entry: { manifest: { source: sanitizedManifest.source }, size: 12 } },
    });
    expect(JSON.stringify(payload.metadata)).not.toContain('Private title');
    expect(JSON.stringify(payload.metadata)).not.toContain('token=secret');
    expect(payload.objects.map((object) => object.ref.path).join('\n')).not.toContain(
      'Private title'
    );
  });
});
