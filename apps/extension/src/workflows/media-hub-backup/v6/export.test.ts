import { describe, expect, it, vi } from 'vitest';
import { openArchiveReader } from '../../../composition/archive-transfer';
import { createArchiveMemorySink } from '../../../composition/archive-transfer/test-support';
import { inspectMediaHubBackupV6 } from './inspect';
import { buildMediaHubBackupExportPlanV6, exportMediaHubBackupV6 } from './export';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { MAX_ROOT_METADATA_BYTES } from './contracts';
import { assertMetadataJson } from './codec';
import { parseBackupRootEnvelope } from './shared-object-envelope';
import { decodeBackupMetadata } from './metadata-transport';

const favicon =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0H8AAAAASUVORK5CYII=';

it.each(['library-folders-v2', 'library-folders-v3'] as const)(
  'roundtrips authored headers through %s',
  async (layout) => {
    const item = root('123456');
    item.descriptor.rootId = 'recording:one';
    item.descriptor.metadataPath = '_sniptale/metadata/media/recording%3Aone.json';
    const metadata = {
      entry: {
        id: 'recording:one',
        kind: 'recording',
        filename: 'one.webm',
        originalFilename: 'one.webm',
        source: { kind: 'recording', recordingId: 'one' },
        mimeType: 'video/webm',
        createdAt: 1,
        updatedAt: 1,
        duration: 2,
        size: 6,
        width: 640,
        height: 360,
        sourceUrl: null,
        sourceTitle: null,
        sourceFavicon: null,
        tags: [],
      },
      originalObjectId: 'object-000001',
      recording: {
        entry: { id: 'one', filename: 'one.webm', createdAt: 1, mimeType: 'video/webm', size: 6 },
      },
      videoReview: {
        workspace: {
          aggregateId: 'recording:one',
          formatVersion: 1,
          source: { duration: 2, width: 640, height: 360, size: 6, mimeType: 'video/webm' },
          revision: 1,
          cursor: 0,
          history: [],
          advanced: {
            ...createQuickEditAdvancedState(),
            windowHeader: {
              ...DEFAULT_WINDOW_HEADER,
              faviconEnabled: true,
              faviconSource: 'file',
              faviconDataUrl: favicon,
              title: 'Qk ordinary title',
            },
          },
          createdAt: 1,
          updatedAt: 1,
        },
        draft: null,
      },
    };
    const original = await item.load();
    const objects = original.objects.map((object) => ({
      blob: new Blob([object.blob], { type: 'video/webm' }),
      ref: { ...object.ref, mimeType: 'video/webm' },
    }));
    const second = structuredClone(metadata);
    second.entry.id = 'recording:two';
    second.entry.source.recordingId = 'two';
    second.recording.entry.id = 'two';
    second.videoReview.workspace.aggregateId = 'recording:two';
    assertMetadataJson(second);
    const portable: unknown = metadata;
    assertMetadataJson(portable);
    const plan = buildMediaHubBackupExportPlanV6({
      layout,
      roots: [
        { ...item, load: async () => ({ metadata: portable, objects }) },
        {
          ...item,
          descriptor: {
            ...item.descriptor,
            rootId: 'recording:two',
            metadataPath: '_sniptale/metadata/media/recording%3Atwo.json',
          },
          load: async () => ({
            metadata: second,
            objects: objects.map((object) => ({
              ...object,
              ref: { ...object.ref, path: 'Recordings/two.webm' },
            })),
          }),
        },
      ],
      privacy: { includeSourceMetadata: true, includeTelemetry: false, includeWebSnapshots: false },
    });
    const sink = createArchiveMemorySink();
    await exportMediaHubBackupV6({ plan, sink: sink.sink });
    const inspected = await inspectMediaHubBackupV6(sink.blob());
    expect(inspected.manifest.layout).toBe(layout);
    if (layout === 'library-folders-v3') expect(inspected.manifest.sharedObjects).toHaveLength(1);
    const reader = await openArchiveReader(sink.blob());
    try {
      for (const descriptor of inspected.descriptors) {
        const value: unknown = JSON.parse(await reader.entry(descriptor.metadataPath)!.text());
        const { envelope } = parseBackupRootEnvelope(value, inspected.manifest);
        const decoded = await decodeBackupMetadata(reader, envelope);
        expect(JSON.stringify(decoded.envelope.metadata)).toContain(favicon);
        expect(JSON.stringify(decoded.envelope.metadata)).toContain('Qk ordinary title');
      }
    } finally {
      await reader.close();
    }
  }
);

it('refuses oversized v1 root JSON before finalizing a successful backup', async () => {
  const item = root();
  const original = await item.load();
  const sink = createArchiveMemorySink();
  const plan = buildMediaHubBackupExportPlanV6({
    roots: [
      {
        ...item,
        load: async () => ({
          ...original,
          metadata: { parts: Array(5).fill('я'.repeat(MAX_ROOT_METADATA_BYTES / 8)) },
        }),
      },
    ],
    privacy: { includeSourceMetadata: false, includeTelemetry: false, includeWebSnapshots: false },
  });
  await expect(exportMediaHubBackupV6({ plan, sink: sink.sink })).rejects.toThrow('budget');
});

it.each([-1, 0, 1])('matches the reader UTF-8 root budget at delta %i', async (delta) => {
  const item = root();
  const payload = await item.load();
  const parts = ['', '', '', ''];
  const overhead = new TextEncoder().encode(
    JSON.stringify({
      descriptor: item.descriptor,
      metadata: { parts },
      objects: payload.objects.map((object) => object.ref),
    })
  ).byteLength;
  let remaining = MAX_ROOT_METADATA_BYTES + delta - overhead;
  for (let index = 0; index < 4; index++) {
    const count = Math.min(1024 * 1024, remaining);
    parts[index] = 'x'.repeat(count);
    remaining -= count;
  }
  const plan = buildMediaHubBackupExportPlanV6({
    roots: [{ ...item, load: async () => ({ ...payload, metadata: { parts } }) }],
    privacy: { includeSourceMetadata: false, includeTelemetry: false, includeWebSnapshots: false },
  });
  const output = createArchiveMemorySink();
  if (delta > 0) {
    await expect(exportMediaHubBackupV6({ plan, sink: output.sink })).rejects.toThrow('budget');
    return;
  }
  await exportMediaHubBackupV6({ plan, sink: output.sink });
  const reader = await openArchiveReader(output.blob());
  try {
    expect(
      new TextEncoder().encode(
        await reader.entry(item.descriptor.metadataPath)!.text(MAX_ROOT_METADATA_BYTES)
      ).byteLength
    ).toBe(MAX_ROOT_METADATA_BYTES + delta);
  } finally {
    await reader.close();
  }
});

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

it('compresses declared JSON transport while leaving the readable original available', async () => {
  const item = root('original');
  const payload = await item.load();
  const metadata = {
    ...payload.metadata,
    entry: { ...payload.metadata.entry, sourceTitle: 'caption '.repeat(1000) },
  };
  const authored = { ...payload, metadata };
  const plan = buildMediaHubBackupExportPlanV6({
    layout: 'library-folders-v2',
    roots: [{ ...item, load: async () => authored }],
    privacy: { includeSourceMetadata: true, includeTelemetry: false, includeWebSnapshots: false },
  });
  const sink = createArchiveMemorySink();
  await exportMediaHubBackupV6({ plan, sink: sink.sink });
  const reader = await openArchiveReader(sink.blob());
  try {
    const json = reader.entries().find((entry) => entry.path.endsWith('/root.json'));
    expect(json).toBeDefined();
    expect(json!.compressedSize).toBeLessThan(json!.size / 2);
    expect(await reader.entry('Screenshots/capture.png')!.text()).toBe('original');
  } finally {
    await reader.close();
  }
});
