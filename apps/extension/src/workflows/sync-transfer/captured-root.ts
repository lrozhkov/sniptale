import {
  matchesCapturedObjectBinding,
  loadCapturedInventory,
  createCapturedRootEnvelope,
  createCapturedAssetInventory,
} from './captured-inventory';
import type { AssetResidencyCopy } from '../../composition/persistence/assets/residency-records';
import { encodeCapturedScenarioRoot } from './captured-scenario';
import { createArchivePathAllocator } from '../../composition/archive-transfer';
import { readAssetFile, type AssetRef } from '../../composition/persistence/assets';
import { sha256 } from '@noble/hashes/sha2.js';
import type {
  CapturedMediaDependency,
  CapturedRootDependency,
} from '../../composition/persistence/sync-capture/contracts';
import { parseSyncCaptureRecord } from '../../composition/persistence/sync-capture/guards';
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
    const portable = await encodeCapturedScenarioRoot(capture.change.rows, deferredExports);
    await parsePortableSyncRoot(portable.envelope);
    return portable;
  }
  if (capture.change.kind === 'image') {
    const portable = await encodeCapturedImageRoot(capture.change.rows, deferredExports);
    await parsePortableSyncRoot(portable.envelope);
    return portable;
  }
  if (capture.change.kind === 'video-project') {
    const portable = await encodeCapturedProjectRoot(capture.change.rows, deferredExports);
    await parsePortableSyncRoot(portable.envelope);
    return portable;
  }
  if (capture.change.kind === 'video-review') {
    const portable = await encodeCapturedVideoReviewRoot(capture.change.rows, deferredExports);
    await parsePortableSyncRoot(portable.envelope, portable.reviewSourceMediaId);
    return { ...portable, dependencies: capture.change.mediaDependencies };
  }
  if (capture.change.kind === 'media') {
    const rows = capture.change.rows;
    const deferred = createCapturedAssetInventory(
      [
        ...('webSnapshot' in rows ? [] : [rows.ref]),
        ...('screenshotRef' in rows ? [rows.screenshotRef] : []),
      ],
      deferredExports
    );
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
      deferredAssets: deferred.port,
    });
    if (roots.length !== 1) throw new Error('Frozen recording inventory differs from its root.');
    deferred.assertUsed();
    const { objects, metadata } = await loadCapturedInventory(roots[0]!);
    const envelope = createCapturedRootEnvelope(
      roots[0]!,
      { metadata, objects },
      deferred.descriptors()
    );
    const portable = parsePortableMediaMetadata(metadata);
    const bindings: { objectId: string; ref: AssetRef }[] = [];
    const bind = async (objectId: string, ref: AssetRef, checkBytes = false) => {
      const object = objects.find((item) => item.ref.objectId === objectId);
      const retained = deferred.objects.get(objectId);
      if (!matchesCapturedObjectBinding(ref, object, retained)) {
        if (checkBytes) return;
        throw new Error('Captured media differs from its native reference.');
      }
      if (checkBytes) {
        if (!object?.blob) throw new Error('Transformed Web Snapshot cannot retain a native body.');
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
    if (
      'recording' in rows &&
      rows.telemetry?.cursorTrajectorySnapshot &&
      portable.recording?.cursorAttachment
    )
      await bind(
        portable.recording.cursorAttachment.objectId,
        rows.telemetry.cursorTrajectorySnapshot.ref
      );
    if (
      'recording' in rows &&
      rows.telemetry?.recordingEventsSnapshot &&
      portable.recording?.eventsAttachment
    )
      await bind(
        portable.recording.eventsAttachment.objectId,
        rows.telemetry.recordingEventsSnapshot.ref
      );
    await parsePortableSyncRoot(envelope);
    return {
      envelope,
      objects,
      dependencies: [],
      bindings,
      ...(deferred.objects.size ? { retainedObjects: deferred.retainedObjects() } : {}),
    };
  }
  throw new Error('Unsupported portable capture.');
}
