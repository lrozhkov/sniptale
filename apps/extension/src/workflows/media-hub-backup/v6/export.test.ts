import { describe, expect, it, vi } from 'vitest';
import { openArchiveReader } from '../../../composition/archive-transfer';
import { createArchiveMemorySink } from '../../../composition/archive-transfer/test-support';
import { inspectMediaHubBackupV6 } from './inspect';
import { buildMediaHubBackupExportPlanV6, exportMediaHubBackupV6 } from './export';

function root(bytes = 'media') {
  const blob = new Blob([bytes], { type: 'image/png' });
  const descriptor = {
    mediaSubtype: 'library-item' as const,
    metadataPath: '_sniptale/metadata/media/media-000001.json',
    objectCount: 1,
    rootId: 'media-000001',
    rootKind: 'media' as const,
    totalBytes: blob.size,
  };
  return {
    descriptor,
    load: vi.fn(async () => ({
      metadata: {
        entry: { id: descriptor.rootId, source: { kind: 'screenshot' }, tags: [] },
        originalObjectId: 'object-000001',
      },
      objects: [
        {
          blob,
          ref: {
            filename: 'capture.png',
            mimeType: 'image/png',
            objectId: 'object-000001',
            path: 'Screenshots/capture.png',
            size: blob.size,
          },
        },
      ],
    })),
    summary: {
      draftCount: 0,
      recordingCount: 0,
      sourceMetadataCount: 0,
      telemetryCount: 0,
      thumbnailCount: 0,
      webSnapshotCount: 0,
    },
  };
}

function effectBundleRoot() {
  const blob = new Blob(['image'], { type: 'image/png' });
  const objectId = 'effect-bundle-000001-object-000001';
  return {
    descriptor: {
      mediaSubtype: 'effect-bundle' as const,
      metadataPath: '_sniptale/metadata/media/effect-bundle-demo-pack.json',
      objectCount: 1,
      rootId: 'demo-pack',
      rootKind: 'media' as const,
      totalBytes: blob.size,
    },
    load: vi.fn(async () => ({
      metadata: {
        entry: {
          assets: [
            {
              byteLength: blob.size,
              kind: 'image',
              mimeType: blob.type,
              objectId,
              sha256: 'a'.repeat(64),
            },
          ],
          documents: [{}],
          packId: 'demo-pack',
          retainedByteLength: blob.size,
          version: '1',
        },
      },
      objects: [
        {
          blob,
          ref: {
            filename: 'asset-000001',
            mimeType: 'image/png',
            objectId,
            path: `_sniptale/assets/${objectId}/asset-000001`,
            size: blob.size,
          },
        },
      ],
    })),
    summary: {
      draftCount: 0,
      recordingCount: 0,
      sourceMetadataCount: 0,
      telemetryCount: 0,
      thumbnailCount: 0,
      webSnapshotCount: 0,
    },
  };
}

function projectRoot(kind: 'scenario-project' | 'video-project', id: string) {
  return {
    descriptor: {
      metadataPath: `_sniptale/metadata/${kind}/${id}.json`,
      objectCount: 0,
      rootId: id,
      rootKind: kind,
      totalBytes: 0,
    },
    load: vi.fn(async () => ({ metadata: {}, objects: [] })),
    summary: {
      draftCount: 0,
      recordingCount: 0,
      sourceMetadataCount: 0,
      telemetryCount: 0,
      thumbnailCount: 0,
      webSnapshotCount: 0,
    },
  };
}

describe('media backup v6 archive writing', () => {
  it('round-trips bounded saved Gallery views through the manifest', async () => {
    const plan = buildMediaHubBackupExportPlanV6({
      archiveId: 'archive-views',
      exportedAt: '2026-08-20T00:00:00.000Z',
      galleryViews: [
        {
          createdAt: 1,
          filters: {
            activeTags: ['review'],
            facetFilters: {
              created: [],
              duration: [],
              format: ['png'],
              resolution: [],
              size: [],
              source: ['example.com'],
              updated: [],
            },
            scope: 'library',
          },
          folderFilter: 'screenshot',
          id: 'view-1',
          name: 'Review',
          updatedAt: 1,
        },
      ],
      privacy: {
        includeSourceMetadata: false,
        includeTelemetry: false,
        includeWebSnapshots: false,
      },
      roots: [],
    });
    const output = createArchiveMemorySink();
    await exportMediaHubBackupV6({ plan, sink: output.sink });

    const inspected = await inspectMediaHubBackupV6(output.blob());
    expect(inspected.manifest.galleryViews).toEqual(plan.manifest.galleryViews);
  });

  it('writes a sequential closed archive without loading roots during preflight', async () => {
    const item = root();
    const plan = buildMediaHubBackupExportPlanV6({
      archiveId: 'archive-000001',
      exportedAt: '2026-08-20T00:00:00.000Z',
      privacy: {
        includeSourceMetadata: false,
        includeTelemetry: false,
        includeWebSnapshots: true,
      },
      roots: [item],
    });
    expect(item.load).not.toHaveBeenCalled();
    const output = createArchiveMemorySink();
    const progress = vi.fn();
    await exportMediaHubBackupV6({ onProgress: progress, plan, sink: output.sink });
    expect(item.load).toHaveBeenCalledTimes(1);
    const inspected = await inspectMediaHubBackupV6(output.blob());
    expect(inspected.manifest.totals).toMatchObject({ bytes: 5, objects: 1, roots: 1 });
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ bytesRead: 5, currentFilename: null, rootsComplete: 1 })
    );
    const reader = await openArchiveReader(output.blob());
    expect(
      reader
        .entries()
        .map((entry) => entry.path)
        .sort()
    ).toEqual([
      'Screenshots/capture.png',
      '_sniptale/catalog/media-000001.ndjson',
      '_sniptale/manifest.json',
      '_sniptale/metadata/media/media-000001.json',
    ]);
    await reader.close();
  });

  it('aborts the sink on source-size drift', async () => {
    const item = root();
    item.descriptor.totalBytes = 4;
    const plan = buildMediaHubBackupExportPlanV6({
      privacy: {
        includeSourceMetadata: false,
        includeTelemetry: false,
        includeWebSnapshots: true,
      },
      roots: [item],
    });
    const output = createArchiveMemorySink();
    await expect(exportMediaHubBackupV6({ plan, sink: output.sink })).rejects.toThrow('totals');
    expect(output.aborted).toBe(true);
  });

  it('writes effect-bundle metadata that the strict inspector accepts', async () => {
    const plan = buildMediaHubBackupExportPlanV6({
      privacy: {
        includeSourceMetadata: false,
        includeTelemetry: false,
        includeWebSnapshots: true,
      },
      roots: [effectBundleRoot()],
    });
    const output = createArchiveMemorySink();
    await exportMediaHubBackupV6({ plan, sink: output.sink });
    await expect(inspectMediaHubBackupV6(output.blob())).resolves.toMatchObject({
      rootKeys: ['media:effect-bundle:demo-pack'],
    });
  });
});

describe('media backup v6 export planning', () => {
  it('rejects duplicate root identities before writing', () => {
    const item = root();
    expect(() =>
      buildMediaHubBackupExportPlanV6({
        privacy: {
          includeSourceMetadata: false,
          includeTelemetry: false,
          includeWebSnapshots: true,
        },
        roots: [item, item],
      })
    ).toThrow('identity is duplicated');
  });

  it('orders scenario roots before dependent video roots', () => {
    const plan = buildMediaHubBackupExportPlanV6({
      privacy: {
        includeSourceMetadata: false,
        includeTelemetry: false,
        includeWebSnapshots: false,
      },
      roots: [projectRoot('video-project', 'video'), projectRoot('scenario-project', 'scenario')],
    });

    expect(plan.roots.map((item) => item.descriptor.rootKind)).toEqual([
      'scenario-project',
      'video-project',
    ]);
    expect(plan.manifest.catalogs.map((catalog) => catalog.rootKind)).toEqual([
      'scenario-project',
      'video-project',
    ]);
  });
});
