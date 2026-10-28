import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseAggregatePresentationEntry } from '../aggregate-presentations/parser';
import { parseMediaLibraryEntry, parseMediaThumbnailEntry } from '../media-library/read-guards';
import { parseVideoWorkspace, parseVideoWorkspaceDraft } from '../review-workspaces/parser';
import { collectReviewAssetReferences } from '../review-workspaces/asset-refs';
import type { VideoWorkspaceSnapshot } from '../review-workspaces/contracts';
import {
  parseProjectAssetEntry,
  parseProjectExportEntry,
  parseVideoProjectEntry,
} from '../projects/read-guards';
import { parseAssetRef } from '../assets/guards';
import type { VideoProjectMetadata } from '../../../features/video/project/validation';
import {
  MAX_CAPTURE_ROWS,
  MAX_CAPTURE_METADATA_BYTES,
  type CapturedVideoProjectRows,
  type CapturedMediaDependency,
} from './contracts';
import { isBoundedImageMetadata, describeImageMetadata } from './image-snapshot';

function identity(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}
function ordinal(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function parseRows<T>(value: unknown, parse: (row: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > MAX_CAPTURE_ROWS) return null;
  const parsed = value.map(parse);
  return parsed.some((row) => row === null) ? null : parsed.filter((row) => row !== null);
}

/** Manual projects retain authored data; recording and scenario resources need their own capture owners. */
export function isSupportedCaptureProject(project: VideoProjectMetadata): boolean {
  if (
    project.source.kind !== 'manual' ||
    project.baseRecordingId !== null ||
    (project.actionFeedback?.length ?? 0) > 0 ||
    project.actionEvents?.some((event) => event.anchor.kind === 'recording-source') ||
    project.cursorFocusPath?.segments.some(
      (segment) => segment.binding.kind === 'recording-source'
    ) ||
    (project.cursorTrack?.sourceObservations?.length ?? 0) > 0 ||
    project.cursorTrack?.samples.some((sample) => sample.sourceAnchor !== undefined)
  )
    return false;
  const ids = new Set(project.assets.map((asset) => asset.id));
  return (
    project.assets.length <= MAX_CAPTURE_ROWS &&
    ids.size === project.assets.length &&
    project.assets.every(
      (asset) =>
        !asset.recordingPart &&
        asset.type !== 'RECORDING' &&
        (asset.source.kind === 'library-asset' ||
          (asset.source.kind === 'project-asset' && !asset.source.originRecordingId))
    ) &&
    project.clips.every(
      (clip) =>
        (clip.type !== 'VIDEO' && clip.type !== 'AUDIO' && clip.type !== 'IMAGE') ||
        ids.has(clip.assetId)
    )
  );
}

/** Select only resources reachable from editable materials, excluding export-only reviews. */
export function collectCapturedProjectEditingMediaIds(rows: CapturedVideoProjectRows): Set<string> {
  const mediaIds = new Set<string>();
  const assetIds = new Set<string>();
  for (const asset of rows.project.project.assets) {
    if (asset.source.kind === 'library-asset') mediaIds.add(asset.source.mediaId);
    if (asset.source.kind === 'project-asset') {
      assetIds.add(asset.source.projectAssetId);
      if (asset.source.originMediaId) mediaIds.add(asset.source.originMediaId);
    }
  }
  // Set iteration visits newly added review resources and terminates on cycles.
  for (const id of assetIds) {
    const asset = rows.assets.find((entry) => entry.id === id);
    if (asset?.originMediaId) mediaIds.add(asset.originMediaId);
    const mirrorId = `project-asset:${id}`;
    if (rows.media.some((entry) => entry.id === mirrorId)) mediaIds.add(mirrorId);
    const review = rows.reviews?.find((entry) => entry.workspace.aggregateId === mirrorId);
    if (review) {
      for (const reference of collectReviewAssetReferences(review.workspace)) {
        if (reference.startsWith('project-asset:'))
          assetIds.add(reference.slice('project-asset:'.length));
      }
    }
  }
  return mediaIds;
}

function parseMediaDependencies(value: unknown): CapturedMediaDependency[] | null {
  return parseRows(value, (item) => {
    if (
      !isRecord(item) ||
      !identity(item['mediaId']) ||
      !ordinal(item['generation']) ||
      item['generation'] === 0 ||
      !Array.isArray(item['basis']) ||
      item['basis'].length === 0 ||
      item['basis'].length > MAX_CAPTURE_ROWS ||
      !item['basis'].every(identity) ||
      new Set(item['basis']).size !== item['basis'].length
    )
      return null;
    return { mediaId: item['mediaId'], generation: item['generation'], basis: item['basis'] };
  });
}

function parseCapturedProjectSidecars(value: Record<string, unknown>) {
  const reviews =
    value['reviews'] === undefined ? undefined : parseRows(value['reviews'], parseCapturedReview);
  const thumbnails =
    value['thumbnails'] === undefined
      ? undefined
      : parseRows(value['thumbnails'], parseMediaThumbnailEntry);
  const presentation =
    value['presentation'] === undefined
      ? undefined
      : value['presentation'] === null
        ? null
        : parseAggregatePresentationEntry(value['presentation']);
  const mediaDependencies =
    value['mediaDependencies'] === undefined
      ? undefined
      : parseMediaDependencies(value['mediaDependencies']);
  if (
    reviews === null ||
    thumbnails === null ||
    mediaDependencies === null ||
    (value['presentation'] != null && presentation === null)
  )
    return null;
  return {
    ...(reviews === undefined ? {} : { reviews }),
    ...(thumbnails === undefined ? {} : { thumbnails }),
    ...(presentation === undefined ? {} : { presentation }),
    ...(mediaDependencies === undefined ? {} : { mediaDependencies }),
  };
}

/** Native row identities and file descriptors must describe the same frozen resources. */
function matchesCapturedBinaryRows(rows: CapturedVideoProjectRows): boolean {
  if (rows.media.some((row) => 'blob' in row && Boolean(row.blob))) return false;
  for (const entries of [rows.assets, rows.exports, rows.media]) {
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length) return false;
  }
  const resources = new Map(rows.refs.map((ref) => [ref.assetId, ref]));
  return (
    resources.size === rows.refs.length &&
    [...rows.assets, ...rows.exports].every((entry) => {
      const ref = resources.get(entry.assetId);
      return (
        ref !== undefined &&
        ref.size === entry.size &&
        (entry.mimeType === undefined || ref.mimeType === entry.mimeType)
      );
    }) &&
    rows.exports.every((entry) => entry.projectId === rows.project.id)
  );
}

function matchesCapturedEditingDependencies(rows: CapturedVideoProjectRows): boolean {
  if (rows.mediaDependencies === undefined) return true;
  const ids = new Set(rows.mediaDependencies.map((entry) => entry.mediaId));
  const editing = collectCapturedProjectEditingMediaIds(rows);
  return (
    ids.size === rows.mediaDependencies.length &&
    ids.size === editing.size &&
    [...editing].every((id) => ids.has(id))
  );
}

/** Parse accepted native rows again when they cross the persistence boundary. */
export function parseCapturedVideoProjectRows(value: unknown): CapturedVideoProjectRows | null {
  if (!isRecord(value) || !isBoundedImageMetadata(value)) return null;
  const project = parseVideoProjectEntry(value['project']);
  const assets = parseRows(value['assets'], parseProjectAssetEntry);
  const exports = parseRows(value['exports'], parseProjectExportEntry);
  const media = parseRows(value['media'], parseMediaLibraryEntry);
  const refs = parseRows(value['refs'], parseAssetRef);
  const sidecars = parseCapturedProjectSidecars(value);
  if (!project || !assets || !exports || !media || !refs || !sidecars) return null;
  const parsed = { project, assets, exports, media, refs, ...sidecars };
  if (!matchesCapturedBinaryRows(parsed) || !matchesCapturedEditingDependencies(parsed))
    return null;
  const described = projectMetadataDescriptors(parsed);
  if (!isBoundedImageMetadata({ ...value, ...described }, false)) return null;
  if (!isSupportedCaptureProject(project.project) || !completeCapturedGraph(parsed)) return null;
  if (new TextEncoder().encode(JSON.stringify(described)).byteLength > MAX_CAPTURE_METADATA_BYTES)
    return null;
  return parsed;
}

function parseCapturedReview(value: unknown): VideoWorkspaceSnapshot | null {
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

/** Only native snapshot and presentation slots can retain inline binary values. */
function projectMetadataDescriptors(rows: CapturedVideoProjectRows) {
  return {
    ...rows,
    project: {
      ...rows.project,
      project: {
        ...rows.project.project,
        ...(rows.project.project.effectSnapshots
          ? {
              effectSnapshots: rows.project.project.effectSnapshots.map((snapshot) => ({
                ...snapshot,
                assets: snapshot.assets.map(({ blob, ...asset }) => ({
                  ...asset,
                  blob: describeImageMetadata(blob),
                })),
              })),
            }
          : {}),
      },
    },
    ...(rows.thumbnails
      ? {
          thumbnails: rows.thumbnails.map(({ blob, ...thumbnail }) => ({
            ...thumbnail,
            blob: describeImageMetadata(blob),
          })),
        }
      : {}),
    ...(rows.presentation
      ? {
          presentation: {
            ...rows.presentation,
            thumbnailBlob: describeImageMetadata(rows.presentation.thumbnailBlob),
            ...(rows.presentation.previewBlob
              ? { previewBlob: describeImageMetadata(rows.presentation.previewBlob) }
              : {}),
          },
        }
      : {}),
  };
}

/** Resolve the full admitted dependency closure; do not silently discard missing rows. */
function completeCapturedGraph(rows: CapturedVideoProjectRows): boolean {
  const closure = new CapturedProjectClosure(rows);
  return (
    closure.admitProjectSources() &&
    closure.admitExports() &&
    closure.admitSidecars() &&
    closure.resolveDependencies()
  );
}

class CapturedProjectClosure {
  private readonly assets;
  private readonly media;
  private readonly exports;
  private readonly refs;
  private readonly neededAssets = new Set<string>();
  private readonly neededMedia = new Set<string>();
  private readonly neededRefs = new Set<string>();

  constructor(private readonly rows: CapturedVideoProjectRows) {
    this.assets = new Map(rows.assets.map((entry) => [entry.id, entry]));
    this.media = new Map(rows.media.map((entry) => [entry.id, entry]));
    this.exports = new Map(rows.exports.map((entry) => [entry.id, entry]));
    this.refs = new Map(rows.refs.map((entry) => [entry.assetId, entry]));
  }

  admitProjectSources(): boolean {
    for (const asset of this.rows.project.project.assets) {
      const source = asset.source;
      const resource =
        source.kind === 'project-asset'
          ? this.assets.get(source.projectAssetId)
          : source.kind === 'library-asset'
            ? this.media.get(source.mediaId)
            : undefined;
      if (
        !resource ||
        resource.size !== asset.metadata.size ||
        resource.mimeType !== asset.metadata.mimeType
      )
        return false;
      if (source.kind === 'project-asset') {
        this.neededAssets.add(source.projectAssetId);
        if (source.originMediaId) this.neededMedia.add(source.originMediaId);
      } else if (source.kind === 'library-asset') this.neededMedia.add(source.mediaId);
    }
    return true;
  }

  admitExports(): boolean {
    for (const entry of this.rows.exports) {
      if (!entry.mimeType || entry.recordingMetadata) return false;
      this.neededRefs.add(entry.assetId);
      if (this.media.has(`export:${entry.id}`)) this.neededMedia.add(`export:${entry.id}`);
    }
    return true;
  }

  admitSidecars(): boolean {
    const reviews = this.rows.reviews ?? [];
    if (new Set(reviews.map((review) => review.workspace.aggregateId)).size !== reviews.length)
      return false;
    for (const review of reviews) {
      const id = review.workspace.aggregateId;
      const child =
        [...this.assets.values()].find((asset) => `project-asset:${asset.id}` === id) ??
        [...this.exports.values()].find((entry) => `export:${entry.id}` === id);
      if (
        !child ||
        !child.mimeType?.startsWith('video/') ||
        child.assetId !== review.workspace.sourceAssetId ||
        this.media.has(id)
      )
        return false;
      for (const reference of collectReviewAssetReferences(review.workspace)) {
        if (!reference.startsWith('project-asset:')) return false;
        this.neededAssets.add(reference.slice('project-asset:'.length));
      }
    }
    const thumbnails = this.rows.thumbnails ?? [];
    if (new Set(thumbnails.map((thumbnail) => thumbnail.assetId)).size !== thumbnails.length)
      return false;
    if (
      thumbnails.some(
        (thumbnail) =>
          thumbnail.assetId !== `video-project:${this.rows.project.id}` &&
          ![...this.exports.values()].some((entry) => thumbnail.assetId === `export:${entry.id}`)
      )
    )
      return false;
    return (
      !this.rows.presentation ||
      (this.rows.presentation.aggregateId === this.rows.project.id &&
        this.rows.presentation.aggregateKind === 'video-project')
    );
  }

  resolveDependencies(): boolean {
    // Growing sets traverse cycles once; input row limits bound the work.
    let assetOffset = 0;
    let mediaOffset = 0;
    while (assetOffset < this.neededAssets.size || mediaOffset < this.neededMedia.size) {
      const assetIds = [...this.neededAssets];
      for (; assetOffset < assetIds.length; assetOffset++) {
        if (!this.admitProjectAsset(assetIds[assetOffset]!)) return false;
      }
      const mediaIds = [...this.neededMedia];
      for (; mediaOffset < mediaIds.length; mediaOffset++) {
        if (!this.admitMedia(mediaIds[mediaOffset]!)) return false;
      }
    }
    return (
      this.neededAssets.size === this.assets.size &&
      this.neededMedia.size === this.media.size &&
      this.neededRefs.size === this.refs.size &&
      [...this.neededRefs].every((id) => this.refs.has(id))
    );
  }

  private admitProjectAsset(id: string): boolean {
    const entry = this.assets.get(id);
    if (!entry) return false;
    this.neededRefs.add(entry.assetId);
    if (entry.originMediaId) this.neededMedia.add(entry.originMediaId);
    if (this.media.has(`project-asset:${entry.id}`))
      this.neededMedia.add(`project-asset:${entry.id}`);
    return true;
  }

  private admitMedia(id: string): boolean {
    const entry = this.media.get(id);
    if (!entry || entry.recordingMetadata || entry.recordingGroup) return false;
    const source = entry.source;
    switch (source.kind) {
      case 'project-asset': {
        const target = this.assets.get(source.projectAssetId);
        if (!target || entry.size !== target.size || entry.mimeType !== target.mimeType)
          return false;
        if (
          entry.id.startsWith('project-asset:') &&
          entry.id !== `project-asset:${source.projectAssetId}`
        )
          return false;
        this.neededAssets.add(source.projectAssetId);
        return true;
      }
      case 'project-export': {
        const target = this.exports.get(source.exportId);
        return (
          target !== undefined &&
          entry.size === target.size &&
          entry.mimeType === target.mimeType &&
          source.projectId === this.rows.project.id &&
          (!entry.id.startsWith('export:') || entry.id === `export:${source.exportId}`)
        );
      }
      case 'stored-asset': {
        const target = this.refs.get(source.assetId);
        if (!target || entry.size !== target.size || entry.mimeType !== target.mimeType)
          return false;
        this.neededRefs.add(source.assetId);
        return true;
      }
      case 'recording':
      case 'screenshot':
      case 'web-snapshot':
        return false;
    }
  }
}
