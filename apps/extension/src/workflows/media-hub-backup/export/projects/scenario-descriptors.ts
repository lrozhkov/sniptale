import type JSZip from 'jszip';
import {
  SCENARIO_ASSETS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  THUMBNAILS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import type { MediaThumbnailEntry } from '../../../../composition/persistence/media-library/contracts';
import type {
  ScenarioExportEntry,
  ScenarioStepEditorDocumentEntry,
} from '../../../../composition/persistence/scenario/contracts';
import type { initDB } from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { parseDbEntries } from '../../../../composition/persistence/infrastructure/indexed-db/read-primitives';
import {
  parseScenarioAssetEntry,
  parseScenarioProjectEntry,
} from '../../../../composition/persistence/scenario/read-guards';
import { assertBackupExportNotCancelled, type BackupExportBudget } from '../blob/budget';
import { createBackupBlobDescriptor } from '../blob/descriptor';
import { shouldExportScenarioProject } from '../filters';
import {
  applyScenarioProjectPrivacyOptions,
  applyScenarioStepDocumentPrivacyOptions,
} from '../privacy';
import { normalizeScenarioProject } from '../../metadata/projects';
import { safeBackupPathSegment } from '../../metadata/path-segments';
import { assertSupportedScenarioBackupProjectEntry } from '../../metadata/scenario-project-version';
import type {
  MediaHubBackupExportOptions,
  ScenarioBackupProjectDescriptor,
} from '../../contracts/types';

type ExportDatabase = Awaited<ReturnType<typeof initDB>>;

export async function buildScenarioProjectDescriptors(
  db: ExportDatabase,
  zip: JSZip,
  budget: BackupExportBudget,
  options: MediaHubBackupExportOptions,
  signal?: AbortSignal | undefined
): Promise<ScenarioBackupProjectDescriptor[]> {
  assertBackupExportNotCancelled(signal);
  const projects = parseDbEntries(
    await db.getAll(SCENARIO_PROJECTS_STORE),
    parseScenarioProjectEntry
  ).filter((entry) => shouldExportScenarioProject(entry, options));
  assertBackupExportNotCancelled(signal);
  const descriptors: ScenarioBackupProjectDescriptor[] = [];

  for (const entry of projects) {
    assertBackupExportNotCancelled(signal);
    descriptors.push(await buildScenarioProjectDescriptor(db, zip, budget, entry, options, signal));
  }

  return descriptors;
}

async function buildScenarioProjectDescriptor(
  db: ExportDatabase,
  zip: JSZip,
  budget: BackupExportBudget,
  entry: NonNullable<ReturnType<typeof parseScenarioProjectEntry>>,
  options: MediaHubBackupExportOptions,
  signal: AbortSignal | undefined
): Promise<ScenarioBackupProjectDescriptor> {
  assertSupportedScenarioBackupProjectEntry(entry);
  const projectSegment = safeBackupPathSegment(entry.id, 'scenario project id');
  const [assets, exports, stepDocuments, thumbnail] = await loadScenarioProjectBundle(
    db,
    entry.id,
    signal
  );
  const exportThumbnails = await buildScenarioThumbs(db, zip, budget, entry.id, exports, signal);
  assertBackupExportNotCancelled(signal);

  return normalizeScenarioProject({
    assets: assets.map((asset) =>
      createBackupBlobDescriptor(
        zip,
        budget,
        `scenario-projects/${projectSegment}/assets/${safeBackupPathSegment(asset.id, 'scenario asset id')}`,
        asset,
        signal
      )
    ),
    entry: applyScenarioProjectPrivacyOptions(entry, options),
    exports,
    stepDocuments: buildScenarioStepDocuments(stepDocuments, options),
    ...(thumbnail
      ? {
          thumbnail: createBackupBlobDescriptor(
            zip,
            budget,
            `scenario-projects/${projectSegment}/thumbnail`,
            thumbnail,
            signal
          ),
        }
      : {}),
    exportThumbnails,
  });
}

function buildScenarioStepDocuments(
  stepDocuments: ScenarioStepEditorDocumentEntry[],
  options: MediaHubBackupExportOptions
): ScenarioStepEditorDocumentEntry[] {
  return options.includeEditorDrafts
    ? stepDocuments.map((document) => applyScenarioStepDocumentPrivacyOptions(document, options))
    : [];
}

async function loadScenarioProjectBundle(
  db: ExportDatabase,
  projectId: string,
  signal: AbortSignal | undefined
) {
  assertBackupExportNotCancelled(signal);
  const rawAssets = await db.getAllFromIndex(SCENARIO_ASSETS_STORE, 'projectId', projectId);
  const assets = parseDbEntries(rawAssets, parseScenarioAssetEntry);
  if (assets.length !== rawAssets.length) {
    throw new Error('Invalid scenario asset backup metadata.');
  }
  assertBackupExportNotCancelled(signal);
  const exports = (await db.getAllFromIndex(
    SCENARIO_EXPORTS_STORE,
    'projectId',
    projectId
  )) as ScenarioExportEntry[];
  assertBackupExportNotCancelled(signal);
  const stepDocuments = (await db.getAllFromIndex(
    SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
    'projectId',
    projectId
  )) as ScenarioStepEditorDocumentEntry[];
  assertBackupExportNotCancelled(signal);
  const thumbnail = (await db.get(THUMBNAILS_STORE, `scenario:${projectId}`)) as
    | MediaThumbnailEntry
    | undefined;
  assertBackupExportNotCancelled(signal);

  return [assets, exports, stepDocuments, thumbnail] as const;
}

async function buildScenarioThumbs(
  db: ExportDatabase,
  zip: JSZip,
  budget: BackupExportBudget,
  projectId: string,
  exports: ScenarioExportEntry[],
  signal: AbortSignal | undefined
) {
  const projectSegment = safeBackupPathSegment(projectId, 'scenario project id');
  const exportThumbnails: ScenarioBackupProjectDescriptor['exportThumbnails'] = [];
  for (const exportEntry of exports) {
    assertBackupExportNotCancelled(signal);
    const exportSegment = safeBackupPathSegment(exportEntry.id, 'scenario export id');
    const thumb = (await db.get(THUMBNAILS_STORE, `scenario-export:${exportEntry.id}`)) as
      | MediaThumbnailEntry
      | undefined;
    assertBackupExportNotCancelled(signal);
    if (!thumb) {
      continue;
    }

    exportThumbnails.push(
      createBackupBlobDescriptor(
        zip,
        budget,
        `scenario-projects/${projectSegment}/exports/${exportSegment}.thumb`,
        thumb,
        signal
      )
    );
  }

  return exportThumbnails;
}
