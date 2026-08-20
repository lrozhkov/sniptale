import { describe, expect, it, vi } from 'vitest';
import { createArchiveMemorySink } from '../../../composition/archive-transfer/test-support';
import { inspectMediaHubBackupV6 } from './inspect';
import { buildMediaHubBackupExportPlanV6, exportMediaHubBackupV6 } from './export';

function root(bytes = 'media') {
  const blob = new Blob([bytes], { type: 'image/png' });
  const descriptor = {
    mediaSubtype: 'library-item' as const,
    metadataPath: 'metadata/media/media-000001.json',
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
            path: 'objects/object-000001/capture.png',
            size: blob.size,
          },
        },
      ],
    })),
    summary: {
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
