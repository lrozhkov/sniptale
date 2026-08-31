import {
  appendCommittedArchiveRootInTransaction,
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  readAssetFile,
} from '../../../../composition/persistence/assets';
import { parseMediaThumbnailEntry } from '../../../../composition/persistence/media-library/read-guards';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  THUMBNAILS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../../../../composition/persistence/infrastructure/indexed-db/mutation';
import { putScenarioProjectBackupRestore } from '../../../../composition/persistence/scenario/backup-restore';
import {
  parseScenarioAssetEntry,
  parseScenarioExportEntry,
  parseScenarioProjectEntry,
} from '../../../../composition/persistence/scenario/read-guards';
import { parseScenarioStepEditorDocumentEntry } from '../../../../composition/persistence/scenario/editor-documents';
import { isScenarioProjectV3 } from '../../../../features/scenario/project/v3';
import { decodePortableEditorDocument } from '../root-codecs/editor-document';
import { parsePortableScenarioProjectMetadata } from '../root-codecs/projects';
import type { ArchiveRootPublisher } from '../restore';
import type { StagedArchiveObject } from '../staging';
import { rebaseTemporaryLifecycle } from '../restore-lifecycle';
import { preparePortableAggregatePresentation } from './presentation';

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

function decodeAndRemapV3Project(args: {
  assetIds: ReadonlyMap<string, string>;
  project: unknown;
  projectId: string;
  stepIds: ReadonlyMap<string, string>;
}) {
  if (!isRecord(args.project)) {
    throw new Error('Portable scenario project is invalid.');
  }
  const slides = args.project['slides'];
  const trash = args.project['trash'];
  if (!Array.isArray(slides) || !Array.isArray(trash)) {
    throw new Error('Portable scenario project is invalid.');
  }
  const decodeSlide = (raw: unknown) => {
    if (!isRecord(raw) || !Array.isArray(raw['elements']) || !isRecord(raw['source'])) {
      throw new Error('Portable scenario slide is invalid.');
    }
    const source = raw['source'];
    const elements: unknown[] = raw['elements'];
    return {
      ...raw,
      elements: elements.map((value) => {
        if (!isRecord(value) || value['kind'] !== 'image') return value;
        const rawRef = value['assetRef'];
        if (!isRecord(rawRef)) throw new Error('Portable scenario image reference is invalid.');
        const portableId = rawRef['scenarioAssetId'];
        if (!(typeof portableId === 'string' || portableId === null))
          throw new Error('Portable scenario asset ID is invalid.');
        const { scenarioAssetId: _portableId, ...rest } = rawRef;
        return {
          ...value,
          assetRef: {
            ...rest,
            assetId: portableId ? (args.assetIds.get(portableId) ?? portableId) : portableId,
          },
          editDocumentId:
            typeof value['editDocumentId'] === 'string'
              ? (args.stepIds.get(value['editDocumentId']) ?? value['editDocumentId'])
              : value['editDocumentId'],
        };
      }),
      source:
        source['kind'] === 'capture'
          ? (() => {
              const portableId = source['scenarioAssetId'];
              if (typeof portableId !== 'string')
                throw new Error('Portable scenario capture asset ID is invalid.');
              const { scenarioAssetId: _portableId, ...rest } = source;
              return { ...rest, assetId: args.assetIds.get(portableId) ?? portableId };
            })()
          : source,
    };
  };
  const decoded = {
    ...args.project,
    id: args.projectId,
    slides: slides.map(decodeSlide),
    trash: trash.map((item) => {
      if (!isRecord(item)) throw new Error('Portable scenario trash item is invalid.');
      const slide = item['slide'];
      if (!isRecord(slide)) throw new Error('Portable scenario trash slide is invalid.');
      return { ...item, slide: decodeSlide(slide) };
    }),
  };
  if (!isScenarioProjectV3(decoded)) throw new Error('Restored scenario project is invalid.');
  return decoded;
}

export const scenarioProjectRootPublisher: ArchiveRootPublisher = {
  profile: 'scenario-project',
  async checkpointSkipIfExisting({ envelope, session }) {
    const metadata = parsePortableScenarioProjectMetadata(envelope.metadata);
    return runWithIndexedDbMutation(async (db) => {
      const tx = db.transaction([SCENARIO_PROJECTS_STORE, ASSET_OPERATIONS_STORE], 'readwrite');
      if (!(await tx.objectStore(SCENARIO_PROJECTS_STORE).get(metadata.entry.id))) {
        await tx.done;
        return false;
      }
      await appendCommittedArchiveRootInTransaction(
        tx.objectStore(ASSET_OPERATIONS_STORE),
        session.operationId,
        `scenario-project:${envelope.descriptor.rootId}`,
        metadata.entry.id,
        false,
        true
      );
      await tx.done;
      return true;
    });
  },
  async publish({ envelope, session, staged }) {
    const metadata = parsePortableScenarioProjectMetadata(envelope.metadata);
    const sourceExists = await runWithIndexedDbMutation(async (db) =>
      Boolean(await db.get(SCENARIO_PROJECTS_STORE, metadata.entry.id))
    );
    const targetProjectId =
      session.strategy === 'duplicate' && sourceExists ? newId() : metadata.entry.id;
    const rootKey = `scenario-project:${envelope.descriptor.rootId}`;
    const objects = new Map(staged.map((object) => [object.objectId, object]));
    const assetIds = new Map(
      metadata.assets.map((asset) => [
        asset.entry.id,
        session.strategy === 'duplicate' ? newId() : asset.entry.id,
      ])
    );
    const exportIds = new Map(
      metadata.exports.map((entry) => [
        entry.id,
        session.strategy === 'duplicate' ? newId() : entry.id,
      ])
    );
    const stepIds = new Map(
      metadata.stepDocuments.map((entry) => [
        entry.stepId,
        session.strategy === 'duplicate' ? newId() : entry.stepId,
      ])
    );
    const project = decodeAndRemapV3Project({
      assetIds,
      project: metadata.entry.project,
      projectId: targetProjectId,
      stepIds,
    });
    const entry = parseScenarioProjectEntry({
      ...rebaseTemporaryLifecycle(metadata.entry),
      id: targetProjectId,
      project,
    });
    if (!entry) throw new Error('Restored scenario project metadata is invalid.');
    const assets = metadata.assets.map((item) => {
      const object = required(objects, item.objectId);
      const galleryAssetId = item.entry.galleryAssetId
        ? (session.rootIdMap[`media:library-item:${item.entry.galleryAssetId}`] ??
          item.entry.galleryAssetId)
        : null;
      const asset = parseScenarioAssetEntry({
        ...item.entry,
        assetId: object.ref.assetId,
        id: assetIds.get(item.entry.id),
        projectId: targetProjectId,
        galleryAssetId,
        mimeType: object.ref.mimeType,
        size: object.ref.size,
      });
      if (!asset) throw new Error('Restored scenario asset metadata is invalid.');
      return { entry: asset, ref: object.ref };
    });
    const exports = metadata.exports.map((item) => {
      const entry = parseScenarioExportEntry({
        ...item,
        id: exportIds.get(item.id),
        projectId: targetProjectId,
      });
      if (!entry) throw new Error('Restored scenario export metadata is invalid.');
      return entry;
    });
    const stepDocuments = metadata.stepDocuments.map((item) => {
      const refsByObjectId = new Map(
        item.document.assets.map(({ objectId }) => [objectId, required(objects, objectId).ref])
      );
      const document = decodePortableEditorDocument({
        document: item.document,
        assetsByObjectId: new Map([...refsByObjectId].map(([id, ref]) => [id, ref.assetId])),
      });
      const entry = parseScenarioStepEditorDocumentEntry({
        ...item,
        stepId: stepIds.get(item.stepId),
        projectId: targetProjectId,
        document,
      });
      if (!entry) throw new Error('Restored scenario editor document is invalid.');
      return {
        entry,
        refs: [...new Map([...refsByObjectId.values()].map((ref) => [ref.assetId, ref])).values()],
      };
    });
    const exportThumbnails = await Promise.all(
      metadata.exportThumbnails.map(async ({ exportId, thumbnail }) => {
        const targetId = exportIds.get(exportId);
        const parsed = parseMediaThumbnailEntry({
          ...thumbnail,
          assetId: `scenario-export:${targetId}`,
          blob: await readAssetFile(
            required(objects, thumbnail.objectId).ref,
            `${targetId}-thumbnail`
          ),
        });
        if (!parsed) throw new Error('Restored scenario export thumbnail is invalid.');
        return parsed;
      })
    );
    const thumbnail = metadata.thumbnail
      ? parseMediaThumbnailEntry({
          ...metadata.thumbnail,
          assetId: `scenario:${targetProjectId}`,
          blob: await readAssetFile(
            required(objects, metadata.thumbnail.objectId).ref,
            `${targetProjectId}-thumbnail`
          ),
        })
      : null;
    if (metadata.thumbnail && !thumbnail)
      throw new Error('Restored scenario project thumbnail is invalid.');
    const presentation = await preparePortableAggregatePresentation({
      getObjectRef: (objectId) => required(objects, objectId).ref,
      invalidMessage: 'Restored scenario presentation is invalid.',
      metadata: metadata.presentation,
      targetId: targetProjectId,
    });
    const operation = buildPhysicalDeleteOperation([]);
    let conflicted = false;
    let imported = false;
    await runWithIndexedDbMutation(async (db) => {
      const tx = db.transaction(
        [
          SCENARIO_PROJECTS_STORE,
          SCENARIO_ASSETS_STORE,
          SCENARIO_EXPORTS_STORE,
          SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
          THUMBNAILS_STORE,
          AGGREGATE_PRESENTATIONS_STORE,
          ASSET_REFS_STORE,
          ASSET_OWNERS_STORE,
          ASSET_OPERATIONS_STORE,
        ],
        'readwrite'
      );
      const restored = await putScenarioProjectBackupRestore({
        operation,
        root: {
          assets,
          entry,
          exportThumbnails,
          exports,
          stepDocuments,
          ...(thumbnail ? { thumbnail } : {}),
          ...(presentation ? { presentation } : {}),
        },
        stores: {
          assets: tx.objectStore(SCENARIO_ASSETS_STORE),
          exports: tx.objectStore(SCENARIO_EXPORTS_STORE),
          operations: tx.objectStore(ASSET_OPERATIONS_STORE),
          owners: tx.objectStore(ASSET_OWNERS_STORE),
          presentations: tx.objectStore(AGGREGATE_PRESENTATIONS_STORE),
          projects: tx.objectStore(SCENARIO_PROJECTS_STORE),
          refs: tx.objectStore(ASSET_REFS_STORE),
          stepDocuments: tx.objectStore(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE),
          thumbnails: tx.objectStore(THUMBNAILS_STORE),
        },
        strategy: session.strategy,
      });
      if (operation.assetIds.length > 0)
        await tx.objectStore(ASSET_OPERATIONS_STORE).put(operation);
      await appendCommittedArchiveRootInTransaction(
        tx.objectStore(ASSET_OPERATIONS_STORE),
        session.operationId,
        rootKey,
        targetProjectId,
        restored.imported,
        restored.conflicted
      );
      await tx.done;
      imported = restored.imported;
      conflicted = restored.conflicted;
    });
    if (operation.assetIds.length > 0)
      await completePhysicalDeleteOperation(operation).catch(() => undefined);
    return {
      conflicted,
      imported,
      retainedAssetIds: [
        ...(imported ? assets.map((asset) => asset.ref.assetId) : []),
        ...(imported
          ? stepDocuments.flatMap((document) => document.refs.map((ref) => ref.assetId))
          : []),
      ],
    };
  },
};
