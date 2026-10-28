import {
  createArchivePathAllocator,
  sanitizeArchivePathSegment,
} from '../../composition/archive-transfer';
import type { AssetRef } from '../../composition/persistence/assets';
import type { MediaLibraryItem } from '../../composition/persistence/media-library/contracts';
import type { VideoReviewBackupDatabase } from '../../composition/persistence/review-workspaces/backup-restore';
import {
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  RECORDING_TELEMETRY_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
} from '../../composition/persistence/infrastructure/indexed-db/core.stores';
import {
  parseCapturedVideoReviewRows,
  type CapturedVideoReviewRows,
} from '../../composition/persistence/sync-capture/review-snapshot';
import { assertPortableJson, parseRootEnvelope } from '../media-hub-backup/v6/codec';
import { buildMediaRootInventory } from '../media-hub-backup/v6/inventory/media';
import { createMediaHubBackupExportOptions } from '../media-hub-backup/v6/options';
import { parsePortableMediaMetadata } from '../media-hub-backup/v6/root-codecs/media';

/** Encodes one frozen review through the backup inventory without publishing its source again. */
export async function encodeCapturedVideoReviewRoot(value: CapturedVideoReviewRows) {
  const rows = parseCapturedVideoReviewRows(value);
  if (!rows) throw new Error('Invalid frozen video review.');
  const aggregateId = rows.review.workspace.aggregateId;
  const sourceMediaId = rows.source.media.id;
  const item: MediaLibraryItem = { ...rows.source.media, hasThumbnail: false };
  const roots = await buildMediaRootInventory({
    db: frozenReviewDatabase(rows),
    items: [item],
    ...(aggregateId !== sourceMediaId ? { reviewWorkspaceHeads: [rows.review.workspace] } : {}),
    expectedReview: rows.review,
    options: createMediaHubBackupExportOptions({
      includeDrafts: false,
      includeSourceMetadata: true,
      includeTelemetry: true,
      includeWebSnapshots: false,
      scope: 'selected',
      selected: { mediaAssetIds: [aggregateId], videoProjectIds: [], scenarioProjectIds: [] },
    }),
    paths: createArchivePathAllocator(),
  });
  if (roots.length !== 1 || roots[0]!.descriptor.rootId !== aggregateId)
    throw new Error('Frozen video review inventory differs from its root.');
  const loaded = await roots[0]!.load();
  const objects = loaded.objects.map((object) => ({
    ...object,
    ref: { ...object.ref, filename: sanitizeArchivePathSegment(object.ref.filename) },
  }));
  const metadata: unknown = JSON.parse(JSON.stringify(loaded.metadata));
  assertPortableJson(metadata);
  const portable = parsePortableMediaMetadata(metadata);
  if (!portable.videoReview)
    throw new Error('Frozen video review inventory is missing its review.');
  const refs = new Map(rows.refs.map((ref) => [ref.assetId, ref]));
  const assets = new Map(rows.assets.map((entry) => [entry.id, entry]));
  const bindings: { objectId: string; ref: AssetRef }[] = [];
  const bind = (objectId: string, ref: AssetRef | undefined) => {
    const object = objects.find((candidate) => candidate.ref.objectId === objectId);
    if (
      !ref ||
      !object ||
      object.ref.size !== ref.size ||
      object.ref.mimeType !== ref.mimeType ||
      object.blob.size !== ref.size ||
      object.blob.type !== ref.mimeType
    )
      throw new Error('Captured video review object differs from its native reference.');
    bindings.push({ objectId, ref });
  };
  bind(portable.originalObjectId, rows.source.ref);
  for (const asset of portable.reviewAssets ?? [])
    bind(asset.objectId, refs.get(assets.get(asset.entry.id)?.assetId ?? ''));
  const envelope = parseRootEnvelope({
    descriptor: { ...roots[0]!.descriptor, metadataPath: 'Metadata/sync-root.json' },
    metadata,
    objects: objects.map((object) => object.ref),
  });
  return { envelope, objects, bindings, reviewSourceMediaId: sourceMediaId };
}

interface FrozenReviewDatabase extends VideoReviewBackupDatabase {
  get(store: string, key: unknown): Promise<unknown>;
}

type FrozenMediaRows = Omit<CapturedVideoReviewRows, 'review' | 'thumbnail'> &
  Partial<Pick<CapturedVideoReviewRows, 'review' | 'thumbnail'>>;

/** Provides the backup inventory with frozen native rows and no live database access. */
export function frozenReviewDatabase(source: FrozenMediaRows): FrozenReviewDatabase {
  const snapshot = structuredClone(source);
  const aggregateId = snapshot.review?.workspace.aggregateId ?? snapshot.source.media.id;
  const assets = [
    ...('projectAsset' in snapshot.source ? [snapshot.source.projectAsset] : []),
    ...snapshot.assets,
  ];
  const recordings = [
    ...('recording' in snapshot.source ? [snapshot.source.recording] : []),
    ...(snapshot.recordings ?? []),
  ];
  const telemetry =
    'recording' in snapshot.source && snapshot.source.telemetry ? [snapshot.source.telemetry] : [];
  const media = [snapshot.source.media, ...snapshot.media];
  const refs = [snapshot.source.ref, ...snapshot.refs];
  const reviews = [...(snapshot.review ? [snapshot.review] : []), ...snapshot.privateReviews];
  const reviewIds = new Set([aggregateId, ...assets.map((asset) => `project-asset:${asset.id}`)]);
  const rows = new Map<string, unknown[]>([
    [MEDIA_LIBRARY_STORE, media],
    [PROJECT_ASSETS_STORE, assets],
    [STORE_NAME, recordings],
    [RECORDING_TELEMETRY_STORE, telemetry],
    [ASSET_REFS_STORE, refs],
    [THUMBNAILS_STORE, snapshot.thumbnail ? [snapshot.thumbnail] : []],
    [VIDEO_WORKSPACES_STORE, reviews.map((review) => review.workspace)],
    [VIDEO_WORKSPACE_HISTORY_STORE, []],
    [
      VIDEO_WORKSPACE_DRAFTS_STORE,
      reviews.flatMap((review) => (review.draft ? [review.draft] : [])),
    ],
  ]);
  const allowedKeys = new Map<string, Set<string>>([
    [
      MEDIA_LIBRARY_STORE,
      new Set([
        ...media.map((entry) => entry.id),
        ...assets.map((asset) => `project-asset:${asset.id}`),
      ]),
    ],
    [PROJECT_ASSETS_STORE, new Set(assets.map((entry) => entry.id))],
    [STORE_NAME, new Set(recordings.map((entry) => entry.id))],
    [RECORDING_TELEMETRY_STORE, new Set(recordings.map((entry) => entry.id))],
    [ASSET_REFS_STORE, new Set(refs.map((ref) => ref.assetId))],
    [THUMBNAILS_STORE, new Set([aggregateId])],
    [VIDEO_WORKSPACES_STORE, reviewIds],
    [VIDEO_WORKSPACE_HISTORY_STORE, reviewIds],
    [VIDEO_WORKSPACE_DRAFTS_STORE, reviewIds],
  ]);
  function checkedKey(store: string, key: unknown): string {
    if (typeof key !== 'string' || !allowedKeys.get(store)?.has(key))
      throw new Error(`Frozen video review key is unsupported for store: ${store}.`);
    return key;
  }
  async function get(store: string, key: unknown): Promise<unknown> {
    const accepted = checkedKey(store, key);
    const field =
      store === RECORDING_TELEMETRY_STORE
        ? 'recordingId'
        : store === ASSET_REFS_STORE || store === THUMBNAILS_STORE
          ? 'assetId'
          : store === VIDEO_WORKSPACES_STORE || store === VIDEO_WORKSPACE_DRAFTS_STORE
            ? 'aggregateId'
            : 'id';
    return structuredClone(
      rows
        .get(store)
        ?.find(
          (entry) =>
            typeof entry === 'object' && entry !== null && Reflect.get(entry, field) === accepted
        )
    );
  }
  const sidecars = new Set<string>([
    VIDEO_WORKSPACES_STORE,
    VIDEO_WORKSPACE_HISTORY_STORE,
    VIDEO_WORKSPACE_DRAFTS_STORE,
  ]);
  return {
    get,
    transaction(stores, mode) {
      if (mode !== 'readonly' || !stores.length || stores.some((store) => !sidecars.has(store)))
        throw new Error('Frozen video review transaction is unsupported.');
      return {
        done: Promise.resolve(),
        objectStore(store) {
          if (!stores.includes(store))
            throw new Error('Frozen video review store is outside the transaction.');
          return {
            get: (key) => get(store, key),
            index(index) {
              if (store !== VIDEO_WORKSPACE_HISTORY_STORE || index !== 'aggregateId')
                throw new Error('Frozen video review index is unsupported.');
              return {
                getAll: async (key) => {
                  checkedKey(store, key);
                  return [];
                },
              };
            },
          };
        },
      };
    },
  };
}
