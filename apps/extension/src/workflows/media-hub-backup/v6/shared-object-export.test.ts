import { expect, it } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { createArchiveWriter, openArchiveReader } from '../../../composition/archive-transfer';
import { createArchiveMemorySink } from '../../../composition/archive-transfer/test-support';
import { buildMediaHubBackupExportPlanV6, exportMediaHubBackupV6 } from './export';
import { inspectMediaHubBackupV6 } from './inspect';
import type { MediaHubBackupRootInventoryItem } from './contracts';
import { parseBackupRootEnvelope } from './shared-object-envelope';
import { decodeBackupMetadata } from './metadata-transport';
import { prepareSharedBackupExport } from './shared-object-export';

function roots(): MediaHubBackupRootInventoryItem[] {
  const original = new Blob(['original image'], { type: 'image/png' });
  const service = new Blob(['shared immutable thumbnail'], { type: 'image/png' });
  return ['one', 'two', 'three'].map((id) => ({
    descriptor: {
      rootId: id,
      rootKind: 'media',
      mediaSubtype: 'library-item',
      metadataPath: `_sniptale/metadata/media/${id}.json`,
      objectCount: 2,
      totalBytes: original.size + service.size,
    },
    summary: {
      draftCount: 0,
      recordingCount: 0,
      sourceMetadataCount: 0,
      telemetryCount: 0,
      thumbnailCount: 1,
      webSnapshotCount: 0,
    },
    async load() {
      return {
        metadata: {
          entry: {
            id,
            kind: 'image',
            filename: `${id}.png`,
            originalFilename: `${id}.png`,
            mimeType: 'image/png',
            size: original.size,
            width: 1,
            height: 1,
            duration: null,
            createdAt: 1,
            updatedAt: 1,
            sourceUrl: null,
            sourceTitle: null,
            sourceFavicon: null,
            tags: [],
            source: { kind: 'stored-asset' },
          },
          originalObjectId: `${id}-body`,
          thumbnail: {
            objectId: `${id}-thumbnail`,
            createdAt: 1,
            updatedAt: 1,
            width: 1,
            height: 1,
          },
        },
        objects: [
          {
            blob: original,
            ref: {
              objectId: `${id}-body`,
              filename: `${id}.png`,
              path: `Screenshots/${id}.png`,
              mimeType: original.type,
              size: original.size,
            },
          },
          {
            blob: service,
            ref: {
              objectId: `${id}-thumbnail`,
              filename: 'thumbnail.png',
              path: `_sniptale/assets/${id}-thumbnail/thumbnail.png`,
              mimeType: service.type,
              size: service.size,
            },
          },
        ],
      };
    },
  }));
}

async function archive(layout: 'library-folders-v2' | 'library-folders-v3' = 'library-folders-v3') {
  const sink = createArchiveMemorySink();
  const plan = buildMediaHubBackupExportPlanV6({
    layout,
    roots: roots(),
    privacy: { includeSourceMetadata: false, includeTelemetry: false, includeWebSnapshots: false },
  });
  await exportMediaHubBackupV6({ plan, sink: sink.sink });
  return sink.blob();
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Invalid test record.');
  return value;
}

async function mutateArchive(change: (path: string, value: unknown) => unknown): Promise<Blob> {
  const reader = await openArchiveReader(await archive());
  const output = createArchiveMemorySink();
  const writer = createArchiveWriter(output.sink);
  try {
    for (const entry of reader.entries()) {
      const source = reader.entry(entry.path)!;
      if (entry.path.endsWith('.json')) {
        const value: unknown = JSON.parse(await source.text());
        await writer.addText(entry.path, JSON.stringify(change(entry.path, value)));
      } else await writer.addSource(entry.path, source);
    }
    await writer.close();
    return output.blob();
  } finally {
    await reader.close();
  }
}

it('removes service repeats while preserving selected readable files and every local identity', async () => {
  const legacy = await openArchiveReader(await archive('library-folders-v2'));
  const file = await archive();
  const inspection = await inspectMediaHubBackupV6(file);
  const reader = await openArchiveReader(file);
  try {
    expect(legacy.entries().filter((entry) => entry.path.endsWith('/thumbnail.png'))).toHaveLength(
      3
    );
    expect(reader.entries().filter((entry) => entry.path.endsWith('/thumbnail.png'))).toHaveLength(
      1
    );
    expect(reader.entries().filter((entry) => entry.path.startsWith('Screenshots/'))).toHaveLength(
      3
    );
    expect(inspection.manifest.sharedObjects).toHaveLength(1);
    expect(inspection.manifest.totals.objects).toBe(9);
    for (const descriptor of inspection.descriptors) {
      const value: unknown = JSON.parse(await reader.entry(descriptor.metadataPath)!.text());
      const { envelope } = parseBackupRootEnvelope(value, inspection.manifest);
      const decoded = await decodeBackupMetadata(reader, envelope);
      expect(decoded.envelope.objects.map((object) => object.objectId)).toEqual([
        `${descriptor.rootId}-body`,
        `${descriptor.rootId}-thumbnail`,
      ]);
      expect(await reader.entry(`Screenshots/${descriptor.rootId}.png`)!.text()).toBe(
        'original image'
      );
    }
  } finally {
    await Promise.all([reader.close(), legacy.close()]);
  }
});

it.each([
  'digest',
  'size',
  'mime',
  'path',
  'duplicate',
  'unused',
  'legacy-table',
  'future',
] as const)('rejects malformed shared table %s before staging', async (kind) => {
  const file = await mutateArchive((path, value) => {
    if (path !== '_sniptale/manifest.json') return value;
    const manifest = record(value);
    if (!Array.isArray(manifest['sharedObjects'])) throw new Error('Missing test table.');
    const table = manifest['sharedObjects'];
    const row = record(table[0]);
    if (kind === 'digest') row['sha256'] = '0'.repeat(64);
    if (kind === 'size') row['size'] = Number(row['size']) + 1;
    if (kind === 'mime') row['mimeType'] = 'audio/wav';
    if (kind === 'path') row['path'] = '_sniptale/manifest.json';
    if (kind === 'duplicate') table.push({ ...row });
    if (kind === 'unused') table.push({ ...row, id: 'unused', path: 'Screenshots/two.png' });
    if (kind === 'legacy-table') manifest['layout'] = 'library-folders-v2';
    if (kind === 'future') manifest['layout'] = 'library-folders-v5';
    return manifest;
  });
  await expect(inspectMediaHubBackupV6(file)).rejects.toThrow();
});

it.each(['undeclared', 'chain', 'extra-path', 'duplicate-id'] as const)(
  'rejects malformed shared reference %s',
  async (kind) => {
    const file = await mutateArchive((path, value) => {
      if (path !== '_sniptale/metadata/media/two.json') return value;
      const envelope = record(value);
      if (!Array.isArray(envelope['objects'])) throw new Error('Missing test objects.');
      const objects = envelope['objects'];
      const alias = record(objects[1]);
      if (kind === 'undeclared') alias['sharedObjectId'] = 'undeclared';
      if (kind === 'chain') alias['sharedObjectId'] = 'two-thumbnail';
      if (kind === 'extra-path') alias['path'] = 'Screenshots/one.png';
      if (kind === 'duplicate-id') alias['objectId'] = 'two-body';
      return envelope;
    });
    await expect(inspectMediaHubBackupV6(file)).rejects.toThrow();
  }
);

it.each(['bytes', 'mime'] as const)(
  'uses actual %s instead of a previously equal identity',
  async (kind) => {
    const items = roots();
    const item = items[1]!;
    const load = item.load;
    item.load = async () => {
      const payload = await load();
      const service = payload.objects[1]!;
      const blob =
        kind === 'bytes'
          ? new Blob([new Uint8Array(service.blob.size).fill(1)], { type: service.blob.type })
          : new Blob([service.blob], { type: 'image/svg+xml' });
      return {
        ...payload,
        objects: [payload.objects[0]!, { blob, ref: { ...service.ref, mimeType: blob.type } }],
      };
    };
    const prepared = await prepareSharedBackupExport(items);
    expect(prepared.roots[1]!.objects).toHaveLength(2);
    expect(prepared.roots[2]!.objects).toHaveLength(1);
    expect(prepared.sharedObjects).toHaveLength(1);
    expect((await prepareSharedBackupExport(roots())).roots[1]!.objects).toHaveLength(1);
  }
);

it('refuses source-size drift before a shared export can write its manifest', async () => {
  const items = roots();
  const item = items[0]!;
  const load = item.load;
  item.descriptor.totalBytes += 1;
  item.load = async () => {
    const payload = await load();
    return {
      ...payload,
      objects: payload.objects.map((object, index) =>
        index === 1 ? { ...object, ref: { ...object.ref, size: object.ref.size + 1 } } : object
      ),
    };
  };
  await expect(prepareSharedBackupExport(items)).rejects.toThrow('source size changed');
});

it('honours cancellation before shared preparation', async () => {
  const abort = new AbortController();
  abort.abort();
  await expect(prepareSharedBackupExport(roots(), abort.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
});
