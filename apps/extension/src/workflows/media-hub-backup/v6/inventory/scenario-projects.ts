import type { ArchivePathAllocator } from '../../../../composition/archive-transfer';
import { parseMediaThumbnailEntry } from '../../../../composition/persistence/media-library/read-guards';
import {
  MEDIA_LIBRARY_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  THUMBNAILS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import {
  parseScenarioAssetEntry,
  parseScenarioExportEntry,
  parseScenarioProjectEntry,
} from '../../../../composition/persistence/scenario/read-guards';
import { parseMediaLibraryEntry } from '../../../../composition/persistence/media-library/read-guards';
import type { ScenarioProjectEntry } from '../../../../composition/persistence/scenario/contracts';
import { parseScenarioStepEditorDocumentEntry } from '../../../../composition/persistence/scenario/editor-documents';
import { encodePortableEditorDocument } from '../root-codecs/editor-document';
import { encodePortableThumbnail } from '../root-codecs/media';
import {
  encodePortableScenarioProjectEntry,
  type PortableScenarioProjectMetadata,
} from '../root-codecs/projects';
import { projectScenarioPrivacy, projectStoredEditorDocumentPrivacy } from '../privacy';
import type { JsonValue, MediaHubBackupExportOptions } from '../contracts';
import type { MediaHubBackupRootInventoryItem } from '../export';
import {
  createObjectCollector,
  createReadableAssetFilename,
  readInventoryAssetFile,
  type InventoryDatabase,
} from './helpers';
import { METADATA_ROOT, withDraftRoot } from '../layout';
import { buildPortableAggregatePresentation } from './presentation';

function readSelectedScenarioProjects(
  rows: unknown[],
  options: MediaHubBackupExportOptions
): ScenarioProjectEntry[] {
  return rows
    .map(parseScenarioProjectEntry)
    .filter((entry): entry is NonNullable<typeof entry> =>
      Boolean(
        entry &&
        (entry.lifecycle?.storageClass !== 'temporary' || options.includeDrafts) &&
        (options.scope === 'all' || options.selected?.scenarioProjectIds.includes(entry.id))
      )
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function buildScenarioAssets(
  db: InventoryDatabase,
  entry: ScenarioProjectEntry,
  collector: ReturnType<typeof createObjectCollector>
) {
  const assets = [];
  const rows = (await db.getAllFromIndex(SCENARIO_ASSETS_STORE, 'projectId', entry.id)).sort(
    (left, right) => {
      const leftEntry = parseScenarioAssetEntry(left);
      const rightEntry = parseScenarioAssetEntry(right);
      return (leftEntry?.id ?? '').localeCompare(rightEntry?.id ?? '');
    }
  );
  for (const [index, raw] of rows.entries()) {
    const asset = parseScenarioAssetEntry(raw);
    if (!asset) throw new Error('Stored scenario asset is invalid and cannot be exported.');
    const media = asset.galleryAssetId
      ? parseMediaLibraryEntry(await db.get(MEDIA_LIBRARY_STORE, asset.galleryAssetId))
      : null;
    const filename = media?.filename ?? createReadableAssetFilename(index, asset.mimeType);
    const file = await readInventoryAssetFile(db, asset.assetId, filename);
    const { assetId: _assetId, ...portable } = asset;
    assets.push({
      entry: portable,
      objectId: collector.addObject(
        file,
        filename,
        asset.mimeType,
        withDraftRoot(entry.lifecycle?.storageClass === 'temporary', [
          'Scenarios',
          entry.project.name,
          'Assets',
        ])
      ),
    });
  }
  return assets;
}

async function buildScenarioDocuments(
  db: InventoryDatabase,
  entry: ScenarioProjectEntry,
  collector: ReturnType<typeof createObjectCollector>,
  options: MediaHubBackupExportOptions
) {
  const documents = [];
  const rows = await db.getAllFromIndex(
    SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
    'projectId',
    entry.id
  );
  rows.sort((left, right) => {
    const leftEntry = parseScenarioStepEditorDocumentEntry(left);
    const rightEntry = parseScenarioStepEditorDocumentEntry(right);
    return (leftEntry?.stepId ?? '').localeCompare(rightEntry?.stepId ?? '');
  });
  for (const raw of rows) {
    const stored = parseScenarioStepEditorDocumentEntry(raw);
    if (!stored)
      throw new Error('Stored scenario editor document is invalid and cannot be exported.');
    const document = projectStoredEditorDocumentPrivacy(stored.document, options);
    const objectsByAssetId = new Map<string, string>();
    for (const asset of document.assets) {
      if (objectsByAssetId.has(asset.assetId)) continue;
      const file = await readInventoryAssetFile(
        db,
        asset.assetId,
        `${stored.stepId}-${asset.role}`
      );
      objectsByAssetId.set(
        asset.assetId,
        collector.addObject(file, `${stored.stepId}-${asset.role}`, file.type || 'image/png')
      );
    }
    documents.push({
      ...stored,
      document: encodePortableEditorDocument({ document, objectsByAssetId }),
    });
  }
  return documents;
}

async function buildScenarioExportThumbnails(
  db: InventoryDatabase,
  exports: PortableScenarioProjectMetadata['exports'],
  collector: ReturnType<typeof createObjectCollector>
) {
  const output = [];
  for (const entry of exports) {
    const thumbnail = parseMediaThumbnailEntry(
      await db.get(THUMBNAILS_STORE, `scenario-export:${entry.id}`)
    );
    if (!thumbnail) continue;
    output.push({
      exportId: entry.id,
      thumbnail: encodePortableThumbnail(
        thumbnail,
        collector.addObject(
          thumbnail.blob,
          `${entry.id}-thumbnail`,
          thumbnail.blob.type || 'image/png'
        )
      ),
    });
  }
  return output;
}

async function buildScenarioProjectRoot(args: {
  db: InventoryDatabase;
  entry: ScenarioProjectEntry;
  index: number;
  options: MediaHubBackupExportOptions;
  paths: ArchivePathAllocator;
}): Promise<MediaHubBackupRootInventoryItem> {
  const collector = createObjectCollector(
    `scenario-${String(args.index + 1).padStart(6, '0')}`,
    args.paths
  );
  const assets = await buildScenarioAssets(args.db, args.entry, collector);
  const exports = (
    await args.db.getAllFromIndex(SCENARIO_EXPORTS_STORE, 'projectId', args.entry.id)
  )
    .map(parseScenarioExportEntry)
    .filter((value): value is NonNullable<typeof value> => value !== null)
    .sort((left, right) => left.id.localeCompare(right.id));
  const stepDocuments = await buildScenarioDocuments(args.db, args.entry, collector, args.options);
  const exportThumbnails = await buildScenarioExportThumbnails(args.db, exports, collector);
  const storedProjectThumbnail = parseMediaThumbnailEntry(
    await args.db.get(THUMBNAILS_STORE, `scenario:${args.entry.id}`)
  );
  const projectThumbnail = storedProjectThumbnail
    ? encodePortableThumbnail(
        storedProjectThumbnail,
        collector.addObject(
          storedProjectThumbnail.blob,
          `${args.entry.id}-thumbnail`,
          storedProjectThumbnail.blob.type || 'image/png'
        )
      )
    : undefined;
  const presentation = await buildPortableAggregatePresentation({
    addObject: collector.addObject,
    aggregateId: args.entry.id,
    aggregateKind: 'scenario',
    db: args.db,
  });
  const metadata: PortableScenarioProjectMetadata = {
    assets,
    entry: encodePortableScenarioProjectEntry(projectScenarioPrivacy(args.entry, args.options)),
    exportThumbnails,
    exports,
    stepDocuments,
    ...(projectThumbnail ? { thumbnail: projectThumbnail } : {}),
    ...(presentation ? { presentation } : {}),
  };
  return {
    descriptor: {
      metadataPath: `${METADATA_ROOT}/scenario-projects/${encodeURIComponent(args.entry.id)}.json`,
      objectCount: collector.objects.length,
      rootId: args.entry.id,
      rootKind: 'scenario-project',
      totalBytes: collector.objects.reduce((sum, object) => sum + object.ref.size, 0),
    },
    load: async () => ({ metadata: metadata as unknown as JsonValue, objects: collector.objects }),
    summary: {
      draftCount: args.entry.lifecycle?.storageClass === 'temporary' ? 1 : 0,
      recordingCount: 0,
      sourceMetadataCount: 0,
      telemetryCount: 0,
      thumbnailCount:
        exportThumbnails.length +
        (projectThumbnail ? 1 : 0) +
        (presentation ? 1 + (presentation.previewObjectId ? 1 : 0) : 0),
      webSnapshotCount: 0,
    },
  };
}

export async function buildScenarioProjectRootInventory(args: {
  db: InventoryDatabase;
  options: MediaHubBackupExportOptions;
  paths: ArchivePathAllocator;
}): Promise<MediaHubBackupRootInventoryItem[]> {
  const projects = readSelectedScenarioProjects(
    await args.db.getAll(SCENARIO_PROJECTS_STORE),
    args.options
  );
  const roots: MediaHubBackupRootInventoryItem[] = [];
  for (const [index, entry] of projects.entries()) {
    roots.push(await buildScenarioProjectRoot({ ...args, entry, index }));
  }
  return roots;
}
