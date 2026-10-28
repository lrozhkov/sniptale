import {
  createArchivePathAllocator,
  sanitizeArchivePathSegment,
} from '../../composition/archive-transfer';
import { readAssetFile, type AssetRef } from '../../composition/persistence/assets';
import type { CapturedMediaDependency } from '../../composition/persistence/sync-capture/contracts';
import { parseSyncCaptureRecord } from '../../composition/persistence/sync-capture/guards';
import { assertPortableJson, parseRootEnvelope } from '../media-hub-backup/v6/codec';
import type { ArchiveRootObjectSource } from '../media-hub-backup/v6/contracts';
import { createObjectCollector } from '../media-hub-backup/v6/inventory/helpers';
import { encodePortableMediaOriginal } from '../media-hub-backup/v6/root-codecs/media';
import { encodeCapturedImageRoot } from './captured-image';
import { encodeCapturedProjectRoot } from './captured-project';
import { buildMediaRootInventory } from '../media-hub-backup/v6/inventory/media';
import { createMediaHubBackupExportOptions } from '../media-hub-backup/v6/options';
import { frozenReviewDatabase, encodeCapturedVideoReviewRoot } from './captured-review';
import { parsePortableSyncRoot } from './prepared-root';

/** Encodes an admitted frozen capture without reading live native rows or creating an archive. */
export async function encodeCapturedPortableRoot(value: unknown): Promise<{
  envelope: Awaited<ReturnType<typeof parsePortableSyncRoot>>['envelope'];
  objects: ArchiveRootObjectSource[];
  dependencies: CapturedMediaDependency[];
  bindings: { objectId: string; ref: AssetRef }[];
  reviewSourceMediaId?: string;
}> {
  const parsed = parseSyncCaptureRecord(value);
  if (
    !parsed ||
    parsed.kind !== 'sync-operation' ||
    parsed.phase !== 'native' ||
    parsed.change.kind === 'tombstone'
  )
    throw new Error('Unsupported portable capture.');
  // Parsers can retain nested values. Detach the entire accepted snapshot before the first read.
  const capture = structuredClone(parsed);
  if (capture.change.kind === 'image') {
    const portable = await encodeCapturedImageRoot(capture.change.rows);
    await parsePortableSyncRoot(portable.envelope);
    return portable;
  }
  if (capture.change.kind === 'video-project') {
    const portable = await encodeCapturedProjectRoot(capture.change.rows);
    await parsePortableSyncRoot(portable.envelope);
    return portable;
  }
  if (capture.change.kind === 'video-review') {
    const portable = await encodeCapturedVideoReviewRoot(capture.change.rows);
    await parsePortableSyncRoot(portable.envelope, portable.reviewSourceMediaId);
    return { ...portable, dependencies: capture.change.mediaDependencies };
  }
  if (capture.change.kind === 'media' && 'recording' in capture.change.rows) {
    const rows = capture.change.rows;
    const roots = await buildMediaRootInventory({
      db: frozenReviewDatabase({
        source: rows,
        assets: [],
        refs: [],
        media: [],
        privateReviews: [],
      }),
      items: [{ ...rows.media, hasThumbnail: false }],
      options: createMediaHubBackupExportOptions({
        includeDrafts: false,
        includeSourceMetadata: true,
        includeTelemetry: true,
        includeWebSnapshots: false,
        scope: 'selected',
        selected: { mediaAssetIds: [rows.media.id], videoProjectIds: [], scenarioProjectIds: [] },
      }),
      paths: createArchivePathAllocator(),
    });
    if (roots.length !== 1) throw new Error('Frozen recording inventory differs from its root.');
    const loaded = await roots[0]!.load();
    const objects = loaded.objects.map((object) => ({
      ...object,
      ref: { ...object.ref, filename: sanitizeArchivePathSegment(object.ref.filename) },
    }));
    const metadata: unknown = JSON.parse(JSON.stringify(loaded.metadata));
    assertPortableJson(metadata);
    const envelope = parseRootEnvelope({
      descriptor: { ...roots[0]!.descriptor, metadataPath: 'Metadata/sync-root.json' },
      metadata,
      objects: objects.map((object) => object.ref),
    });
    if (
      loaded.objects.length !== 1 ||
      loaded.objects[0]!.blob.size !== rows.ref.size ||
      loaded.objects[0]!.blob.type !== rows.ref.mimeType
    )
      throw new Error('Captured recording differs from its native reference.');
    await parsePortableSyncRoot(envelope);
    return {
      envelope,
      objects,
      dependencies: [],
      bindings: [{ objectId: loaded.objects[0]!.ref.objectId, ref: rows.ref }],
    };
  }
  const collector = createObjectCollector('sync', createArchivePathAllocator());
  const bindings: { objectId: string; ref: AssetRef }[] = [];
  const add = async (ref: AssetRef, filename: string) => {
    const file = await readAssetFile(ref, filename);
    if (file.size !== ref.size || file.type !== ref.mimeType)
      throw new Error('Captured source size or MIME differs from its reference.');
    const objectId = collector.addObject(file, filename, ref.mimeType);
    bindings.push({ objectId, ref });
    return objectId;
  };
  let metadata: unknown;
  if (capture.change.kind === 'media' && !('recording' in capture.change.rows)) {
    const rows = capture.change.rows;
    metadata = {
      entry: rows.media,
      ...encodePortableMediaOriginal({
        projectAsset: rows.projectAsset,
        originalObjectId: await add(rows.ref, rows.media.filename),
      }),
    };
  } else throw new Error('Unsupported portable capture.');
  // The portable boundary accepts JSON without optional native undefined properties.
  const json: unknown = JSON.parse(JSON.stringify(metadata));
  assertPortableJson(json);
  const envelope = parseRootEnvelope({
    descriptor: {
      rootKind: capture.rootKind,
      rootId: capture.rootId,
      ...(capture.rootKind === 'media' ? { mediaSubtype: 'library-item' } : {}),
      metadataPath: 'Metadata/sync-root.json',
      objectCount: collector.objects.length,
      totalBytes: collector.objects.reduce((sum, object) => sum + object.ref.size, 0),
    },
    metadata: json,
    objects: collector.objects.map((object) => object.ref),
  });
  await parsePortableSyncRoot(envelope);
  return { envelope, objects: collector.objects, dependencies: [], bindings };
}
