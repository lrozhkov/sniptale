import type { CapturedVideoReviewRows } from './contracts';
export type { CapturedVideoReviewRows } from './contracts';
import { parseCapturedMediaRows } from './media-snapshot';
import { parseRecordingEntry } from '../recordings/index.guards';
import { parseRecordingTelemetryEntry } from '../recordings/telemetry.guards';
import type { StoredRecordingEntry } from '../recordings/contracts';
import { sameReviewVideoContainer } from '../../../features/video/review/validation';
import type { IDBPTransaction } from 'idb';
import { sha256 } from '@noble/hashes/sha2.js';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { AssetRef } from '../assets/contracts';
import { parseAssetOwner, parseAssetRef } from '../assets/guards';
import type { MediaLibraryEntry } from '../media-library/contracts';
import { parseMediaLibraryEntry, parseMediaThumbnailEntry } from '../media-library/read-guards';
import type { StoredProjectAssetEntry, StoredProjectExportEntry } from '../projects/contracts';
import { parseProjectAssetEntry, parseProjectExportEntry } from '../projects/read-guards';
import type { VideoWorkspaceSnapshot } from '../review-workspaces/contracts';
import { parseVideoWorkspace, parseVideoWorkspaceDraft } from '../review-workspaces/parser';
import { readWorkspaceStorage } from '../review-workspaces/storage';
import { collectReviewAssetReferences } from '../review-workspaces/asset-refs';
import {
  MEDIA_LIBRARY_STORE,
  STORE_NAME,
  RECORDING_TELEMETRY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  THUMBNAILS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { MAX_CAPTURE_ROWS } from './contracts';
import { describeImageMetadata, isBoundedImageMetadata } from './image-snapshot';

type ReadTransaction = IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>;

function parseReview(value: unknown): VideoWorkspaceSnapshot | null {
  if (!isRecord(value)) return null;
  const workspace = parseVideoWorkspace(value['workspace']);
  if (!workspace) return null;
  const draft =
    value['draft'] === null
      ? null
      : parseVideoWorkspaceDraft(value['draft'], workspace.source.duration);
  if (value['draft'] !== null && (!draft || draft.aggregateId !== workspace.aggregateId))
    return null;
  return { workspace, draft };
}

function parseMedia(value: unknown): Omit<MediaLibraryEntry, 'blob'> | null {
  if (!isRecord(value) || 'blob' in value) return null;
  const media = parseMediaLibraryEntry(value);
  return media &&
    (media.source.kind === 'recording' ||
      media.source.kind === 'project-export' ||
      (!media.recordingMetadata && !media.recordingGroup)) &&
    media.lifecycle?.storageClass === 'library'
    ? media
    : null;
}

function parseRows<T>(value: unknown, parser: (row: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > MAX_CAPTURE_ROWS) return null;
  const rows = value.map(parser);
  return rows.some((row) => row === null) ? null : rows.filter((row) => row !== null);
}

function matchesRef(
  entry: { assetId: string; size: number; mimeType: string },
  ref: AssetRef | undefined
): boolean {
  return (
    ref !== undefined &&
    entry.assetId === ref.assetId &&
    entry.size === ref.size &&
    entry.mimeType === ref.mimeType
  );
}

function matchesReview(
  review: VideoWorkspaceSnapshot,
  asset: { assetId: string; size: number; mimeType: string }
): boolean {
  return (
    asset.mimeType.startsWith('video/') &&
    review.workspace.sourceAssetId === asset.assetId &&
    review.workspace.source.size === asset.size &&
    sameReviewVideoContainer(review.workspace.source.mimeType, asset.mimeType)
  );
}

/** Validate the exact retained closure, including private review cycles and published source bindings. */
export function parseCapturedVideoReviewRows(value: unknown): CapturedVideoReviewRows | null {
  if (
    !isRecord(value) ||
    !isBoundedImageMetadata(value) ||
    !isBoundedImageMetadata({ ...value, thumbnail: undefined }, false) ||
    !isRecord(value['source'])
  )
    return null;
  if (
    Object.keys(value).some(
      (key) =>
        ![
          'review',
          'source',
          'assets',
          'refs',
          'media',
          'privateReviews',
          'thumbnail',
          'recordings',
          'projectExports',
        ].includes(key)
    )
  )
    return null;
  const review = parseReview(value['review']);
  const thumbnail =
    value['thumbnail'] === undefined ? undefined : parseMediaThumbnailEntry(value['thumbnail']);
  const source = parseCapturedMediaRows(value['source']);
  const recordings =
    value['recordings'] === undefined
      ? undefined
      : parseRows(value['recordings'], parseRecordingEntry);
  const assets = parseRows(value['assets'], parseProjectAssetEntry);
  const projectExports =
    value['projectExports'] === undefined
      ? undefined
      : parseRows(value['projectExports'], parseProjectExportEntry);
  const refs = parseRows(value['refs'], parseAssetRef);
  const published = parseRows(value['media'], parseMedia);
  const privateReviews = parseRows(value['privateReviews'], parseReview);
  if (
    !review ||
    thumbnail === null ||
    (thumbnail && thumbnail.assetId !== review.workspace.aggregateId) ||
    !source ||
    recordings === null ||
    projectExports === null ||
    !assets ||
    !refs ||
    !published ||
    !privateReviews ||
    !review.workspace.project ||
    source.media.lifecycle?.storageClass !== 'library' ||
    (source.media.kind !== 'video' &&
      source.media.kind !== 'recording' &&
      !(source.media.kind === 'export' && source.media.source.kind === 'project-export')) ||
    (review.workspace.sourceMediaId ?? review.workspace.aggregateId) !== source.media.id ||
    !matchesReview(review, {
      assetId: source.ref.assetId,
      size: source.ref.size,
      mimeType: source.ref.mimeType,
    })
  )
    return null;
  const rows = {
    review,
    source,
    ...(recordings === undefined ? {} : { recordings }),
    ...(projectExports === undefined ? {} : { projectExports }),
    assets,
    refs,
    media: published,
    privateReviews,
    ...(thumbnail ? { thumbnail } : {}),
  };
  return completeClosure(rows) ? structuredClone(rows) : null;
}

function retainReviewReferences(
  review: VideoWorkspaceSnapshot,
  neededAssets: Set<string>
): boolean {
  for (const reference of collectReviewAssetReferences(review.workspace)) {
    if (!reference.startsWith('project-asset:')) return false;
    neededAssets.add(reference.slice('project-asset:'.length));
  }
  return true;
}

function matchesEffectResources(
  review: VideoWorkspaceSnapshot,
  assets: Map<string, StoredProjectAssetEntry>,
  refs: Map<string, AssetRef>
): boolean {
  for (const snapshot of review.workspace.effectSnapshots ?? []) {
    for (const resource of snapshot.assets) {
      const asset = assets.get(resource.assetId.slice('project-asset:'.length));
      const ref = asset && refs.get(asset.assetId);
      if (
        !asset ||
        !ref ||
        asset.size !== resource.byteLength ||
        asset.mimeType !== resource.mimeType ||
        (ref.sha256 !== null && ref.sha256 !== resource.sha256)
      )
        return false;
    }
  }
  return true;
}

function retainResourceOrigin(
  asset: StoredProjectAssetEntry,
  sourceId: string,
  media: Map<string, Omit<MediaLibraryEntry, 'blob'>>,
  neededMedia: Set<string>,
  neededAssets: Set<string>
): void {
  if (!asset.originMediaId || asset.originMediaId === sourceId) return;
  neededMedia.add(asset.originMediaId);
  const origin = media.get(asset.originMediaId);
  if (origin?.source.kind === 'project-asset') neededAssets.add(origin.source.projectAssetId);
}

function retainPublishedSource(
  entry: Omit<MediaLibraryEntry, 'blob'>,
  assets: Map<string, StoredProjectAssetEntry>,
  refs: Map<string, AssetRef>,
  neededAssets: Set<string>,
  neededRefs: Set<string>,
  recordings: Map<string, StoredRecordingEntry>,
  neededRecordings: Set<string>,
  exports: Map<string, StoredProjectExportEntry>,
  neededExports: Set<string>
): boolean {
  if (entry.source.kind === 'project-export') {
    const projectExport = exports.get(entry.source.exportId);
    const ref = projectExport && refs.get(projectExport.assetId);
    if (!projectExport || !ref || !parseCapturedMediaRows({ media: entry, projectExport, ref }))
      return false;
    neededExports.add(projectExport.id);
    neededRefs.add(ref.assetId);
    return true;
  }
  if (entry.source.kind === 'recording') {
    const recording = recordings.get(entry.source.recordingId);
    const ref = recording && refs.get(recording.assetId);
    if (
      !recording ||
      !ref ||
      !parseCapturedMediaRows({ media: entry, recording, ref, telemetry: null })
    )
      return false;
    neededRecordings.add(recording.id);
    neededRefs.add(recording.assetId);
    return true;
  }
  if (entry.source.kind === 'stored-asset') {
    if (!matchesRef({ ...entry, assetId: entry.source.assetId }, refs.get(entry.source.assetId)))
      return false;
    neededRefs.add(entry.source.assetId);
    return true;
  }
  if (entry.source.kind !== 'project-asset') return false;
  const asset = assets.get(entry.source.projectAssetId);
  if (
    entry.id.startsWith('project-asset:') &&
    entry.id !== `project-asset:${entry.source.projectAssetId}`
  )
    return false;
  return (
    asset !== undefined &&
    asset.size === entry.size &&
    asset.mimeType === entry.mimeType &&
    neededAssets.has(asset.id)
  );
}

function hasUniqueClosureRows(rows: CapturedVideoReviewRows): boolean {
  return (
    new Set((rows.projectExports ?? []).map((entry) => entry.id)).size ===
      (rows.projectExports ?? []).length &&
    new Set((rows.recordings ?? []).map((entry) => entry.id)).size ===
      (rows.recordings ?? []).length &&
    new Set(rows.assets.map((entry) => entry.id)).size === rows.assets.length &&
    new Set(rows.refs.map((entry) => entry.assetId)).size === rows.refs.length &&
    new Set(rows.media.map((entry) => entry.id)).size === rows.media.length &&
    new Set(rows.privateReviews.map((entry) => entry.workspace.aggregateId)).size ===
      rows.privateReviews.length &&
    !rows.privateReviews.some(
      (entry) => entry.workspace.aggregateId === rows.review.workspace.aggregateId
    ) &&
    !rows.media.some((entry) => entry.id === rows.source.media.id)
  );
}

function completeClosure(rows: CapturedVideoReviewRows): boolean {
  if (!hasUniqueClosureRows(rows)) return false;
  const assets = new Map(rows.assets.map((entry) => [entry.id, entry]));
  const refs = new Map(rows.refs.map((entry) => [entry.assetId, entry]));
  const media = new Map(rows.media.map((entry) => [entry.id, entry]));
  const reviews = new Map(rows.privateReviews.map((entry) => [entry.workspace.aggregateId, entry]));
  const recordings = new Map((rows.recordings ?? []).map((entry) => [entry.id, entry]));
  const exports = new Map((rows.projectExports ?? []).map((entry) => [entry.id, entry]));
  const neededExports = new Set<string>();
  const neededRecordings = new Set<string>();
  const neededAssets = new Set<string>();
  const neededRefs = new Set<string>();
  const neededMedia = new Set<string>();
  const neededReviews = new Set<string>();
  const admitReviewResources = (review: VideoWorkspaceSnapshot): boolean =>
    retainReviewReferences(review, neededAssets) && matchesEffectResources(review, assets, refs);
  if (!admitReviewResources(rows.review)) return false;
  // Set iteration visits each newly discovered resource once, including cycles.
  for (const id of neededAssets) {
    const asset = assets.get(id);
    if (!asset || !matchesRef(asset, refs.get(asset.assetId))) return false;
    neededRefs.add(asset.assetId);
    retainResourceOrigin(asset, rows.source.media.id, media, neededMedia, neededAssets);
    const mirror = `project-asset:${id}`;
    const published = media.get(mirror);
    const privateReview = reviews.get(mirror);
    if (published) neededMedia.add(mirror);
    if (privateReview) {
      if (
        published ||
        !matchesReview(privateReview, asset) ||
        (privateReview.workspace.sourceMediaId ?? mirror) !== mirror
      )
        return false;
      neededReviews.add(mirror);
      if (!admitReviewResources(privateReview)) return false;
    }
  }
  for (const id of neededMedia) {
    const entry = media.get(id);
    if (
      !entry ||
      !retainPublishedSource(
        entry,
        assets,
        refs,
        neededAssets,
        neededRefs,
        recordings,
        neededRecordings,
        exports,
        neededExports
      )
    )
      return false;
  }
  return (
    neededRecordings.size === recordings.size &&
    neededExports.size === exports.size &&
    neededAssets.size === assets.size &&
    neededRefs.size === refs.size &&
    neededMedia.size === media.size &&
    neededReviews.size === reviews.size
  );
}

async function readReview(tx: ReadTransaction, id: string): Promise<VideoWorkspaceSnapshot | null> {
  const stored = await readWorkspaceStorage(tx, id);
  const draft: unknown = await tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).get(id);
  if (stored.logical === undefined && draft === undefined) return null;
  const review = parseReview({ workspace: stored.logical, draft: draft ?? null });
  if (!review || review.workspace.aggregateId !== id)
    throw new Error('Invalid native review snapshot.');
  return review;
}

async function readOwnedAsset(tx: ReadTransaction, id: string) {
  const asset = parseProjectAssetEntry(await tx.objectStore(PROJECT_ASSETS_STORE).get(id));
  if (!asset || asset.id !== id) throw new Error('Missing review resource.');
  const ref = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(asset.assetId));
  const owner = parseAssetOwner(
    await tx.objectStore(ASSET_OWNERS_STORE).get(['project-asset', id, 'body'])
  );
  if (
    !ref ||
    !matchesRef(asset, ref) ||
    !owner ||
    owner.ownerKind !== 'project-asset' ||
    owner.ownerId !== id ||
    owner.role !== 'body' ||
    owner.assetId !== asset.assetId
  )
    throw new Error('Invalid review resource ownership.');
  return { asset, ref };
}

async function readPublishedSourceRef(
  tx: ReadTransaction,
  id: string,
  assetId: string
): Promise<AssetRef> {
  const ref = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(assetId));
  const owner = parseAssetOwner(
    await tx.objectStore(ASSET_OWNERS_STORE).get(['media-library', id, 'source'])
  );
  if (
    !ref ||
    !owner ||
    owner.assetId !== ref.assetId ||
    owner.ownerKind !== 'media-library' ||
    owner.ownerId !== id ||
    owner.role !== 'source'
  )
    throw new Error('Missing published review resource ownership.');
  return ref;
}

async function readReviewSource(
  tx: ReadTransaction,
  review: VideoWorkspaceSnapshot
): Promise<CapturedVideoReviewRows['source']> {
  const id = review.workspace.sourceMediaId ?? review.workspace.aggregateId;
  const media = parseMedia(await tx.objectStore(MEDIA_LIBRARY_STORE).get(id));
  if (media?.source.kind === 'project-export') {
    const resource = await readOwnedExport(tx, media.source.exportId);
    const rows = parseCapturedMediaRows({ media, ...resource });
    if (!rows) throw new Error('Invalid exported review source ownership.');
    return rows;
  }
  if (media?.source.kind === 'recording') {
    const recording = await readOwnedRecording(tx, media.source.recordingId);
    const rawTelemetry: unknown = await tx
      .objectStore(RECORDING_TELEMETRY_STORE)
      .get(recording.recording.id);
    const telemetry =
      rawTelemetry === undefined ? null : parseRecordingTelemetryEntry(rawTelemetry);
    const rows =
      rawTelemetry !== undefined && !telemetry
        ? null
        : parseCapturedMediaRows({ media, ...recording, telemetry });
    if (!rows) throw new Error('Invalid recording review original.');
    return rows;
  }
  if (!media || media.source.kind !== 'project-asset')
    throw new Error('Unsupported review original.');
  const source = await readOwnedAsset(tx, media.source.projectAssetId);
  return { media, projectAsset: source.asset, ref: source.ref };
}

async function readOwnedExport(tx: ReadTransaction, id: string) {
  const projectExport = parseProjectExportEntry(
    await tx.objectStore(PROJECT_EXPORTS_STORE).get(id)
  );
  if (!projectExport || projectExport.id !== id)
    throw new Error('Missing exported review original.');
  const ref = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(projectExport.assetId));
  const owner = parseAssetOwner(
    await tx.objectStore(ASSET_OWNERS_STORE).get(['project-export', id, 'body'])
  );
  if (
    !ref ||
    projectExport.size !== ref.size ||
    (projectExport.mimeType ?? 'video/webm') !== ref.mimeType ||
    !owner ||
    owner.ownerKind !== 'project-export' ||
    owner.ownerId !== id ||
    owner.role !== 'body' ||
    owner.assetId !== ref.assetId
  )
    throw new Error('Invalid exported review source ownership.');
  return { projectExport, ref };
}

async function readOwnedRecording(tx: ReadTransaction, id: string) {
  const recording = parseRecordingEntry(await tx.objectStore(STORE_NAME).get(id));
  if (!recording || recording.id !== id) throw new Error('Missing recording review resource.');
  const ref = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(recording.assetId));
  const owner = parseAssetOwner(
    await tx.objectStore(ASSET_OWNERS_STORE).get(['recording', id, 'body'])
  );
  if (
    !ref ||
    !matchesRef(recording, ref) ||
    !owner ||
    owner.ownerKind !== 'recording' ||
    owner.ownerId !== id ||
    owner.role !== 'body' ||
    owner.assetId !== recording.assetId
  )
    throw new Error('Invalid recording review resource ownership.');
  return { recording, ref };
}

/** Freeze through the caller's existing native transaction; never open or commit another transaction. */
export async function freezeVideoReviewInTransaction(
  tx: ReadTransaction,
  aggregateId: string
): Promise<CapturedVideoReviewRows> {
  const review = await readReview(tx, aggregateId);
  if (!review) throw new Error('Missing native review.');
  const sourceId = review.workspace.sourceMediaId ?? aggregateId;
  const source = await readReviewSource(tx, review);
  const assets = new Map<string, StoredProjectAssetEntry>();
  const refs = new Map<string, AssetRef>();
  const media = new Map<string, Omit<MediaLibraryEntry, 'blob'>>();
  const privateReviews: VideoWorkspaceSnapshot[] = [];
  const recordings = new Map<string, StoredRecordingEntry>();
  const projectExports = new Map<string, StoredProjectExportEntry>();
  const needed = new Set(collectReviewAssetReferences(review.workspace));
  const retainMedia = async (id: string) => {
    if (id === sourceId || media.has(id)) return;
    const entry = parseMedia(await tx.objectStore(MEDIA_LIBRARY_STORE).get(id));
    if (!entry || media.size >= MAX_CAPTURE_ROWS)
      throw new Error('Unsupported published review resource.');
    media.set(id, entry);
    if (entry.source.kind === 'project-asset')
      needed.add(`project-asset:${entry.source.projectAssetId}`);
    if (entry.source.kind === 'recording') {
      const resource = await readOwnedRecording(tx, entry.source.recordingId);
      recordings.set(resource.recording.id, resource.recording);
      refs.set(resource.ref.assetId, resource.ref);
    }
    if (entry.source.kind === 'project-export') {
      const exported = await readOwnedExport(tx, entry.source.exportId);
      projectExports.set(exported.projectExport.id, exported.projectExport);
      refs.set(exported.ref.assetId, exported.ref);
    }
    if (entry.source.kind === 'stored-asset') {
      const ref = await readPublishedSourceRef(tx, id, entry.source.assetId);
      refs.set(ref.assetId, ref);
    }
  };
  for (const reference of needed) {
    if (!reference.startsWith('project-asset:') || assets.size >= MAX_CAPTURE_ROWS)
      throw new Error('Unsupported review resource closure.');
    const id = reference.slice('project-asset:'.length);
    const resource = await readOwnedAsset(tx, id);
    assets.set(id, resource.asset);
    refs.set(resource.ref.assetId, resource.ref);
    if (resource.asset.originMediaId) await retainMedia(resource.asset.originMediaId);
    const mirrorId = `project-asset:${id}`;
    if ((await tx.objectStore(MEDIA_LIBRARY_STORE).get(mirrorId)) !== undefined)
      await retainMedia(mirrorId);
    else {
      const nested = await readReview(tx, mirrorId);
      if (nested && mirrorId !== aggregateId) {
        privateReviews.push(nested);
        for (const child of collectReviewAssetReferences(nested.workspace)) needed.add(child);
      }
    }
  }
  const thumbnail: unknown = await tx.objectStore(THUMBNAILS_STORE).get(aggregateId);
  const rows = parseCapturedVideoReviewRows({
    review,
    ...(thumbnail === undefined ? {} : { thumbnail }),
    source,
    assets: [...assets.values()],
    refs: [...refs.values()],
    media: [...media.values()],
    privateReviews,
    ...(recordings.size === 0 ? {} : { recordings: [...recordings.values()] }),
    ...(projectExports.size === 0 ? {} : { projectExports: [...projectExports.values()] }),
  });
  if (!rows || rows.review.workspace.aggregateId !== aggregateId)
    throw new Error('Unsupported video review snapshot.');
  return rows;
}

/** Synchronous native metadata hashing does not suspend the caller's live IDB transaction. */
export function digestCapturedVideoReviewRows(rows: CapturedVideoReviewRows): string {
  const accepted = parseCapturedVideoReviewRows(rows);
  if (!accepted) throw new Error('Invalid video review snapshot.');
  // Published media metadata has its own causal authority. Keep only its source binding here.
  const authority = {
    ...accepted,
    source: {
      ...('recording' in accepted.source
        ? {
            recording: {
              id: accepted.source.recording.id,
              assetId: accepted.source.recording.assetId,
              size: accepted.source.recording.size,
              mimeType: accepted.source.recording.mimeType,
            },
            ref: accepted.source.ref,
          }
        : accepted.source),
      media: { id: accepted.source.media.id, source: accepted.source.media.source },
    },
    ...(accepted.recordings === undefined
      ? {}
      : {
          recordings: accepted.recordings.map(({ id, assetId, size, mimeType }) => ({
            id,
            assetId,
            size,
            mimeType,
          })),
        }),
    media: accepted.media.map((entry) => ({ id: entry.id, source: entry.source })),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(describeImageMetadata(authority)));
  return Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
