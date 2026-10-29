import type { AssetResidencyCopy } from '../../composition/persistence/assets/residency-records';
import type { ArchiveObjectRef } from '../../composition/archive-transfer';
import type { InventoryDatabase } from '../media-hub-backup/v6/inventory/helpers';
import type { VideoReviewBackupDatabase } from '../../composition/persistence/review-workspaces/backup-restore';
import {
  STORE_NAME,
  RECORDING_TELEMETRY_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
} from '../../composition/persistence/infrastructure/indexed-db/core.stores';
import {
  createArchivePathAllocator,
  sanitizeArchivePathSegment,
} from '../../composition/archive-transfer';
import type { AssetRef } from '../../composition/persistence/assets';
import type { CapturedVideoProjectRows } from '../../composition/persistence/sync-capture/contracts';
import { parseCapturedVideoProjectRows } from '../../composition/persistence/sync-capture/guards';
import { collectCapturedProjectScenarioDependencies } from '../../composition/persistence/sync-capture/project-snapshot';
import { assertPortableJson, parseRootEnvelope } from '../media-hub-backup/v6/codec';
import { buildVideoProjectRootInventory } from '../media-hub-backup/v6/inventory/video-projects';
import { createMediaHubBackupExportOptions } from '../media-hub-backup/v6/options';
import { parsePortableVideoProjectMetadata } from '../media-hub-backup/v6/root-codecs/projects';

/** Feed the accepted project graph to the existing backup inventory without live reads. */
export async function encodeCapturedProjectRoot(
  value: CapturedVideoProjectRows,
  deferredExports: ReadonlyMap<string, AssetResidencyCopy> = new Map()
) {
  const parsed = parseCapturedVideoProjectRows(value);
  if (!parsed || !parsed.mediaDependencies)
    throw new Error('Invalid frozen project source or dependency evidence.');
  if (
    collectCapturedProjectScenarioDependencies(parsed).size > 0 &&
    !parsed.rootDependencies?.length
  )
    throw new Error('Frozen Scenario source has no admitted causal evidence.');
  const dependencies = structuredClone(parsed.mediaDependencies);
  const rows = structuredClone(parsed);
  const refs = new Map(rows.refs.map((ref) => [ref.assetId, ref]));
  const deferredRefs = new Map<string, AssetRef>();
  const deferredObjects: { ref: ArchiveObjectRef; copy: AssetResidencyCopy }[] = [];
  for (const [assetId, copy] of deferredExports) {
    const ref = refs.get(assetId);
    if (
      !ref ||
      copy.target.kind !== 'opfs' ||
      !rows.exports.some((entry) => entry.assetId === assetId) ||
      JSON.stringify(copy.target.ref) !== JSON.stringify(ref)
    )
      throw new Error('Deferred export differs from the frozen project.');
    deferredRefs.set(assetId, ref);
  }
  const roots = await buildVideoProjectRootInventory({
    db: createFrozenSnapshotDatabase(rows),
    options: createMediaHubBackupExportOptions({
      includeDrafts: false,
      includeSourceMetadata: true,
      includeTelemetry: true,
      includeWebSnapshots: false,
    }),
    paths: createArchivePathAllocator(),
    ...(deferredRefs.size
      ? {
          deferredExports: {
            refs: deferredRefs,
            onObject(assetId, ref) {
              const copy = deferredExports.get(assetId);
              if (!copy) throw new Error('Deferred export binding is missing.');
              deferredObjects.push({
                ref: { ...ref, filename: sanitizeArchivePathSegment(ref.filename) },
                copy,
              });
            },
          },
        }
      : {}),
  });
  if (roots.length !== 1 || roots[0]!.descriptor.rootId !== rows.project.id)
    throw new Error('Frozen project inventory differs from its root.');
  const loaded = await roots[0]!.load();
  const objects = loaded.objects.map((object) => ({
    ...object,
    ref: { ...object.ref, filename: sanitizeArchivePathSegment(object.ref.filename) },
  }));
  const metadata: unknown = JSON.parse(JSON.stringify(loaded.metadata));
  assertPortableJson(metadata);
  const portable = parsePortableVideoProjectMetadata(metadata);
  const assets = new Map(rows.assets.map((entry) => [entry.id, entry]));
  const exports = new Map(rows.exports.map((entry) => [entry.id, entry]));
  const objectById = new Map(objects.map((object) => [object.ref.objectId, object]));
  const objectRefs = [
    ...objects.map((object) => object.ref),
    ...deferredObjects.map((object) => object.ref),
  ].sort((a, b) => a.objectId.localeCompare(b.objectId));
  const descriptorById = new Map(objectRefs.map((ref) => [ref.objectId, ref]));
  const bindings: { objectId: string; ref: AssetRef }[] = [];
  const bind = (objectId: string, assetId: string | undefined) => {
    const ref = assetId ? refs.get(assetId) : undefined;
    const object = objectById.get(objectId);
    const descriptor = descriptorById.get(objectId);
    const retained = deferredObjects.find((item) => item.ref.objectId === objectId);
    if (
      !ref ||
      !descriptor ||
      descriptor.size !== ref.size ||
      descriptor.mimeType !== ref.mimeType ||
      (object
        ? object.blob.size !== ref.size || object.blob.type !== ref.mimeType
        : !retained ||
          retained.copy.target.kind !== 'opfs' ||
          JSON.stringify(retained.copy.target.ref) !== JSON.stringify(ref))
    )
      throw new Error('Captured project object differs from its native reference.');
    bindings.push({ objectId, ref });
  };
  for (const asset of portable.projectAssets)
    bind(asset.objectId, assets.get(asset.entry.id)?.assetId);
  for (const entry of portable.projectExports)
    bind(entry.objectId, exports.get(entry.entry.id)?.assetId);
  const envelope = parseRootEnvelope({
    descriptor: { ...roots[0]!.descriptor, metadataPath: 'Metadata/sync-root.json' },
    metadata,
    objects: objectRefs,
  });
  return {
    envelope,
    objects,
    dependencies,
    bindings,
    ...(deferredObjects.length
      ? {
          retainedObjects: deferredObjects.map(({ ref, copy }) => ({
            objectId: ref.objectId,
            remoteKey: copy.remote.key,
            sha256: copy.remote.sha256,
          })),
        }
      : {}),
    ...(parsed.rootDependencies?.length
      ? { rootDependencies: structuredClone(parsed.rootDependencies) }
      : {}),
  };
}

interface FrozenSnapshotDatabase extends InventoryDatabase, VideoReviewBackupDatabase {}

/** Supplies the existing backup inventory with one captured source and no live database. */
export function createFrozenSnapshotDatabase(
  source: CapturedVideoProjectRows
): FrozenSnapshotDatabase {
  const snapshot = structuredClone(source);
  const projectId = snapshot.project.id;
  const assetMediaIds = snapshot.assets.map((asset) => `project-asset:${asset.id}`);
  const exportMediaIds = snapshot.exports.map((entry) => `export:${entry.id}`);
  const reviewIds = new Set([...assetMediaIds, ...exportMediaIds]);
  const rows = new Map<string, unknown[]>([
    [VIDEO_PROJECTS_STORE, [snapshot.project]],
    [STORE_NAME, snapshot.recordings ?? []],
    [RECORDING_TELEMETRY_STORE, snapshot.telemetry ?? []],
    [PROJECT_ASSETS_STORE, snapshot.assets],
    [PROJECT_EXPORTS_STORE, [...snapshot.exports, ...(snapshot.sourceExports ?? [])]],
    [MEDIA_LIBRARY_STORE, snapshot.media],
    [ASSET_REFS_STORE, snapshot.refs],
    [THUMBNAILS_STORE, snapshot.thumbnails ?? []],
    [AGGREGATE_PRESENTATIONS_STORE, snapshot.presentation ? [snapshot.presentation] : []],
    [VIDEO_WORKSPACES_STORE, (snapshot.reviews ?? []).map((review) => review.workspace)],
    [VIDEO_WORKSPACE_HISTORY_STORE, []],
    [
      VIDEO_WORKSPACE_DRAFTS_STORE,
      (snapshot.reviews ?? []).flatMap((review) => (review.draft ? [review.draft] : [])),
    ],
  ]);
  const allowedKeys = new Map<string, Set<string>>([
    [VIDEO_PROJECTS_STORE, new Set([projectId])],
    [STORE_NAME, new Set((snapshot.recordings ?? []).map((entry) => entry.id))],
    [
      RECORDING_TELEMETRY_STORE,
      new Set((snapshot.telemetry ?? []).map((entry) => entry.recordingId)),
    ],
    [PROJECT_ASSETS_STORE, new Set(snapshot.assets.map((entry) => entry.id))],
    [
      PROJECT_EXPORTS_STORE,
      new Set([...snapshot.exports, ...(snapshot.sourceExports ?? [])].map((entry) => entry.id)),
    ],
    [MEDIA_LIBRARY_STORE, new Set([...snapshot.media.map((entry) => entry.id), ...reviewIds])],
    [ASSET_REFS_STORE, new Set(snapshot.refs.map((entry) => entry.assetId))],
    [THUMBNAILS_STORE, new Set([`video-project:${projectId}`, ...exportMediaIds])],
    [AGGREGATE_PRESENTATIONS_STORE, new Set([JSON.stringify(['video-project', projectId])])],
    [VIDEO_WORKSPACES_STORE, reviewIds],
    [VIDEO_WORKSPACE_HISTORY_STORE, reviewIds],
    [VIDEO_WORKSPACE_DRAFTS_STORE, reviewIds],
  ]);
  function readRows(store: string): unknown[] {
    const selected = rows.get(store);
    if (!selected) throw new Error(`Frozen snapshot store is unsupported: ${store}.`);
    return structuredClone(selected);
  }
  function checkedKey(store: string, key: unknown): string {
    const encoded =
      store === AGGREGATE_PRESENTATIONS_STORE &&
      Array.isArray(key) &&
      key.length === 2 &&
      key[0] === 'video-project' &&
      typeof key[1] === 'string'
        ? JSON.stringify(key)
        : typeof key === 'string'
          ? key
          : null;
    if (encoded === null || !allowedKeys.get(store)?.has(encoded))
      throw new Error(`Frozen snapshot key is unsupported for store: ${store}.`);
    return encoded;
  }
  async function get(store: string, key: unknown): Promise<unknown> {
    const selected = readRows(store);
    const accepted = checkedKey(store, key);
    return selected.find((entry) => {
      if (typeof entry !== 'object' || entry === null) return false;
      if (store === AGGREGATE_PRESENTATIONS_STORE)
        return (
          JSON.stringify([
            Reflect.get(entry, 'aggregateKind'),
            Reflect.get(entry, 'aggregateId'),
          ]) === accepted
        );
      const key =
        store === RECORDING_TELEMETRY_STORE
          ? 'recordingId'
          : store === ASSET_REFS_STORE || store === THUMBNAILS_STORE
            ? 'assetId'
            : store === VIDEO_WORKSPACES_STORE || store === VIDEO_WORKSPACE_DRAFTS_STORE
              ? 'aggregateId'
              : 'id';
      return Reflect.get(entry, key) === accepted;
    });
  }
  async function getAllFromIndex(store: string, index: string, key: unknown): Promise<unknown[]> {
    const selected = readRows(store);
    if (store === PROJECT_EXPORTS_STORE && index === 'projectId' && key === projectId)
      return selected.filter(
        (entry) =>
          typeof entry === 'object' && entry !== null && Reflect.get(entry, 'projectId') === key
      );
    if (store === VIDEO_WORKSPACE_HISTORY_STORE && index === 'aggregateId') {
      checkedKey(store, key);
      return [];
    }
    throw new Error(`Frozen snapshot index is unsupported: ${store}.${index}.`);
  }
  const sidecars = new Set<string>([
    VIDEO_WORKSPACES_STORE,
    VIDEO_WORKSPACE_HISTORY_STORE,
    VIDEO_WORKSPACE_DRAFTS_STORE,
  ]);
  return {
    get,
    getAll: async (store) => readRows(store),
    getAllFromIndex,
    transaction(stores, mode) {
      if (mode !== 'readonly' || !stores.length || stores.some((store) => !sidecars.has(store)))
        throw new Error('Frozen snapshot transaction is unsupported.');
      return {
        done: Promise.resolve(),
        objectStore(store) {
          if (!stores.includes(store))
            throw new Error('Frozen snapshot store is outside the transaction.');
          return {
            get: (key) => get(store, key),
            index: (index) => ({ getAll: (key) => getAllFromIndex(store, index, key) }),
          };
        },
      };
    },
  };
}
