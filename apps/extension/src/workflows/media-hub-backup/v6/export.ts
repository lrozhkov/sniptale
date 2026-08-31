import {
  createArchiveWriter,
  type ArchiveRootDescriptor,
  type ArchiveTransferProgress,
  type ExportSink,
} from '../../../composition/archive-transfer';
import { encodeCatalogShards } from './catalog';
import { parseArchiveRootDescriptor, parseRootEnvelope } from './codec';
import {
  MEDIA_HUB_BACKUP_FORMAT,
  MEDIA_HUB_BACKUP_VERSION,
  type JsonValue,
  type MediaHubBackupCatalogShard,
  type MediaHubBackupManifestV6,
  type MediaHubBackupPrivacyFlags,
  type MediaHubBackupRootEnvelope,
} from './contracts';
import { CATALOG_ROOT, MANIFEST_PATH, MEDIA_HUB_BACKUP_LAYOUT } from './layout';
import type { GallerySavedView } from '../../../composition/persistence/gallery-saved-views';

export interface ArchiveRootObjectSource {
  blob: Blob;
  ref: MediaHubBackupRootEnvelope['objects'][number];
}

export interface ArchiveRootPayload {
  metadata: JsonValue;
  objects: ArchiveRootObjectSource[];
}

export interface MediaHubBackupRootInventoryItem {
  descriptor: ArchiveRootDescriptor;
  load(signal?: AbortSignal): Promise<ArchiveRootPayload>;
  summary: {
    draftCount: number;
    recordingCount: number;
    sourceMetadataCount: number;
    telemetryCount: number;
    thumbnailCount: number;
    webSnapshotCount: number;
  };
}

interface PlannedCatalog {
  descriptor: MediaHubBackupCatalogShard;
  text: string;
}

export interface MediaHubBackupExportPlanV6 {
  catalogs: PlannedCatalog[];
  manifest: MediaHubBackupManifestV6;
  roots: MediaHubBackupRootInventoryItem[];
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('Media backup export was cancelled.', 'AbortError');
}

function signalOptions(signal: AbortSignal | undefined): { signal?: AbortSignal } {
  return signal ? { signal } : {};
}

function profileKey(descriptor: ArchiveRootDescriptor): string {
  return descriptor.rootKind === 'media' ? `media:${descriptor.mediaSubtype}` : descriptor.rootKind;
}

function rootKey(descriptor: ArchiveRootDescriptor): string {
  return `${profileKey(descriptor)}:${descriptor.rootId}`;
}

function catalogPath(profile: string, index: number): string {
  const label =
    profile === 'media:library-item'
      ? 'media'
      : profile === 'media:effect-bundle'
        ? 'effect-bundles'
        : profile === 'video-project'
          ? 'video-projects'
          : 'scenario-projects';
  return `${CATALOG_ROOT}/${label}-${String(index + 1).padStart(6, '0')}.ndjson`;
}

function createArchiveId(): string {
  if (typeof crypto.randomUUID !== 'function') {
    throw new Error('Secure media backup archive IDs are unavailable.');
  }
  return crypto.randomUUID();
}

export function buildMediaHubBackupExportPlanV6(args: {
  archiveId?: string;
  exportedAt?: string;
  galleryViews?: GallerySavedView[];
  privacy: MediaHubBackupPrivacyFlags;
  roots: MediaHubBackupRootInventoryItem[];
}): MediaHubBackupExportPlanV6 {
  const rootKeys = new Set<string>();
  const metadataPaths = new Set<string>();
  const grouped = new Map<string, MediaHubBackupRootInventoryItem[]>();
  for (const item of args.roots) {
    const descriptor = parseArchiveRootDescriptor(item.descriptor);
    const key = rootKey(descriptor).toLocaleLowerCase('en-US');
    const metadataPath = descriptor.metadataPath.toLocaleLowerCase('en-US');
    if (rootKeys.has(key)) throw new Error('Media backup export root identity is duplicated.');
    if (metadataPaths.has(metadataPath)) {
      throw new Error('Media backup export metadata path is duplicated.');
    }
    rootKeys.add(key);
    metadataPaths.add(metadataPath);
    const profile = profileKey(descriptor);
    const group = grouped.get(profile) ?? [];
    group.push({ ...item, descriptor });
    grouped.set(profile, group);
  }

  const profileOrder = [
    'media:library-item',
    'media:effect-bundle',
    'video-project',
    'scenario-project',
  ];
  const roots = profileOrder.flatMap((profile) => grouped.get(profile) ?? []);
  const catalogs: PlannedCatalog[] = [];
  for (const profile of profileOrder) {
    const items = grouped.get(profile) ?? [];
    const shards = encodeCatalogShards(items.map((item) => item.descriptor));
    shards.forEach((shard, index) => {
      const first = shard.descriptors[0];
      if (!first) return;
      catalogs.push({
        descriptor: {
          ...(first.rootKind === 'media' ? { mediaSubtype: first.mediaSubtype } : {}),
          objectCount: shard.descriptors.reduce((total, item) => total + item.objectCount, 0),
          path: catalogPath(profile, index),
          rootCount: shard.descriptors.length,
          rootKind: first.rootKind,
          totalBytes: shard.descriptors.reduce((total, item) => total + item.totalBytes, 0),
        },
        text: shard.text,
      });
    });
  }

  const rootsByProfile = {
    effectBundles: grouped.get('media:effect-bundle')?.length ?? 0,
    libraryItems: grouped.get('media:library-item')?.length ?? 0,
    scenarioProjects: grouped.get('scenario-project')?.length ?? 0,
    videoProjects: grouped.get('video-project')?.length ?? 0,
  };
  const manifest: MediaHubBackupManifestV6 = {
    archiveId: args.archiveId ?? createArchiveId(),
    catalogs: catalogs.map((catalog) => catalog.descriptor),
    exportedAt: args.exportedAt ?? new Date().toISOString(),
    format: MEDIA_HUB_BACKUP_FORMAT,
    ...(args.galleryViews ? { galleryViews: structuredClone(args.galleryViews) } : {}),
    layout: MEDIA_HUB_BACKUP_LAYOUT,
    privacy: args.privacy,
    totals: {
      bytes: roots.reduce((total, item) => total + item.descriptor.totalBytes, 0),
      objects: roots.reduce((total, item) => total + item.descriptor.objectCount, 0),
      roots: roots.length,
      rootsByProfile,
    },
    version: MEDIA_HUB_BACKUP_VERSION,
  };
  return { catalogs, manifest, roots };
}

export async function exportMediaHubBackupV6(args: {
  onProgress?: (progress: ArchiveTransferProgress) => void;
  plan: MediaHubBackupExportPlanV6;
  signal?: AbortSignal;
  sink: ExportSink;
}): Promise<void> {
  const progress: ArchiveTransferProgress = {
    bytesRead: 0,
    bytesWritten: 0,
    currentFilename: null,
    rootsComplete: 0,
  };
  const report = () => args.onProgress?.({ ...progress });
  const writer = createArchiveWriter(args.sink, {
    onBytesWritten(bytesWritten) {
      progress.bytesWritten = bytesWritten;
      report();
    },
  });
  try {
    throwIfAborted(args.signal);
    progress.currentFilename = MANIFEST_PATH;
    report();
    await writer.addText(
      MANIFEST_PATH,
      JSON.stringify(args.plan.manifest),
      signalOptions(args.signal)
    );
    for (const catalog of args.plan.catalogs) {
      throwIfAborted(args.signal);
      progress.currentFilename = catalog.descriptor.path;
      report();
      await writer.addText(catalog.descriptor.path, catalog.text, signalOptions(args.signal));
    }
    for (const item of args.plan.roots) {
      throwIfAborted(args.signal);
      const payload = await item.load(args.signal);
      const envelope = parseRootEnvelope({
        descriptor: item.descriptor,
        metadata: payload.metadata,
        objects: payload.objects.map((object) => object.ref),
      });
      progress.currentFilename = item.descriptor.metadataPath;
      report();
      await writer.addText(
        item.descriptor.metadataPath,
        JSON.stringify(envelope),
        signalOptions(args.signal)
      );
      for (const object of payload.objects) {
        throwIfAborted(args.signal);
        if (object.blob.size !== object.ref.size) {
          throw new Error(`Media backup object source size changed: ${object.ref.path}.`);
        }
        progress.currentFilename = object.ref.filename;
        report();
        await writer.addBlob(object.ref.path, object.blob, signalOptions(args.signal));
        progress.bytesRead += object.blob.size;
        report();
      }
      progress.rootsComplete += 1;
      report();
    }
    progress.currentFilename = null;
    report();
    await writer.close();
  } catch (error) {
    await writer.abort(error).catch((abortError: unknown) => {
      throw new AggregateError([error, abortError], 'Media backup export cleanup failed.', {
        cause: error,
      });
    });
    throw error;
  }
}
