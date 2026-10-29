import type { AssetResidencyCopy } from '../../composition/persistence/assets/residency-records';
import { encodeCapturedScenarioRoot } from './captured-scenario';
import {
  createArchivePathAllocator,
  sanitizeArchivePathSegment,
} from '../../composition/archive-transfer';
import { readAssetFile, type AssetRef } from '../../composition/persistence/assets';
import { sha256 } from '@noble/hashes/sha2.js';
import type {
  CapturedMediaDependency,
  CapturedRootDependency,
} from '../../composition/persistence/sync-capture/contracts';
import { parseSyncCaptureRecord } from '../../composition/persistence/sync-capture/guards';
import { assertPortableJson, parseRootEnvelope } from '../media-hub-backup/v6/codec';
import type { ArchiveRootObjectSource } from '../media-hub-backup/v6/contracts';
import { parsePortableMediaMetadata } from '../media-hub-backup/v6/root-codecs/media';
import { encodeCapturedImageRoot } from './captured-image';
import { encodeCapturedProjectRoot } from './captured-project';
import { buildMediaRootInventory } from '../media-hub-backup/v6/inventory/media';
import { createMediaHubBackupExportOptions } from '../media-hub-backup/v6/options';
import { frozenReviewDatabase, encodeCapturedVideoReviewRoot } from './captured-review';
import { parsePortableSyncRoot } from './prepared-root';

/** Encodes an admitted frozen capture without reading live native rows or creating an archive. */
export async function encodeCapturedPortableRoot(
  value: unknown,
  deferredExports: ReadonlyMap<string, AssetResidencyCopy> = new Map()
): Promise<{
  envelope: Awaited<ReturnType<typeof parsePortableSyncRoot>>['envelope'];
  objects: ArchiveRootObjectSource[];
  dependencies: CapturedMediaDependency[];
  rootDependencies?: CapturedRootDependency[];
  bindings: { objectId: string; ref: AssetRef }[];
  reviewSourceMediaId?: string;
  retainedObjects?: { objectId: string; remoteKey: string; sha256: string }[];
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
  if (capture.change.kind === 'scenario-project') {
    const portable = await encodeCapturedScenarioRoot(capture.change.rows);
    await parsePortableSyncRoot(portable.envelope);
    return portable;
  }
  if (capture.change.kind === 'image') {
    const portable = await encodeCapturedImageRoot(capture.change.rows);
    await parsePortableSyncRoot(portable.envelope);
    return portable;
  }
  if (capture.change.kind === 'video-project') {
    const portable = await encodeCapturedProjectRoot(capture.change.rows, deferredExports);
    await parsePortableSyncRoot(portable.envelope);
    return portable;
  }
  if (capture.change.kind === 'video-review') {
    const portable = await encodeCapturedVideoReviewRoot(capture.change.rows);
    await parsePortableSyncRoot(portable.envelope, portable.reviewSourceMediaId);
    return { ...portable, dependencies: capture.change.mediaDependencies };
  }
  if (capture.change.kind === 'media') {
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
        includeWebSnapshots: true,
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
    const portable = parsePortableMediaMetadata(metadata);
    const bindings: { objectId: string; ref: AssetRef }[] = [];
    const bind = async (objectId: string, ref: AssetRef, checkBytes = false) => {
      const object = objects.find((item) => item.ref.objectId === objectId);
      if (!object || object.blob.size !== ref.size || object.blob.type !== ref.mimeType) {
        if (checkBytes) return;
        throw new Error('Captured media differs from its native reference.');
      }
      if (checkBytes) {
        const native = await readAssetFile(ref, rows.media.filename);
        const digest = async (blob: Blob) => {
          const hash = sha256.create();
          const reader = blob.stream().getReader();
          try {
            for (;;) {
              const chunk = await reader.read();
              if (chunk.done) break;
              hash.update(chunk.value);
            }
            return Array.from(hash.digest()).join(',');
          } finally {
            reader.releaseLock();
          }
        };
        if ((await digest(native)) !== (await digest(object.blob))) return;
      }
      bindings.push({ objectId, ref });
    };
    await bind(portable.originalObjectId, rows.ref, 'webSnapshot' in rows);
    if ('screenshotRef' in rows && portable.webSnapshot)
      await bind(portable.webSnapshot.screenshotObjectId, rows.screenshotRef);
    await parsePortableSyncRoot(envelope);
    return {
      envelope,
      objects,
      dependencies: [],
      bindings,
    };
  }
  throw new Error('Unsupported portable capture.');
}
