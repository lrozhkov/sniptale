import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import { GUIDE_LIMITS } from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  buildPhysicalDeleteOperation,
  readAssetFile,
  type ArchiveRestoreSession,
} from '../../../../composition/persistence/assets';
import { parseMediaThumbnailEntry } from '../../../../composition/persistence/media-library/read-guards';
import type { putScenarioProjectBackupRestore } from '../../../../composition/persistence/scenario/backup-restore';
import { parseScenarioStepEditorDocumentEntry } from '../../../../composition/persistence/scenario/editor-documents';
import {
  parseScenarioAssetEntry,
  parseScenarioExportEntry,
  parseScenarioProjectEntry,
} from '../../../../composition/persistence/scenario/read-guards';
import { rebaseTemporaryLifecycle } from '../restore-lifecycle';
import type { StagedArchiveObject } from '../staging';
import { decodePortableEditorDocument } from '../root-codecs/editor-document';
import {
  decodePortableScenarioHistory,
  MAX_PORTABLE_SCENARIO_HISTORY_BYTES,
  type PortableScenarioProjectMetadata,
} from '../root-codecs/projects';
import { decodePortableTour } from '../root-codecs/scenario-tour';
import { preparePortableAggregatePresentation } from './presentation';

type ScenarioRestoreRoot = Parameters<typeof putScenarioProjectBackupRestore>[0]['root'];

export interface PreparedScenarioPublication {
  assetIds: ReadonlyMap<string, string>;
  metadata: PortableScenarioProjectMetadata;
  operation: ReturnType<typeof buildPhysicalDeleteOperation>;
  root: ScenarioRestoreRoot;
  rootKey: string;
  targetProjectId: string;
}

function newId() {
  if (typeof crypto.randomUUID !== 'function')
    throw new Error('Secure restore IDs are unavailable.');
  return crypto.randomUUID();
}

function required(objects: ReadonlyMap<string, StagedArchiveObject>, objectId: string) {
  const object = objects.get(objectId);
  if (!object) throw new Error(`Scenario project archive object is missing: ${objectId}.`);
  return object;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function restoreIds(sourceIds: readonly string[], duplicate: boolean): Map<string, string> {
  return new Map(sourceIds.map((sourceId) => [sourceId, duplicate ? newId() : sourceId]));
}

function decodeGuideProject(args: {
  assetIds: ReadonlyMap<string, string>;
  project: unknown;
  projectId: string;
  rootIdMap: Readonly<Record<string, string>>;
  stepIds: ReadonlyMap<string, string>;
}) {
  if (
    !isRecord(args.project) ||
    args.project['version'] !== 4 ||
    !Array.isArray(args.project['items']) ||
    args.project['items'].length > GUIDE_LIMITS.maxItems
  ) {
    throw new Error('Portable guide format is invalid or unsupported.');
  }
  const items: unknown[] = args.project['items'];
  const decoded = {
    ...args.project,
    ...(args.project['tour'] === undefined
      ? {}
      : {
          tour: decodePortableTour(args.project['tour'], {
            assetIds: args.assetIds,
            documentIds: args.stepIds,
            rootIdMap: args.rootIdMap,
          }),
        }),
    id: args.projectId,
    items: items.map((item) => remapGuideItem(item, args)),
  };
  const parsed = parseGuideProject(decoded);
  if (parsed.status !== 'ok') throw new Error('Restored guide project is invalid.');
  return parsed.project;
}

function remapGuideItem(
  item: unknown,
  ids: Pick<Parameters<typeof decodeGuideProject>[0], 'assetIds' | 'rootIdMap' | 'stepIds'>
) {
  if (!isRecord(item) || item['kind'] !== 'step') return item;
  if (!Array.isArray(item['blocks']) || item['blocks'].length > GUIDE_LIMITS.maxBlocksPerStep) {
    throw new Error('Portable guide blocks are invalid.');
  }
  const blocks: unknown[] = item['blocks'];
  return { ...item, blocks: blocks.map((block) => remapGuideBlock(block, ids)) };
}

function remapGuideBlock(
  block: unknown,
  ids: Pick<Parameters<typeof decodeGuideProject>[0], 'assetIds' | 'rootIdMap' | 'stepIds'>
) {
  if (!isRecord(block) || block['kind'] !== 'image') return block;
  const { scenarioAssetId, ...rest } = block;
  if (typeof scenarioAssetId !== 'string' || 'assetId' in rest) {
    throw new Error('Portable guide image reference is invalid.');
  }
  const assetId = ids.assetIds.get(scenarioAssetId);
  if (!assetId) throw new Error('Portable guide image is missing.');
  const sourceDocumentId = rest['editDocumentId'];
  const editDocumentId =
    sourceDocumentId === null
      ? null
      : typeof sourceDocumentId === 'string'
        ? ids.stepIds.get(sourceDocumentId)
        : undefined;
  if (editDocumentId === undefined) throw new Error('Portable guide edit document is missing.');
  const galleryAssetId =
    typeof rest['galleryAssetId'] === 'string'
      ? (ids.rootIdMap[`media:library-item:${rest['galleryAssetId']}`] ?? null)
      : null;
  return { ...rest, assetId, editDocumentId, galleryAssetId };
}

async function readSavedHistory(object: StagedArchiveObject, projectId: string) {
  if (object.ref.size > MAX_PORTABLE_SCENARIO_HISTORY_BYTES) {
    throw new Error('Portable guide history exceeds the metadata limit.');
  }
  const file = await readAssetFile(object.ref, 'saved-versions.json');
  if (file.size > MAX_PORTABLE_SCENARIO_HISTORY_BYTES) {
    throw new Error('Portable guide history exceeds the metadata limit.');
  }
  const value: unknown = JSON.parse(await file.text());
  return decodePortableScenarioHistory(value, projectId);
}

async function prepareScenarioEntry(args: {
  assetIds: ReadonlyMap<string, string>;
  metadata: PortableScenarioProjectMetadata;
  objects: ReadonlyMap<string, StagedArchiveObject>;
  rootIdMap: Readonly<Record<string, string>>;
  stepIds: ReadonlyMap<string, string>;
  targetProjectId: string;
}) {
  const portableHistory = args.metadata.historyObjectId
    ? await readSavedHistory(
        required(args.objects, args.metadata.historyObjectId),
        args.metadata.entry.id
      )
    : [];
  const decode = (project: unknown) =>
    decodeGuideProject({
      assetIds: args.assetIds,
      project,
      projectId: args.targetProjectId,
      rootIdMap: args.rootIdMap,
      stepIds: args.stepIds,
    });
  const entry = parseScenarioProjectEntry({
    ...rebaseTemporaryLifecycle(args.metadata.entry),
    id: args.targetProjectId,
    project: decode(args.metadata.entry.project),
    ...(portableHistory.length
      ? {
          history: portableHistory.map((version) => ({
            ...version,
            project: decode(version.project),
          })),
        }
      : {}),
  });
  if (!entry) throw new Error('Restored scenario project metadata is invalid.');
  return entry;
}

function prepareScenarioAssets(args: {
  assetIds: ReadonlyMap<string, string>;
  metadata: PortableScenarioProjectMetadata;
  objects: ReadonlyMap<string, StagedArchiveObject>;
  rootIdMap: Readonly<Record<string, string>>;
  targetProjectId: string;
}) {
  return args.metadata.assets.map((item) => {
    const object = required(args.objects, item.objectId);
    const galleryAssetId = item.entry.galleryAssetId
      ? (args.rootIdMap[`media:library-item:${item.entry.galleryAssetId}`] ?? null)
      : null;
    const entry = parseScenarioAssetEntry({
      ...item.entry,
      assetId: object.ref.assetId,
      galleryAssetId,
      id: args.assetIds.get(item.entry.id),
      mimeType: object.ref.mimeType,
      projectId: args.targetProjectId,
      size: object.ref.size,
    });
    if (!entry) throw new Error('Restored scenario asset metadata is invalid.');
    return { entry, ref: object.ref };
  });
}

function prepareScenarioExports(
  metadata: PortableScenarioProjectMetadata,
  exportIds: ReadonlyMap<string, string>,
  targetProjectId: string
) {
  return metadata.exports.map((item) => {
    const entry = parseScenarioExportEntry({
      ...item,
      id: exportIds.get(item.id),
      projectId: targetProjectId,
    });
    if (!entry) throw new Error('Restored scenario export metadata is invalid.');
    return entry;
  });
}

function prepareScenarioStepDocuments(args: {
  metadata: PortableScenarioProjectMetadata;
  objects: ReadonlyMap<string, StagedArchiveObject>;
  stepIds: ReadonlyMap<string, string>;
  targetProjectId: string;
}) {
  return args.metadata.stepDocuments.map((item) => {
    const refsByObjectId = new Map(
      item.document.assets.map(({ objectId }) => [objectId, required(args.objects, objectId).ref])
    );
    const document = decodePortableEditorDocument({
      assetsByObjectId: new Map([...refsByObjectId].map(([id, ref]) => [id, ref.assetId])),
      document: item.document,
    });
    const entry = parseScenarioStepEditorDocumentEntry({
      ...item,
      document,
      projectId: args.targetProjectId,
      stepId: args.stepIds.get(item.stepId),
    });
    if (!entry) throw new Error('Restored scenario editor document is invalid.');
    return {
      entry,
      refs: [...new Map([...refsByObjectId.values()].map((ref) => [ref.assetId, ref])).values()],
    };
  });
}

async function prepareScenarioSidecars(args: {
  exportIds: ReadonlyMap<string, string>;
  metadata: PortableScenarioProjectMetadata;
  objects: ReadonlyMap<string, StagedArchiveObject>;
  targetProjectId: string;
}) {
  const exportThumbnails = await Promise.all(
    args.metadata.exportThumbnails.map(async ({ exportId, thumbnail }) => {
      const targetId = args.exportIds.get(exportId);
      const parsed = parseMediaThumbnailEntry({
        ...thumbnail,
        assetId: `scenario-export:${targetId}`,
        blob: await readAssetFile(
          required(args.objects, thumbnail.objectId).ref,
          `${targetId}-thumbnail`
        ),
      });
      if (!parsed) throw new Error('Restored scenario export thumbnail is invalid.');
      return parsed;
    })
  );
  const thumbnail = args.metadata.thumbnail
    ? parseMediaThumbnailEntry({
        ...args.metadata.thumbnail,
        assetId: `scenario:${args.targetProjectId}`,
        blob: await readAssetFile(
          required(args.objects, args.metadata.thumbnail.objectId).ref,
          `${args.targetProjectId}-thumbnail`
        ),
      })
    : null;
  if (args.metadata.thumbnail && !thumbnail) {
    throw new Error('Restored scenario project thumbnail is invalid.');
  }
  const presentation = await preparePortableAggregatePresentation({
    getObjectRef: (objectId) => required(args.objects, objectId).ref,
    invalidMessage: 'Restored scenario presentation is invalid.',
    metadata: args.metadata.presentation,
    targetId: args.targetProjectId,
  });
  return { exportThumbnails, presentation, thumbnail };
}

export async function prepareScenarioProjectPublication(args: {
  metadata: PortableScenarioProjectMetadata;
  rootId: string;
  session: ArchiveRestoreSession;
  sourceExists: boolean;
  staged: StagedArchiveObject[];
}): Promise<PreparedScenarioPublication> {
  const duplicate = args.session.strategy === 'duplicate';
  const targetProjectId = duplicate && args.sourceExists ? newId() : args.metadata.entry.id;
  const objects = new Map(args.staged.map((object) => [object.objectId, object]));
  const assetIds = restoreIds(
    args.metadata.assets.map((asset) => asset.entry.id),
    duplicate
  );
  const exportIds = restoreIds(
    args.metadata.exports.map((entry) => entry.id),
    duplicate
  );
  const stepIds = restoreIds(
    args.metadata.stepDocuments.map((entry) => entry.stepId),
    duplicate
  );
  const shared = { metadata: args.metadata, objects, targetProjectId };
  const entry = await prepareScenarioEntry({
    ...shared,
    assetIds,
    rootIdMap: args.session.rootIdMap,
    stepIds,
  });
  const assets = prepareScenarioAssets({
    ...shared,
    assetIds,
    rootIdMap: args.session.rootIdMap,
  });
  const exports = prepareScenarioExports(args.metadata, exportIds, targetProjectId);
  const stepDocuments = prepareScenarioStepDocuments({ ...shared, stepIds });
  const sidecars = await prepareScenarioSidecars({ ...shared, exportIds });
  return {
    assetIds,
    metadata: args.metadata,
    operation: buildPhysicalDeleteOperation([]),
    root: {
      assets,
      entry,
      exportThumbnails: sidecars.exportThumbnails,
      exports,
      stepDocuments,
      ...(sidecars.thumbnail ? { thumbnail: sidecars.thumbnail } : {}),
      ...(sidecars.presentation ? { presentation: sidecars.presentation } : {}),
    },
    rootKey: `scenario-project:${args.rootId}`,
    targetProjectId,
  };
}
