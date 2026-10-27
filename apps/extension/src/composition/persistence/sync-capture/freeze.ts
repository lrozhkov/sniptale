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
  IMAGE_WORKSPACES_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  THUMBNAILS_STORE,
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
  tx: IDBPTransaction<unknown, string[], 'readwrite'>,
  mediaId: string
): Promise<CapturedMediaRows> {
  const media = frozenNativeRow(await tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId), admitMedia);
  requireSupported(media.id === mediaId && media.source.kind === 'project-asset');
  const projectAsset = frozenNativeRow(
    await tx.objectStore(PROJECT_ASSETS_STORE).get(media.source.projectAssetId),
    admitAsset
  );
  const ref = frozenNativeRow(
    await tx.objectStore(ASSET_REFS_STORE).get(projectAsset.assetId),
    admitRef
  );
  const rows = parseCapturedMediaRows({ media, projectAsset, ref });
  requireSupported(rows !== null);
  await rejectUncapturedSidecars(tx, new Set([mediaId]));
  return structuredClone(rows);
}

/** Freeze one admitted graph through the caller's native transaction, without opening another transaction. */
export async function freezeVideoProjectInTransaction(
  tx: IDBPTransaction<unknown, string[], 'readwrite'>,
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
  private readonly mediaToRead = new Set<string>();
  private readonly aggregateIds;

  constructor(
    private readonly tx: IDBPTransaction<unknown, string[], 'readwrite'>,
    private readonly project: VideoProjectEntry
  ) {
    this.aggregateIds = new Set([project.id, `video-project:${project.id}`]);
  }

  async freeze(): Promise<CapturedVideoProjectRows> {
    await this.retainProjectSources();
    await this.retainPublishedExports();
    // Growing sets resolve origins and borrowed sources; maps bound cycles and deduplicate rows.
    for (const id of this.mediaToRead) await this.retainMedia(id);
    this.requireProjectAssetBindings();
    await rejectUncapturedSidecars(this.tx, this.aggregateIds);
    const rows = {
      project: this.project,
      assets: [...this.assets.values()],
      exports: [...this.exports.values()],
      media: [...this.media.values()],
      refs: [...this.refs.values()],
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
    }
  }

  private async retainExport(entry: StoredProjectExportEntry): Promise<void> {
    requireSupported(entry.projectId === this.project.id && entry.mimeType !== undefined);
    requireSupported(!entry.recordingMetadata && this.exports.size < MAX_CAPTURE_ROWS);
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
    }
  }

  private async retainProjectSources(): Promise<void> {
    const assetIds = new Set<string>();
    for (const asset of this.project.project.assets) {
      if (asset.source.kind === 'project-asset') {
        assetIds.add(asset.source.projectAssetId);
        if (asset.source.originMediaId) this.mediaToRead.add(asset.source.originMediaId);
      } else if (asset.source.kind === 'library-asset') this.mediaToRead.add(asset.source.mediaId);
    }
    for (const id of assetIds) await this.retainAsset(id);
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
    requireSupported(!entry.blob && !entry.recordingMetadata && !entry.recordingGroup);
    this.media.set(id, entry);
    this.aggregateIds.add(id);
    const source = entry.source;
    switch (source.kind) {
      case 'stored-asset':
        await this.retainRef(source.assetId, entry.size, entry.mimeType);
        break;
      case 'project-asset':
        await this.bindProjectAsset(entry, source.projectAssetId);
        break;
      case 'project-export':
        this.bindProjectExport(entry, source.exportId, source.projectId);
        break;
      case 'recording':
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

  private bindProjectExport(entry: MediaLibraryEntry, exportId: string, projectId: string): void {
    const exported = this.exports.get(exportId);
    requireSupported(exported !== undefined && projectId === this.project.id);
    requireSupported(entry.size === exported.size && entry.mimeType === exported.mimeType);
    if (entry.id.startsWith('export:')) requireSupported(entry.id === `export:${exported.id}`);
  }

  private requireProjectAssetBindings(): void {
    for (const asset of this.project.project.assets) {
      const resource =
        asset.source.kind === 'project-asset'
          ? this.assets.get(asset.source.projectAssetId)
          : asset.source.kind === 'library-asset'
            ? this.media.get(asset.source.mediaId)
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
  tx: IDBPTransaction<unknown, string[], 'readwrite'>,
  aggregateIds: ReadonlySet<string>
): Promise<void> {
  for (const id of aggregateIds) {
    for (const store of [
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
      IMAGE_WORKSPACES_STORE,
      THUMBNAILS_STORE,
    ])
      requireSupported((await tx.objectStore(store).get(id)) === undefined);
    requireSupported(
      (await tx.objectStore(VIDEO_WORKSPACE_HISTORY_STORE).index('aggregateId').getAllKeys(id, 1))
        .length === 0
    );
    for (const kind of ['image', 'video-project', 'scenario'])
      requireSupported(
        (await tx.objectStore(AGGREGATE_PRESENTATIONS_STORE).get([kind, id])) === undefined
      );
  }
}
