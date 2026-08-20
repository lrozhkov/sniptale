import { parseAggregatePresentationEntry } from '../../../../composition/persistence/aggregate-presentations/parser';
import { createAggregatePresentationKey } from '../../../../composition/persistence/aggregate-presentations/contracts';
import { parseMediaThumbnailEntry } from '../../../../composition/persistence/media-library/read-guards';
import {
  AGGREGATE_PRESENTATIONS_STORE,
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
import type { ScenarioProjectEntry } from '../../../../composition/persistence/scenario/contracts';
import { parseScenarioStepEditorDocumentEntry } from '../../../../composition/persistence/scenario/editor-documents';
import { encodePortableEditorDocument } from '../root-codecs/editor-document';
import { encodePortablePresentation, encodePortableThumbnail } from '../root-codecs/media';
import {
  encodePortableScenarioProjectEntry,
  type PortableScenarioProjectMetadata,
} from '../root-codecs/projects';
import { projectScenarioPrivacy, projectStoredEditorDocumentPrivacy } from '../privacy';
import type { JsonValue, MediaHubBackupExportOptions } from '../contracts';
import type { MediaHubBackupRootInventoryItem } from '../export';
import { createObjectCollector, readInventoryAssetFile, type InventoryDatabase } from './helpers';

function readSelectedScenarioProjects(
  rows: unknown[],
  options: MediaHubBackupExportOptions
): ScenarioProjectEntry[] {
  return rows
    .map(parseScenarioProjectEntry)
    .filter((entry): entry is NonNullable<typeof entry> =>
      Boolean(
        entry &&
        entry.lifecycle?.storageClass !== 'temporary' &&
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
  for (const raw of await db.getAllFromIndex(SCENARIO_ASSETS_STORE, 'projectId', entry.id)) {
    const asset = parseScenarioAssetEntry(raw);
    if (!asset) throw new Error('Stored scenario asset is invalid and cannot be exported.');
    const file = await readInventoryAssetFile(db, asset.assetId, asset.id);
    const { assetId: _assetId, ...portable } = asset;
    assets.push({
      entry: portable,
      objectId: collector.addObject(file, file.name || asset.id, asset.mimeType),
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
}): Promise<MediaHubBackupRootInventoryItem> {
  const collector = createObjectCollector(`scenario-${String(args.index + 1).padStart(6, '0')}`);
  const assets = await buildScenarioAssets(args.db, args.entry, collector);
  const exports = (
    await args.db.getAllFromIndex(SCENARIO_EXPORTS_STORE, 'projectId', args.entry.id)
  )
    .map(parseScenarioExportEntry)
    .filter((value): value is NonNullable<typeof value> => value !== null);
  const [stepDocuments, exportThumbnails] = await Promise.all([
    buildScenarioDocuments(args.db, args.entry, collector, args.options),
    buildScenarioExportThumbnails(args.db, exports, collector),
  ]);
  const projectThumbnail = parseMediaThumbnailEntry(
    await args.db.get(THUMBNAILS_STORE, `scenario:${args.entry.id}`)
  );
  const presentation = parseAggregatePresentationEntry(
    await args.db.get(
      AGGREGATE_PRESENTATIONS_STORE,
      createAggregatePresentationKey({ id: args.entry.id, kind: 'scenario' })
    )
  );
  const metadata: PortableScenarioProjectMetadata = {
    assets,
    entry: encodePortableScenarioProjectEntry(projectScenarioPrivacy(args.entry, args.options)),
    exportThumbnails,
    exports,
    stepDocuments,
    ...(projectThumbnail
      ? {
          thumbnail: encodePortableThumbnail(
            projectThumbnail,
            collector.addObject(
              projectThumbnail.blob,
              `${args.entry.id}-thumbnail`,
              projectThumbnail.blob.type || 'image/png'
            )
          ),
        }
      : {}),
    ...(presentation
      ? {
          presentation: encodePortablePresentation({
            entry: presentation,
            ...(presentation.previewBlob
              ? {
                  previewObjectId: collector.addObject(
                    presentation.previewBlob,
                    `${args.entry.id}-preview`,
                    presentation.previewBlob.type || 'image/png'
                  ),
                }
              : {}),
            thumbnailObjectId: collector.addObject(
              presentation.thumbnailBlob,
              `${args.entry.id}-presentation-thumbnail`,
              presentation.thumbnailBlob.type || 'image/png'
            ),
          }),
        }
      : {}),
  };
  return {
    descriptor: {
      metadataPath: `metadata/scenario-projects/${encodeURIComponent(args.entry.id)}.json`,
      objectCount: collector.objects.length,
      rootId: args.entry.id,
      rootKind: 'scenario-project',
      totalBytes: collector.objects.reduce((sum, object) => sum + object.ref.size, 0),
    },
    load: async () => ({ metadata: metadata as unknown as JsonValue, objects: collector.objects }),
    summary: {
      recordingCount: 0,
      sourceMetadataCount: 0,
      telemetryCount: 0,
      thumbnailCount:
        exportThumbnails.length +
        (projectThumbnail ? 1 : 0) +
        (presentation ? 1 + (presentation.previewBlob ? 1 : 0) : 0),
      webSnapshotCount: 0,
    },
  };
}

export async function buildScenarioProjectRootInventory(args: {
  db: InventoryDatabase;
  options: MediaHubBackupExportOptions;
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
