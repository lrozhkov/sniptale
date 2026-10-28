import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { verifyVideoProjectEffectSnapshotIntegrity } from '../../../features/video/project/effect-instance';
import { parseAssetRef, readAssetFile, type AssetRef } from '../assets';
import type { AggregatePresentationEntry } from '../aggregate-presentations/contracts';
import { parseAggregatePresentationEntry } from '../aggregate-presentations/parser';
import type { MediaThumbnailEntry } from '../media-library/contracts';
import { parseMediaThumbnailEntry } from '../media-library/read-guards';
import type { VideoProjectMetadataEntry } from '../projects/contracts';
import {
  parseProjectAssetEntry,
  parseVideoProjectEntry,
  parseVideoProjectMetadataEntry,
} from '../projects/read-guards';
import type { PreparedVideoProjectRevision } from '../projects/revision-publication';
import { parseVideoWorkspace, parseVideoWorkspaceDraft } from '../review-workspaces/parser';
import { isBoundedImageMetadata } from './image-snapshot';
import { MAX_CAPTURE_ROWS } from './contracts';

/** JSON-stage project metadata and exact immutable binary bindings; the caller owns read leases. */
export interface PreparedVideoProjectReplicaRoot {
  assets: PreparedVideoProjectRevision['assets'];
  entry: VideoProjectMetadataEntry;
  snapshotRefs?: { snapshotId: string; assetId: string; ref: AssetRef }[];
  thumbnail?: { entry: Omit<MediaThumbnailEntry, 'blob'>; ref: AssetRef };
  presentation?: {
    entry: Omit<AggregatePresentationEntry, 'thumbnailBlob' | 'previewBlob'>;
    thumbnailRef: AssetRef;
    previewRef?: AssetRef;
  };
}

function invalid(): never {
  throw new Error('Prepared project replica metadata or binary bindings are invalid.');
}

function assertKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid();
}

function requiredRef(value: unknown): AssetRef {
  return parseAssetRef(value) ?? invalid();
}

function parseAssets(value: unknown): PreparedVideoProjectRevision['assets'] {
  if (!Array.isArray(value) || value.length > MAX_CAPTURE_ROWS) return invalid();
  const ids = new Set<string>();
  return value.map((raw: unknown) => {
    if (!isRecord(raw)) return invalid();
    assertKeys(raw, [
      'entry',
      'filename',
      'publishToLibrary',
      'reusePublished',
      'ref',
      'videoReview',
    ]);
    const entry = parseProjectAssetEntry(raw['entry']);
    const ref = requiredRef(raw['ref']);
    if (
      !entry ||
      ids.has(entry.id) ||
      typeof raw['filename'] !== 'string' ||
      raw['filename'].length > 1024 ||
      (raw['publishToLibrary'] !== undefined && typeof raw['publishToLibrary'] !== 'boolean') ||
      (raw['reusePublished'] !== undefined && typeof raw['reusePublished'] !== 'boolean') ||
      entry.assetId !== ref.assetId ||
      entry.size !== ref.size ||
      entry.mimeType !== ref.mimeType
    )
      return invalid();
    ids.add(entry.id);
    const videoReview = parseReview(raw['videoReview'], entry.id, ref);
    return {
      entry,
      ref,
      filename: raw['filename'],
      ...(raw['publishToLibrary'] === undefined
        ? {}
        : { publishToLibrary: raw['publishToLibrary'] }),
      ...(raw['reusePublished'] === undefined ? {} : { reusePublished: raw['reusePublished'] }),
      ...(videoReview ? { videoReview } : {}),
    };
  });
}

function parseReview(value: unknown, childId: string, ref: AssetRef) {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return invalid();
  assertKeys(value, ['workspace', 'draft']);
  const workspace = parseVideoWorkspace(value['workspace']);
  const draft =
    value['draft'] === null
      ? null
      : parseVideoWorkspaceDraft(value['draft'], workspace?.source.duration ?? 0);
  const aggregateId = `project-asset:${childId}`;
  if (
    !workspace ||
    workspace.aggregateId !== aggregateId ||
    workspace.sourceAssetId !== ref.assetId ||
    (workspace.sourceMediaId !== undefined && workspace.sourceMediaId !== aggregateId) ||
    workspace.source.size !== ref.size ||
    workspace.source.mimeType !== ref.mimeType ||
    (value['draft'] !== null && (!draft || draft.aggregateId !== aggregateId))
  )
    return invalid();
  return { workspace, draft };
}

function parseSnapshots(value: unknown, entry: VideoProjectMetadataEntry) {
  const slotEntries = (entry.project.effectSnapshots ?? []).flatMap((snapshot) =>
    snapshot.assets.map((asset) => [JSON.stringify([snapshot.id, asset.id]), asset] as const)
  );
  const slots = new Map(slotEntries);
  if (slots.size !== slotEntries.length) return invalid();
  if (value === undefined) {
    if (slots.size) invalid();
    return undefined;
  }
  if (!Array.isArray(value) || value.length !== slots.size) return invalid();
  const seen = new Set<string>();
  return value.map((raw: unknown) => {
    if (!isRecord(raw)) return invalid();
    assertKeys(raw, ['snapshotId', 'assetId', 'ref']);
    if (typeof raw['snapshotId'] !== 'string' || typeof raw['assetId'] !== 'string')
      return invalid();
    const key = JSON.stringify([raw['snapshotId'], raw['assetId']]);
    const slot = slots.get(key);
    const ref = requiredRef(raw['ref']);
    if (
      !slot ||
      seen.has(key) ||
      slot.byteLength !== ref.size ||
      slot.mimeType !== ref.mimeType ||
      (ref.sha256 !== null && ref.sha256 !== slot.sha256)
    )
      return invalid();
    seen.add(key);
    return { snapshotId: raw['snapshotId'], assetId: raw['assetId'], ref };
  });
}

function parseThumbnail(value: unknown, id: string): PreparedVideoProjectReplicaRoot['thumbnail'] {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isRecord(value['entry'])) return invalid();
  assertKeys(value, ['entry', 'ref']);
  const entry = value['entry'];
  assertKeys(entry, ['assetId', 'createdAt', 'generatorVersion', 'updatedAt', 'width', 'height']);
  if (
    entry['assetId'] !== `video-project:${id}` ||
    typeof entry['createdAt'] !== 'number' ||
    typeof entry['updatedAt'] !== 'number' ||
    typeof entry['width'] !== 'number' ||
    typeof entry['height'] !== 'number' ||
    (entry['generatorVersion'] !== undefined && typeof entry['generatorVersion'] !== 'number')
  )
    return invalid();
  return {
    entry: {
      assetId: entry['assetId'],
      createdAt: entry['createdAt'],
      updatedAt: entry['updatedAt'],
      width: entry['width'],
      height: entry['height'],
      ...(entry['generatorVersion'] === undefined
        ? {}
        : { generatorVersion: entry['generatorVersion'] }),
    },
    ref: requiredRef(value['ref']),
  };
}

function parsePresentation(
  value: unknown,
  id: string
): PreparedVideoProjectReplicaRoot['presentation'] {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isRecord(value['entry'])) return invalid();
  assertKeys(value, ['entry', 'thumbnailRef', 'previewRef']);
  const entry = value['entry'];
  assertKeys(entry, ['aggregateId', 'aggregateKind', 'presentationRevision', 'updatedAt']);
  if (
    entry['aggregateId'] !== id ||
    entry['aggregateKind'] !== 'video-project' ||
    typeof entry['presentationRevision'] !== 'number' ||
    !Number.isInteger(entry['presentationRevision']) ||
    entry['presentationRevision'] < 0 ||
    typeof entry['updatedAt'] !== 'number'
  )
    return invalid();
  return {
    entry: {
      aggregateId: id,
      aggregateKind: 'video-project',
      presentationRevision: entry['presentationRevision'],
      updatedAt: entry['updatedAt'],
    },
    thumbnailRef: requiredRef(value['thumbnailRef']),
    ...(value['previewRef'] === undefined ? {} : { previewRef: requiredRef(value['previewRef']) }),
  };
}

function boundRefs(root: PreparedVideoProjectReplicaRoot): AssetRef[] {
  const refs = [
    ...root.assets.map((asset) => asset.ref),
    ...(root.snapshotRefs ?? []).map((binding) => binding.ref),
    ...(root.thumbnail ? [root.thumbnail.ref] : []),
    ...(root.presentation
      ? [
          root.presentation.thumbnailRef,
          ...(root.presentation.previewRef ? [root.presentation.previewRef] : []),
        ]
      : []),
  ];
  const unique = new Map<string, AssetRef>();
  for (const ref of refs) {
    const previous = unique.get(ref.assetId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(ref)) invalid();
    unique.set(ref.assetId, ref);
  }
  return [...unique.values()];
}

/** Admit a bounded JSON staged root, exact effect slots, native child rows and sidecar associations. */
export function parsePreparedVideoProjectReplicaRoot(
  value: unknown
): PreparedVideoProjectReplicaRoot {
  if (!isRecord(value) || !isBoundedImageMetadata(value, false)) return invalid();
  assertKeys(value, ['assets', 'entry', 'snapshotRefs', 'thumbnail', 'presentation']);
  const entry = parseVideoProjectMetadataEntry(value['entry']);
  if (!entry) return invalid();
  const assets = parseAssets(value['assets']);
  const snapshotRefs = parseSnapshots(value['snapshotRefs'], entry);
  const thumbnail = parseThumbnail(value['thumbnail'], entry.id);
  const presentation = parsePresentation(value['presentation'], entry.id);
  const root = {
    entry,
    assets,
    ...(snapshotRefs === undefined ? {} : { snapshotRefs }),
    ...(thumbnail ? { thumbnail } : {}),
    ...(presentation ? { presentation } : {}),
  };
  boundRefs(root);
  return root;
}

/** Return exact deduplicated immutable claims, refusing inconsistent physical identities. */
export function collectPreparedProjectReplicaRefs(
  root: PreparedVideoProjectReplicaRoot
): AssetRef[] {
  return boundRefs(parsePreparedVideoProjectReplicaRoot(root));
}

async function detachedBlob(ref: AssetRef, filename: string): Promise<Blob> {
  const file = await readAssetFile(ref, filename);
  if (file.size !== ref.size || file.type !== ref.mimeType) return invalid();
  return new Blob([await file.arrayBuffer()], { type: ref.mimeType });
}

/** Detach retained bytes and validate the complete native effect entry before any caller transaction. */
export async function hydratePreparedVideoProjectReplicaRoot(
  input: PreparedVideoProjectReplicaRoot
): Promise<PreparedVideoProjectRevision> {
  const root = structuredClone(parsePreparedVideoProjectReplicaRoot(input));
  const bindings = new Map(
    (root.snapshotRefs ?? []).map((binding) => [
      JSON.stringify([binding.snapshotId, binding.assetId]),
      binding.ref,
    ])
  );
  const effectSnapshots =
    root.entry.project.effectSnapshots === undefined
      ? undefined
      : await Promise.all(
          root.entry.project.effectSnapshots.map(async (snapshot) => ({
            ...snapshot,
            assets: await Promise.all(
              snapshot.assets.map(async (asset) => ({
                ...asset,
                blob: await detachedBlob(
                  bindings.get(JSON.stringify([snapshot.id, asset.id])) ?? invalid(),
                  asset.id
                ),
              }))
            ),
          }))
        );
  const entry = parseVideoProjectEntry({
    ...root.entry,
    project: {
      ...root.entry.project,
      ...(effectSnapshots === undefined ? {} : { effectSnapshots }),
    },
  });
  if (!entry) return invalid();
  await verifyVideoProjectEffectSnapshotIntegrity(entry.project);
  const thumbnail = root.thumbnail
    ? parseMediaThumbnailEntry({
        ...root.thumbnail.entry,
        blob: await detachedBlob(root.thumbnail.ref, 'thumbnail'),
      })
    : undefined;
  const presentation = root.presentation
    ? parseAggregatePresentationEntry({
        ...root.presentation.entry,
        thumbnailBlob: await detachedBlob(root.presentation.thumbnailRef, 'presentation-thumbnail'),
        ...(root.presentation.previewRef
          ? {
              previewBlob: await detachedBlob(root.presentation.previewRef, 'presentation-preview'),
            }
          : {}),
      })
    : undefined;
  if (thumbnail === null || presentation === null) return invalid();
  return {
    entry,
    assets: root.assets,
    ...(thumbnail ? { thumbnail } : {}),
    ...(presentation ? { presentation } : {}),
  };
}
