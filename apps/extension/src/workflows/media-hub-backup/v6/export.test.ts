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
      metadata: { filename: 'capture.png', id: 'portable-media-000001' },
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
      metadata: { id: 'portable-effect-bundle' },
      objects: [
        {
          blob,
          ref: {
            filename: 'asset-000001',
            mimeType: 'image/png',
            objectId: 'effect-bundle-000001-object-000001',
            path: '_sniptale/assets/effect-bundle-000001-object-000001/asset-000001',
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

describe('media backup v6 export', () => {
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
});
