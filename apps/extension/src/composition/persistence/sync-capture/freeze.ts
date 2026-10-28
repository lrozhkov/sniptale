import { freezeImageInTransaction } from './image-snapshot';
import { parseScenarioAssetEntry } from '../scenario/read-guards';
import { collectCapturedProjectRecordingIds } from './project-snapshot';
import { parseRecordingEntry } from '../recordings/index.guards';
import { parseStoredWebSnapshotRecord } from '../web-snapshots/guards';
import { parseRecordingTelemetryEntry } from '../recordings/telemetry.guards';
import { parseAssetOwner } from '../assets/guards';
import { sameReviewVideoContainer } from '../../../features/video/review/validation';
import { readWorkspaceStorage } from '../review-workspaces/storage';
import { parseVideoWorkspace, parseVideoWorkspaceDraft } from '../review-workspaces/parser';
import { collectReviewAssetReferences } from '../review-workspaces/asset-refs';
import type { VideoWorkspaceSnapshot } from '../review-workspaces/contracts';
import { parseAggregatePresentationEntry } from '../aggregate-presentations/parser';
import { parseMediaThumbnailEntry } from '../media-library/read-guards';
import type { MediaThumbnailEntry } from '../media-library/contracts';
import type { AggregatePresentationEntry } from '../aggregate-presentations/contracts';
import type { IDBPTransaction } from 'idb';
import { sha256 } from '@noble/hashes/sha2.js';
import { parseAssetRef } from '../assets/guards';
import type { AssetRef } from '../assets/contracts';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import type { MediaLibraryEntry } from '../media-library/contracts';
import {
  parseProjectAssetEntry,
  parseProjectExportEntry,
  parseVideoProjectEntry,
} from '../projects/read-guards';
import type {
  StoredProjectAssetEntry,
  StoredProjectExportEntry,
  VideoProjectEntry,
} from '../projects/contracts';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  STORE_NAME,
  RECORDING_TELEMETRY_STORE,
  IMAGE_WORKSPACES_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  SCENARIO_ASSETS_STORE,
  THUMBNAILS_STORE,
  WEB_SNAPSHOTS_STORE,
  VIDEO_PROJECTS_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
} from '../infrastructure/indexed-db/core.stores';
import {
  MAX_CAPTURE_ROWS,
  type CapturedVideoProjectRows,
  type CapturedMediaRows,
} from './contracts';
import {
  isSupportedCaptureProject,
  parseCapturedVideoProjectRows,
  parseCapturedMediaRows,
} from './guards';

/** The pilot refuses relations whose native rows it does not capture. */
export class UnsupportedSyncCaptureGraphError extends Error {
  override name = 'UnsupportedSyncCaptureGraphError';

  constructor() {
    super('The project graph is outside the experimental sync capture profile.');
  }
}

function requireSupported(condition: boolean): asserts condition {
  if (!condition) throw new UnsupportedSyncCaptureGraphError();
}

function admitProject(value: unknown): value is VideoProjectEntry {
  return parseVideoProjectEntry(value) !== null;
}
function admitAsset(value: unknown): value is StoredProjectAssetEntry {
  return parseProjectAssetEntry(value) !== null;
}
function admitExport(value: unknown): value is StoredProjectExportEntry {
  return parseProjectExportEntry(value) !== null;
}
function admitMedia(value: unknown): value is MediaLibraryEntry {
  return parseMediaLibraryEntry(value) !== null;
}
function admitRef(value: unknown): value is AssetRef {
  return parseAssetRef(value) !== null;
}

function frozenNativeRow<T>(value: unknown, admit: (value: unknown) => value is T): T {
  requireSupported(admit(value));
  // Admission uses the native owner parser; cloning retains the accepted after-image, not its projection.
  return structuredClone(value);
}

/** Hash normalized native metadata synchronously so the caller retains its live IDB transaction. */
export function digestCapturedMediaRows(rows: CapturedMediaRows): string {
  const normalized = parseCapturedMediaRows(rows);
  requireSupported(normalized !== null);
  const digest = sha256(new TextEncoder().encode(JSON.stringify(normalized)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Freeze one original-only Library source through the caller's transaction. */
export async function freezeMediaInTransaction(
  tx: IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>,
  mediaId: string,
  options: { allowIndependentReview?: boolean } = {}
): Promise<CapturedMediaRows> {
  const media = frozenNativeRow(await tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId), admitMedia);
  requireSupported(media.id === mediaId);
  let rows: CapturedMediaRows | null;
  if (media.source.kind === 'stored-asset') {
    const ref = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(media.source.assetId));
    await requireSourceOwner(tx, 'media-library', media.id, 'source', media.source.assetId);
    rows = parseCapturedMediaRows({ media, ref });
  } else if (media.source.kind === 'project-export') {
    const projectExport = parseProjectExportEntry(
      await tx.objectStore(PROJECT_EXPORTS_STORE).get(media.source.exportId)
    );
    requireSupported(projectExport !== null);
    const ref = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(projectExport.assetId));
    await requireSourceOwner(tx, 'project-export', projectExport.id, 'body', projectExport.assetId);
    rows = parseCapturedMediaRows({ media, projectExport, ref });
  } else if (media.source.kind === 'web-snapshot') {
    const webSnapshot = parseStoredWebSnapshotRecord(
      await tx.objectStore(WEB_SNAPSHOTS_STORE).get(media.source.snapshotId)
    );
    requireSupported(webSnapshot !== null);
    const ref = parseAssetRef(
      await tx.objectStore(ASSET_REFS_STORE).get(webSnapshot.packageAssetId)
    );
    const screenshotRef = parseAssetRef(
      await tx.objectStore(ASSET_REFS_STORE).get(webSnapshot.screenshotAssetId)
    );
    await requireSourceOwner(
      tx,
      'web-snapshot',
      webSnapshot.id,
      'package',
      webSnapshot.packageAssetId
    );
    await requireSourceOwner(
      tx,
      'web-snapshot',
      webSnapshot.id,
      'screenshot',
      webSnapshot.screenshotAssetId
    );
    rows = parseCapturedMediaRows({ media, webSnapshot, ref, screenshotRef });
  } else if (media.source.kind === 'recording') {
    const recording = parseRecordingEntry(
      await tx.objectStore(STORE_NAME).get(media.source.recordingId)
    );
    requireSupported(recording !== null && recording.id === media.source.recordingId);
    const ref = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(recording.assetId));
    const rawTelemetry: unknown = await tx.objectStore(RECORDING_TELEMETRY_STORE).get(recording.id);
    const telemetry =
      rawTelemetry === undefined ? null : parseRecordingTelemetryEntry(rawTelemetry);
    const owner = parseAssetOwner(
      await tx.objectStore(ASSET_OWNERS_STORE).get(['recording', recording.id, 'body'])
    );
    requireSupported(
      Boolean(
        owner &&
        owner.ownerKind === 'recording' &&
        owner.ownerId === recording.id &&
        owner.role === 'body' &&
        owner.assetId === recording.assetId
      )
    );
    requireSupported(rawTelemetry === undefined || telemetry !== null);
    rows = parseCapturedMediaRows({ media, recording, ref, telemetry });
  } else {
    requireSupported(media.source.kind === 'project-asset');
    const projectAsset = frozenNativeRow(
      await tx.objectStore(PROJECT_ASSETS_STORE).get(media.source.projectAssetId),
      admitAsset
    );
    const ref = frozenNativeRow(
      await tx.objectStore(ASSET_REFS_STORE).get(projectAsset.assetId),
      admitRef
    );
    rows = parseCapturedMediaRows({ media, projectAsset, ref });
  }
  requireSupported(rows !== null);
  const { ref } = rows;
  const reviews = new Set<string>();
  if (options.allowIndependentReview) {
    const stored = await readWorkspaceStorage(tx, mediaId);
    const rawDraft: unknown = await tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).get(mediaId);
    if (stored.logical !== undefined || rawDraft !== undefined) {
      const workspace = parseVideoWorkspace(stored.logical);
      const draft =
        rawDraft === undefined
          ? null
          : parseVideoWorkspaceDraft(rawDraft, workspace?.source.duration ?? 0);
      requireSupported(
        Boolean(
          workspace &&
          workspace.aggregateId === mediaId &&
          (workspace.sourceMediaId ?? mediaId) === mediaId &&
          workspace.sourceAssetId === ref.assetId &&
          workspace.source.size === ref.size &&
          sameReviewVideoContainer(workspace.source.mimeType, ref.mimeType) &&
          ref.mimeType.startsWith('video/') &&
          (rawDraft === undefined || draft?.aggregateId === mediaId)
        )
      );
      reviews.add(mediaId);
    }
  }
  await rejectUncapturedSidecars(tx, new Set([mediaId]), {
    reviews,
    // Library can derive a recording thumbnail before any independent review exists.
    thumbnails: 'recording' in rows ? new Set([...reviews, mediaId]) : reviews,
    presentation: null,
  });
  return structuredClone(rows);
}

async function requireSourceOwner(
  tx: IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>,
  ownerKind: string,
  ownerId: string,
  role: string,
  assetId: string
): Promise<void> {
  const owner = parseAssetOwner(
    await tx.objectStore(ASSET_OWNERS_STORE).get([ownerKind, ownerId, role])
  );
  requireSupported(
    Boolean(
      owner &&
      owner.ownerKind === ownerKind &&
      owner.ownerId === ownerId &&
      owner.role === role &&
      owner.assetId === assetId
    )
  );
}

/** Freeze one admitted graph through the caller's native transaction, without opening another transaction. */
export async function freezeVideoProjectInTransaction(
  tx: IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>,
  projectId: string
): Promise<CapturedVideoProjectRows> {
  const project = frozenNativeRow(
    await tx.objectStore(VIDEO_PROJECTS_STORE).get(projectId),
    admitProject
  );
  requireSupported(project.id === projectId);
  requireSupported(isSupportedCaptureProject(project.project));
  return new NativeProjectSnapshot(tx, project).freeze();
}

/** One operation retains native rows and their dependencies under the caller's transaction. */
class NativeProjectSnapshot {
  private readonly assets = new Map<string, StoredProjectAssetEntry>();
  private readonly exports = new Map<string, StoredProjectExportEntry>();
  private readonly media = new Map<string, MediaLibraryEntry>();
  private readonly refs = new Map<string, AssetRef>();
  private readonly sourceExports: NonNullable<CapturedVideoProjectRows['sourceExports']> = [];
  private readonly scenarioAssets: NonNullable<CapturedVideoProjectRows['scenarioAssets']> = [];
  private readonly independentImages = new Set<string>();
  private readonly independentReviews = new Set<string>();
  private readonly recordings: NonNullable<CapturedVideoProjectRows['recordings']> = [];
  private readonly telemetry: NonNullable<CapturedVideoProjectRows['telemetry']> = [];
  private readonly mediaToRead = new Set<string>();
  private readonly reviews = new Map<string, VideoWorkspaceSnapshot>();
  private readonly thumbnails: MediaThumbnailEntry[] = [];
  private presentation: AggregatePresentationEntry | null = null;
  private readonly aggregateIds;

  constructor(
    private readonly tx: IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>,
    private readonly project: VideoProjectEntry
  ) {
    this.aggregateIds = new Set([project.id, `video-project:${project.id}`]);
  }

  async freeze(): Promise<CapturedVideoProjectRows> {
    await this.retainProjectSources();
    await this.retainPublishedExports();
    // Growing sets resolve origins and borrowed sources; maps bound cycles and deduplicate rows.
    for (const id of this.mediaToRead) await this.retainMedia(id);
    await this.retainProjectSidecars();
    this.requireProjectAssetBindings();
    await rejectUncapturedSidecars(this.tx, this.aggregateIds, {
      reviews: new Set([...this.reviews.keys(), ...this.independentReviews]),
      images: this.independentImages,
      thumbnails: new Set(this.thumbnails.map((entry) => entry.assetId)),
      presentation: this.presentation,
    });
    const rows = {
      project: this.project,
      ...(this.scenarioAssets.length ? { scenarioAssets: this.scenarioAssets } : {}),
      ...(this.sourceExports.length ? { sourceExports: this.sourceExports } : {}),
      ...(this.recordings.length ? { recordings: this.recordings, telemetry: this.telemetry } : {}),
      assets: [...this.assets.values()],
      exports: [...this.exports.values()],
      media: [...this.media.values()],
      refs: [...this.refs.values()],
      reviews: [...this.reviews.values()],
      thumbnails: this.thumbnails,
      presentation: this.presentation,
    };
    requireSupported(parseCapturedVideoProjectRows(rows) !== null);
    return rows;
  }

  private async retainRef(assetId: string, size: number, mimeType: string): Promise<void> {
    let ref = this.refs.get(assetId);
    if (!ref) {
      ref = frozenNativeRow(await this.tx.objectStore(ASSET_REFS_STORE).get(assetId), admitRef);
      requireSupported(ref.assetId === assetId && this.refs.size < MAX_CAPTURE_ROWS);
      this.refs.set(assetId, ref);
    }
    requireSupported(ref.size === size && ref.mimeType === mimeType);
  }

  private async retainAsset(id: string): Promise<void> {
    if (this.assets.has(id)) return;
    const asset = frozenNativeRow(
      await this.tx.objectStore(PROJECT_ASSETS_STORE).get(id),
      admitAsset
    );
    requireSupported(asset.id === id && this.assets.size < MAX_CAPTURE_ROWS);
    this.assets.set(id, asset);
    await this.retainRef(asset.assetId, asset.size, asset.mimeType);
    if (asset.originMediaId) this.mediaToRead.add(asset.originMediaId);
    const mirrorId = `project-asset:${id}`;
    this.aggregateIds.add(mirrorId);
    const mirror: unknown = await this.tx.objectStore(MEDIA_LIBRARY_STORE).get(mirrorId);
    if (mirror !== undefined) {
      const entry = frozenNativeRow(mirror, admitMedia);
      requireSupported(entry.source.kind === 'project-asset' && entry.source.projectAssetId === id);
      this.mediaToRead.add(mirrorId);
    } else {
      await this.retainReview(mirrorId, asset.assetId, asset.mimeType);
    }
  }

  private async retainExport(entry: StoredProjectExportEntry): Promise<void> {
    requireSupported(entry.projectId === this.project.id && entry.mimeType !== undefined);
    requireSupported(this.exports.size < MAX_CAPTURE_ROWS);
    this.exports.set(entry.id, entry);
    await this.retainRef(entry.assetId, entry.size, entry.mimeType);
    const mirrorId = `export:${entry.id}`;
    this.aggregateIds.add(mirrorId);
    const mirror: unknown = await this.tx.objectStore(MEDIA_LIBRARY_STORE).get(mirrorId);
    if (mirror !== undefined) {
      const row = frozenNativeRow(mirror, admitMedia);
      requireSupported(
        row.source.kind === 'project-export' &&
          row.source.exportId === entry.id &&
          row.source.projectId === this.project.id
      );
      this.mediaToRead.add(mirrorId);
    } else {
      await this.retainReview(mirrorId, entry.assetId, entry.mimeType);
    }
    await this.retainThumbnail(mirrorId);
  }

  private async retainReview(
    aggregateId: string,
    sourceAssetId: string,
    mimeType: string
  ): Promise<void> {
    if (this.reviews.has(aggregateId)) return;
    const stored = await readWorkspaceStorage(this.tx, aggregateId);
    const rawDraft: unknown = await this.tx
      .objectStore(VIDEO_WORKSPACE_DRAFTS_STORE)
      .get(aggregateId);
    if (stored.logical === undefined && rawDraft === undefined) return;
    const workspace = parseVideoWorkspace(stored.logical);
    requireSupported(
      Boolean(
        workspace &&
        workspace.aggregateId === aggregateId &&
        workspace.sourceAssetId === sourceAssetId &&
        mimeType.startsWith('video/')
      )
    );
    if (!workspace) throw new UnsupportedSyncCaptureGraphError();
    const draft =
      rawDraft === undefined ? null : parseVideoWorkspaceDraft(rawDraft, workspace.source.duration);
    requireSupported(rawDraft === undefined || Boolean(draft && draft.aggregateId === aggregateId));
    requireSupported(this.reviews.size < MAX_CAPTURE_ROWS);
    this.reviews.set(aggregateId, structuredClone({ workspace, draft }));
    for (const reference of collectReviewAssetReferences(workspace)) {
      requireSupported(reference.startsWith('project-asset:'));
      await this.retainAsset(reference.slice('project-asset:'.length));
    }
  }

  private async retainThumbnail(assetId: string): Promise<void> {
    const raw: unknown = await this.tx.objectStore(THUMBNAILS_STORE).get(assetId);
    if (raw === undefined) return;
    const entry = parseMediaThumbnailEntry(raw);
    requireSupported(
      entry !== null && entry.assetId === assetId && this.thumbnails.length < MAX_CAPTURE_ROWS
    );
    if (entry) this.thumbnails.push(structuredClone(entry));
  }

  private async retainProjectSidecars(): Promise<void> {
    await this.retainThumbnail(`video-project:${this.project.id}`);
    const raw: unknown = await this.tx
      .objectStore(AGGREGATE_PRESENTATIONS_STORE)
      .get(['video-project', this.project.id]);
    if (raw === undefined) return;
    const presentation = parseAggregatePresentationEntry(raw);
    requireSupported(
      presentation !== null &&
        presentation.aggregateKind === 'video-project' &&
        presentation.aggregateId === this.project.id
    );
    this.presentation = presentation === null ? null : structuredClone(presentation);
  }

  private async retainProjectSources(): Promise<void> {
    for (const id of collectCapturedProjectRecordingIds(this.project.project))
      this.mediaToRead.add(`recording:${id}`);
    const assetIds = new Set<string>();
    for (const asset of this.project.project.assets) {
      if (asset.source.kind === 'project-asset') {
        assetIds.add(asset.source.projectAssetId);
        if (asset.source.originMediaId) this.mediaToRead.add(asset.source.originMediaId);
      } else if (asset.source.kind === 'library-asset') this.mediaToRead.add(asset.source.mediaId);
      else if (asset.source.kind === 'scenario-asset')
        await this.retainScenarioAsset(asset.source.scenarioAssetId);
    }
    for (const id of assetIds) await this.retainAsset(id);
  }

  private async retainScenarioAsset(childId: string): Promise<void> {
    if (this.scenarioAssets.some((entry) => entry.id === childId)) return;
    const child = parseScenarioAssetEntry(
      await this.tx.objectStore(SCENARIO_ASSETS_STORE).get(childId)
    );
    requireSupported(child !== null && child.id === childId);
    if (!child) throw new UnsupportedSyncCaptureGraphError();
    await requireSourceOwner(this.tx, 'scenario-asset', child.id, 'body', child.assetId);
    await this.retainRef(child.assetId, child.size, child.mimeType);
    this.scenarioAssets.push(child);
  }

  private async retainPublishedExports(): Promise<void> {
    const rawExports: unknown[] = await this.tx
      .objectStore(PROJECT_EXPORTS_STORE)
      .index('projectId')
      .getAll(this.project.id, MAX_CAPTURE_ROWS + 1);
    requireSupported(rawExports.length <= MAX_CAPTURE_ROWS);
    for (const raw of rawExports) {
      const entry = frozenNativeRow(raw, admitExport);
      requireSupported(!this.exports.has(entry.id));
      await this.retainExport(entry);
    }
  }

  private async retainMedia(id: string): Promise<void> {
    if (this.media.has(id)) return;
    const entry = frozenNativeRow(
      await this.tx.objectStore(MEDIA_LIBRARY_STORE).get(id),
      admitMedia
    );
    requireSupported(entry.id === id && this.media.size < MAX_CAPTURE_ROWS);
    requireSupported(
      !entry.blob &&
        (entry.source.kind === 'recording' ||
          (!entry.recordingGroup &&
            (entry.source.kind === 'project-export' || !entry.recordingMetadata)))
    );
    this.media.set(id, entry);
    this.aggregateIds.add(id);
    const source = entry.source;
    switch (source.kind) {
      case 'stored-asset':
        if (entry.kind === 'image' || entry.kind === 'screenshot') {
          await freezeImageInTransaction(this.tx, id);
          this.independentImages.add(id);
        }
        await this.retainRef(source.assetId, entry.size, entry.mimeType);
        break;
      case 'project-asset':
        await this.bindProjectAsset(entry, source.projectAssetId);
        break;
      case 'project-export':
        await this.bindProjectExport(entry, source.exportId, source.projectId);
        break;
      case 'recording': {
        const rows = await freezeMediaInTransaction(this.tx, id, { allowIndependentReview: true });
        requireSupported('recording' in rows);
        if (!('recording' in rows)) throw new UnsupportedSyncCaptureGraphError();
        const review = await readWorkspaceStorage(this.tx, id);
        if (review.logical !== undefined) this.independentReviews.add(id);
        this.recordings.push(rows.recording);
        if (rows.telemetry) this.telemetry.push(rows.telemetry);
        await this.retainRef(rows.ref.assetId, rows.ref.size, rows.ref.mimeType);
        break;
      }
      case 'screenshot':
      case 'web-snapshot':
        throw new UnsupportedSyncCaptureGraphError();
    }
  }

  private async bindProjectAsset(entry: MediaLibraryEntry, projectAssetId: string): Promise<void> {
    await this.retainAsset(projectAssetId);
    const asset = this.assets.get(projectAssetId)!;
    requireSupported(entry.size === asset.size && entry.mimeType === asset.mimeType);
    if (entry.id.startsWith('project-asset:'))
      requireSupported(entry.id === `project-asset:${asset.id}`);
  }

  private async bindProjectExport(
    entry: MediaLibraryEntry,
    exportId: string,
    projectId: string
  ): Promise<void> {
    let exported = this.exports.get(exportId);
    if (!exported) {
      exported = frozenNativeRow(
        await this.tx.objectStore(PROJECT_EXPORTS_STORE).get(exportId),
        admitExport
      );
      requireSupported(exported.projectId === projectId && exported.mimeType !== undefined);
      this.sourceExports.push(exported);
      await this.retainRef(exported.assetId, exported.size, exported.mimeType ?? 'video/webm');
      const review = await readWorkspaceStorage(this.tx, entry.id);
      if (review.logical !== undefined) {
        await freezeMediaInTransaction(this.tx, entry.id, { allowIndependentReview: true });
        this.independentReviews.add(entry.id);
      }
    }
    requireSupported(exported.projectId === projectId);
    requireSupported(
      entry.size === exported.size &&
        entry.mimeType === exported.mimeType &&
        JSON.stringify(entry.recordingMetadata) === JSON.stringify(exported.recordingMetadata)
    );
    if (entry.id.startsWith('export:')) requireSupported(entry.id === `export:${exported.id}`);
  }

  private requireProjectAssetBindings(): void {
    for (const asset of this.project.project.assets) {
      const source = asset.source;
      const resource =
        source.kind === 'project-asset'
          ? this.assets.get(source.projectAssetId)
          : source.kind === 'library-asset'
            ? this.media.get(source.mediaId)
            : source.kind === 'recording'
              ? this.media.get(`recording:${source.recordingId}`)
              : source.kind === 'scenario-asset'
                ? this.scenarioAssets.find((entry) => entry.id === source.scenarioAssetId)
                : undefined;
      requireSupported(
        resource !== undefined &&
          resource.size === asset.metadata.size &&
          resource.mimeType === asset.metadata.mimeType
      );
    }
  }
}

async function rejectUncapturedSidecars(
  tx: IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>,
  aggregateIds: ReadonlySet<string>,
  admitted: {
    reviews: ReadonlySet<string>;
    images?: ReadonlySet<string>;
    thumbnails: ReadonlySet<string>;
    presentation: AggregatePresentationEntry | null;
  } = { reviews: new Set(), thumbnails: new Set(), presentation: null }
): Promise<void> {
  for (const id of aggregateIds) {
    for (const store of [
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
      IMAGE_WORKSPACES_STORE,
      THUMBNAILS_STORE,
    ]) {
      if (
        (store === VIDEO_WORKSPACES_STORE || store === VIDEO_WORKSPACE_DRAFTS_STORE) &&
        admitted.reviews.has(id)
      )
        continue;
      if (store === IMAGE_WORKSPACES_STORE && admitted.images?.has(id)) continue;
      if (store === THUMBNAILS_STORE && admitted.thumbnails.has(id)) continue;
      const value: unknown = await tx.objectStore(store).get(id);
      if (store === THUMBNAILS_STORE && value !== undefined) {
        // Library derives source previews independently of the authored project snapshot.
        const thumbnail = parseMediaThumbnailEntry(value);
        requireSupported(thumbnail !== null && thumbnail.assetId === id);
      } else {
        requireSupported(value === undefined);
      }
    }
    requireSupported(
      admitted.reviews.has(id) ||
        (await tx.objectStore(VIDEO_WORKSPACE_HISTORY_STORE).index('aggregateId').getAllKeys(id, 1))
          .length === 0
    );
    for (const kind of ['image', 'video-project', 'scenario']) {
      if (kind === 'video-project' && admitted.presentation?.aggregateId === id) continue;
      if (kind === 'image' && admitted.images?.has(id)) continue;
      requireSupported(
        (await tx.objectStore(AGGREGATE_PRESENTATIONS_STORE).get([kind, id])) === undefined
      );
    }
  }
}
