import { sameReviewVideoContainer } from '../../../features/video/review/validation';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { AssetRef } from '../assets/contracts';
import { parseAssetRef } from '../assets/guards';
import { readAssetFile } from '../assets/opfs-store';
import type { MediaThumbnailEntry } from '../media-library/contracts';
import { parseMediaThumbnailEntry } from '../media-library/read-guards';
import type { StoredProjectAssetEntry } from '../projects/contracts';
import { parseProjectAssetEntry } from '../projects/read-guards';
import type { VideoWorkspaceSnapshot } from '../review-workspaces/contracts';
import { parseVideoWorkspace, parseVideoWorkspaceDraft } from '../review-workspaces/parser';
import { collectReviewAssetReferences } from '../review-workspaces/asset-refs';
import { verifyReviewAnnotationEffectSnapshot } from '../../../features/video/review/annotation-effects/validation';
import { isBoundedImageMetadata } from './image-snapshot';
import { MAX_CAPTURE_ROWS } from './contracts';

/** Prepared review data excludes its independently published original. */
export interface PreparedVideoReviewReplicaRoot {
  review: VideoWorkspaceSnapshot;
  sourceMediaId: string;
  assets: {
    entry: StoredProjectAssetEntry;
    ref: AssetRef;
    filename: string;
    reusePublished?: boolean;
    videoReview?: VideoWorkspaceSnapshot;
  }[];
  thumbnail?: { entry: Omit<MediaThumbnailEntry, 'blob'>; ref: AssetRef };
}

function invalid(): never {
  throw new Error('Prepared video review metadata or resource closure is invalid.');
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid();
}
function review(value: unknown): VideoWorkspaceSnapshot {
  if (!isRecord(value)) return invalid();
  keys(value, ['workspace', 'draft']);
  const workspace = parseVideoWorkspace(value['workspace']);
  if (!workspace) return invalid();
  const draft =
    value['draft'] === null
      ? null
      : parseVideoWorkspaceDraft(value['draft'], workspace.source.duration);
  if (value['draft'] !== null && (!draft || draft.aggregateId !== workspace.aggregateId))
    return invalid();
  return { workspace, draft };
}
function assets(value: unknown): PreparedVideoReviewReplicaRoot['assets'] {
  if (!Array.isArray(value) || value.length > MAX_CAPTURE_ROWS) return invalid();
  return value.map((raw: unknown) => {
    if (!isRecord(raw)) return invalid();
    keys(raw, ['entry', 'ref', 'filename', 'reusePublished', 'videoReview']);
    const entry = parseProjectAssetEntry(raw['entry']);
    const ref = parseAssetRef(raw['ref']);
    if (
      !entry ||
      !ref ||
      entry.assetId !== ref.assetId ||
      entry.size !== ref.size ||
      entry.mimeType !== ref.mimeType ||
      typeof raw['filename'] !== 'string' ||
      raw['filename'].length > 1024 ||
      (raw['reusePublished'] !== undefined && typeof raw['reusePublished'] !== 'boolean')
    )
      return invalid();
    const nested = raw['videoReview'] === undefined ? undefined : review(raw['videoReview']);
    if (
      nested &&
      (raw['reusePublished'] === true ||
        !entry.mimeType.startsWith('video/') ||
        nested.workspace.aggregateId !== `project-asset:${entry.id}` ||
        (nested.workspace.sourceMediaId ?? nested.workspace.aggregateId) !==
          nested.workspace.aggregateId ||
        nested.workspace.sourceAssetId !== ref.assetId ||
        nested.workspace.source.size !== ref.size ||
        !sameReviewVideoContainer(nested.workspace.source.mimeType, ref.mimeType))
    )
      return invalid();
    return {
      entry,
      ref,
      filename: raw['filename'],
      ...(raw['reusePublished'] === undefined ? {} : { reusePublished: raw['reusePublished'] }),
      ...(nested ? { videoReview: nested } : {}),
    };
  });
}
function thumbnail(
  value: unknown,
  aggregateId: string
): PreparedVideoReviewReplicaRoot['thumbnail'] {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isRecord(value['entry'])) return invalid();
  keys(value, ['entry', 'ref']);
  keys(value['entry'], [
    'assetId',
    'createdAt',
    'updatedAt',
    'generatorVersion',
    'width',
    'height',
  ]);
  const ref = parseAssetRef(value['ref']);
  const parsed = parseMediaThumbnailEntry({ ...value['entry'], blob: new Blob() });
  if (!ref || !parsed || parsed.assetId !== aggregateId || !ref.mimeType.startsWith('image/'))
    return invalid();
  const { blob: _blob, ...entry } = parsed;
  return { entry, ref };
}
function assertClosure(root: PreparedVideoReviewReplicaRoot): void {
  const byId = new Map(root.assets.map((asset) => [asset.entry.id, asset]));
  if (byId.size !== root.assets.length) invalid();
  const needed = new Set<string>();
  const retain = (value: VideoWorkspaceSnapshot) => {
    for (const reference of collectReviewAssetReferences(value.workspace)) {
      if (!reference.startsWith('project-asset:')) invalid();
      needed.add(reference.slice('project-asset:'.length));
    }
    for (const snapshot of value.workspace.effectSnapshots ?? [])
      for (const resource of snapshot.assets) {
        const asset = byId.get(resource.assetId.slice('project-asset:'.length));
        if (
          !asset ||
          asset.ref.size !== resource.byteLength ||
          asset.ref.mimeType !== resource.mimeType ||
          (asset.ref.sha256 !== null && asset.ref.sha256 !== resource.sha256)
        )
          invalid();
      }
  };
  retain(root.review);
  for (const id of needed) {
    const asset = byId.get(id);
    if (!asset) invalid();
    if (asset.videoReview) {
      if (asset.videoReview.workspace.aggregateId === root.review.workspace.aggregateId) invalid();
      retain(asset.videoReview);
    }
  }
  if (needed.size !== byId.size) invalid();
}

/** Admit exact authored resources, retaining cycles without accepting unrelated declarations. */
export function parsePreparedVideoReviewReplicaRoot(
  value: unknown
): PreparedVideoReviewReplicaRoot {
  if (!isRecord(value) || !isBoundedImageMetadata(value, false)) return invalid();
  keys(value, ['review', 'sourceMediaId', 'assets', 'thumbnail']);
  const parsed = review(value['review']);
  if (
    !parsed.workspace.project ||
    typeof value['sourceMediaId'] !== 'string' ||
    !value['sourceMediaId'] ||
    value['sourceMediaId'].length > 256 ||
    (parsed.workspace.sourceMediaId ?? parsed.workspace.aggregateId) !== value['sourceMediaId']
  )
    return invalid();
  const thumb = thumbnail(value['thumbnail'], parsed.workspace.aggregateId);
  const root = {
    review: parsed,
    sourceMediaId: value['sourceMediaId'],
    assets: assets(value['assets']),
    ...(thumb ? { thumbnail: thumb } : {}),
  };
  assertClosure(root);
  collectRefs(root);
  return structuredClone(root);
}
function collectRefs(root: PreparedVideoReviewReplicaRoot): AssetRef[] {
  const refs = new Map<string, AssetRef>();
  for (const ref of [
    ...root.assets.map((asset) => asset.ref),
    ...(root.thumbnail ? [root.thumbnail.ref] : []),
  ]) {
    const previous = refs.get(ref.assetId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(ref)) invalid();
    refs.set(ref.assetId, ref);
  }
  return [...refs.values()];
}
/** Return exact physical claims for the caller's existing journal. */
export function collectPreparedVideoReviewReplicaRefs(
  root: PreparedVideoReviewReplicaRoot
): AssetRef[] {
  return collectRefs(parsePreparedVideoReviewReplicaRoot(root));
}

/** Validate effect file integrity and detach thumbnail bytes before the publication transaction. */
export async function hydratePreparedVideoReviewReplicaRoot(input: PreparedVideoReviewReplicaRoot) {
  const root = parsePreparedVideoReviewReplicaRoot(input);
  const byReference = new Map(
    root.assets.map((asset) => [`project-asset:${asset.entry.id}`, asset])
  );
  const files = new Map<string, Promise<Blob>>();
  const read = async (reference: string) => {
    const asset = byReference.get(reference);
    if (!asset) return undefined;
    let file = files.get(reference);
    if (!file) {
      file = readAssetFile(asset.ref, asset.filename);
      files.set(reference, file);
    }
    return file;
  };
  const signal = new AbortController().signal;
  for (const snapshot of [
    root.review,
    ...root.assets.flatMap((asset) => (asset.videoReview ? [asset.videoReview] : [])),
  ])
    for (const effect of snapshot.workspace.effectSnapshots ?? [])
      await verifyReviewAnnotationEffectSnapshot(effect, read, signal);
  let hydrated: MediaThumbnailEntry | undefined;
  if (root.thumbnail) {
    const file = await readAssetFile(root.thumbnail.ref, 'thumbnail');
    if (file.size !== root.thumbnail.ref.size || file.type !== root.thumbnail.ref.mimeType)
      invalid();
    hydrated =
      parseMediaThumbnailEntry({
        ...root.thumbnail.entry,
        blob: new Blob([await file.arrayBuffer()], { type: file.type }),
      }) ?? invalid();
  }
  return {
    review: root.review,
    sourceMediaId: root.sourceMediaId,
    assets: root.assets,
    ...(hydrated ? { thumbnail: hydrated } : {}),
  };
}
