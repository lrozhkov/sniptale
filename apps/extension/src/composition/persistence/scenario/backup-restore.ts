import type { IDBPTransaction } from 'idb';
import { promoteScenarioSourceLifecycles } from './library-publication';
import type { AggregatePresentationEntry } from '../aggregate-presentations/contracts';
import { detachScenarioVideoAssets } from './video-asset-detachment';
import { MEDIA_LIBRARY_STORE, VIDEO_PROJECTS_STORE } from '../infrastructure/indexed-db/core';
import { parseVideoDependencyEnvelope } from '../media-library/dependencies';
import { parseAssetOwner, parseAssetRef } from '../assets/guards';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { createAggregatePresentationKey } from '../aggregate-presentations/contracts';
import type {
  ArchiveRestoreStrategy,
  AssetOwner,
  AssetRef,
  PhysicalDeleteAssetOperation,
} from '../assets';
import { removeEditorDocumentOwnership } from '../document-assets';
import { createLibraryLifecycle, promoteLibraryLifecycle } from '../library-lifecycle/contracts';
import type { MediaThumbnailEntry } from '../media-library/contracts';
import type {
  ScenarioAssetEntry,
  ScenarioExportEntry,
  ScenarioProjectEntry,
  StoredScenarioStepEditorDocumentEntry,
} from './contracts';
import { parseScenarioAssetEntry, parseScenarioExportEntry } from './read-guards';
import { parseScenarioStepEditorDocumentEntry } from './editor-documents';
import { unlinkScenarioHtmlOwnership } from './export-artifacts';

interface Store<T = unknown> {
  delete(key: IDBValidKey): Promise<unknown>;
  get(key: IDBValidKey): Promise<unknown>;
  put(value: T): Promise<unknown>;
}
interface IndexStore<T = unknown> extends Store<T> {
  index(name: 'projectId'): { getAll(projectId: string): Promise<unknown[]> };
}
interface OwnerStore extends Store<AssetOwner> {
  index(name: 'assetId'): { count(assetId: string): Promise<number> };
}

export interface PreparedScenarioProjectArchiveRoot {
  assets: Array<{ entry: ScenarioAssetEntry; ref: AssetRef }>;
  entry: ScenarioProjectEntry;
  exportThumbnails: MediaThumbnailEntry[];
  exports: ScenarioExportEntry[];
  exportRefs?: AssetRef[];
  presentation?: AggregatePresentationEntry;
  stepDocuments: Array<{ entry: StoredScenarioStepEditorDocumentEntry; refs: AssetRef[] }>;
  thumbnail?: MediaThumbnailEntry;
}

export interface ScenarioBackupRestoreStores {
  assets: IndexStore<ScenarioAssetEntry>;
  exports: IndexStore<ScenarioExportEntry>;
  operations: Store;
  owners: OwnerStore;
  presentations: Store<AggregatePresentationEntry>;
  projects: Store<ScenarioProjectEntry>;
  refs: Store<AssetRef>;
  stepDocuments: IndexStore<StoredScenarioStepEditorDocumentEntry>;
  thumbnails: Store<MediaThumbnailEntry>;
}

async function unlink(args: {
  assetId: string;
  operation: PhysicalDeleteAssetOperation;
  ownerId: string;
  ownerKind: string;
  role: string;
  stores: ScenarioBackupRestoreStores;
}) {
  await args.stores.owners.delete([args.ownerKind, args.ownerId, args.role]);
  if ((await args.stores.owners.index('assetId').count(args.assetId)) === 0) {
    await args.stores.refs.delete(args.assetId);
    args.operation.assetIds.push(args.assetId);
  }
}

async function deleteExisting(args: {
  operation: PhysicalDeleteAssetOperation;
  projectId: string;
  stores: ScenarioBackupRestoreStores;
  tx: IDBPTransaction<unknown, string[], 'readwrite'>;
  replacementAssets?: PreparedScenarioProjectArchiveRoot['assets'];
}) {
  if ((await args.stores.projects.get(args.projectId)) === undefined) return;
  const rawAssets = await args.stores.assets.index('projectId').getAll(args.projectId);
  const assets = rawAssets.map(parseScenarioAssetEntry);
  if (assets.some((asset) => !asset || asset.projectId !== args.projectId))
    throw new Error('Invalid scenario source cannot be replaced safely.');
  const rawDocuments = await args.stores.stepDocuments.index('projectId').getAll(args.projectId);
  const rawExports = await args.stores.exports.index('projectId').getAll(args.projectId);
  if (
    rawDocuments.some((raw) => {
      const entry = parseScenarioStepEditorDocumentEntry(raw);
      return !entry || entry.projectId !== args.projectId;
    }) ||
    rawExports.some((raw) => {
      const entry = parseScenarioExportEntry(raw);
      return !entry || entry.projectId !== args.projectId;
    })
  )
    throw new Error('Invalid scenario children cannot be replaced safely.');
  const retained = new Set<string>();
  if (args.replacementAssets !== undefined) {
    const oldChildren = new Map(
      assets.flatMap((asset) => (asset ? [[asset.id, asset] as const] : []))
    );
    for (const raw of await args.tx.objectStore(VIDEO_PROJECTS_STORE).getAll()) {
      const envelope = parseVideoDependencyEnvelope(raw);
      if (!envelope)
        throw new Error('Scenario replacement cannot check related video project dependencies.');
      for (const source of envelope.sources) {
        if (source.kind !== 'scenario-asset' || !oldChildren.has(source.scenarioAssetId)) continue;
        const current = oldChildren.get(source.scenarioAssetId)!;
        const replacement = args.replacementAssets.find((asset) => asset.entry.id === current.id);
        const entry = replacement && parseScenarioAssetEntry(replacement.entry);
        const currentRef = parseAssetRef(await args.stores.refs.get(current.assetId));
        const replacementRef = replacement && parseAssetRef(replacement.ref);
        const owner = parseAssetOwner(
          await args.stores.owners.get(['scenario-asset', current.id, 'body'])
        );
        if (
          !entry ||
          !currentRef ||
          !replacementRef ||
          JSON.stringify(current) !== JSON.stringify(entry) ||
          JSON.stringify(currentRef) !== JSON.stringify(replacementRef) ||
          !owner ||
          owner.ownerKind !== 'scenario-asset' ||
          owner.ownerId !== current.id ||
          owner.role !== 'body' ||
          owner.assetId !== current.assetId
        )
          throw new Error('Scenario replacement would change a required video project source.');
        retained.add(current.id);
      }
    }
  } else {
    await detachScenarioVideoAssets(
      args.tx,
      args.projectId,
      new Set(assets.flatMap((asset) => (asset ? [asset.id] : []))),
      false
    );
  }
  for (const raw of rawAssets) {
    const asset = parseScenarioAssetEntry(raw);
    if (!asset || retained.has(asset.id)) continue;
    await args.stores.assets.delete(asset.id);
    await unlink({
      assetId: asset.assetId,
      operation: args.operation,
      ownerId: asset.id,
      ownerKind: 'scenario-asset',
      role: 'body',
      stores: args.stores,
    });
  }
  for (const raw of rawDocuments) {
    const document = parseScenarioStepEditorDocumentEntry(raw);
    if (!document) continue;
    await removeEditorDocumentOwnership({
      document: document.document,
      ownerId: document.stepId,
      ownerKind: 'scenario-editor-document',
      physicalDelete: args.operation,
      stores: { owners: args.stores.owners, refs: args.stores.refs },
    });
    await args.stores.stepDocuments.delete(document.stepId);
  }
  for (const raw of rawExports) {
    const entry = parseScenarioExportEntry(raw);
    if (!entry) continue;
    await unlinkScenarioHtmlOwnership(entry.id, args.stores, args.operation);
    await args.stores.exports.delete(entry.id);
    await args.stores.thumbnails.delete(`scenario-export:${entry.id}`);
  }
  await args.stores.thumbnails.delete(`scenario:${args.projectId}`);
  await args.stores.presentations.delete(
    createAggregatePresentationKey({ id: args.projectId, kind: 'scenario' })
  );
  await args.stores.projects.delete(args.projectId);
}

async function hasScenarioChildConflict(args: {
  root: PreparedScenarioProjectArchiveRoot;
  strategy: ArchiveRestoreStrategy;
  stores: ScenarioBackupRestoreStores;
}): Promise<boolean> {
  const checks = [
    ...args.root.assets.map(async (item) => {
      const raw: unknown = await args.stores.assets.get(item.entry.id);
      const current = parseScenarioAssetEntry(raw);
      if (raw !== undefined && !current) throw new Error('Invalid existing scenario asset.');
      if (current && args.strategy === 'replace' && current.projectId !== args.root.entry.id) {
        throw new Error(`Scenario asset belongs to another root: ${item.entry.id}.`);
      }
      return Boolean(current);
    }),
    ...args.root.exports.map(async (item) => {
      const raw: unknown = await args.stores.exports.get(item.id);
      const current = parseScenarioExportEntry(raw);
      if (raw !== undefined && !current) throw new Error('Invalid existing scenario export.');
      if (current && args.strategy === 'replace' && current.projectId !== args.root.entry.id) {
        throw new Error(`Scenario export belongs to another root: ${item.id}.`);
      }
      return Boolean(current);
    }),
    ...args.root.stepDocuments.map(async (item) => {
      const raw: unknown = await args.stores.stepDocuments.get(item.entry.stepId);
      const current = parseScenarioStepEditorDocumentEntry(raw);
      if (raw !== undefined && !current) throw new Error('Invalid existing scenario document.');
      if (current && args.strategy === 'replace' && current.projectId !== args.root.entry.id) {
        throw new Error(`Scenario editor document belongs to another root: ${item.entry.stepId}.`);
      }
      return Boolean(current);
    }),
  ];
  return (await Promise.all(checks)).some(Boolean);
}

async function publishScenarioAssets(
  root: PreparedScenarioProjectArchiveRoot,
  stores: ScenarioBackupRestoreStores
) {
  for (const asset of root.assets) {
    await stores.refs.put(asset.ref);
    await stores.owners.put({
      assetId: asset.ref.assetId,
      ownerId: asset.entry.id,
      ownerKind: 'scenario-asset',
      role: 'body',
    });
    await stores.assets.put(asset.entry);
  }
}

async function publishScenarioDocuments(
  root: PreparedScenarioProjectArchiveRoot,
  stores: ScenarioBackupRestoreStores
) {
  for (const document of root.stepDocuments) {
    for (const asset of document.entry.document.assets) {
      const ref = document.refs.find((candidate) => candidate.assetId === asset.assetId);
      if (!ref) throw new Error(`Scenario editor asset ref is missing: ${asset.assetId}.`);
      await stores.refs.put(ref);
      await stores.owners.put({
        assetId: ref.assetId,
        ownerId: document.entry.stepId,
        ownerKind: 'scenario-editor-document',
        role: asset.role,
      });
    }
    await stores.stepDocuments.put(document.entry);
  }
}

async function publishScenarioSidecars(
  root: PreparedScenarioProjectArchiveRoot,
  stores: ScenarioBackupRestoreStores
) {
  for (const entry of root.exports) {
    if (entry.html) {
      const ref = root.exportRefs?.find((candidate) => candidate.assetId === entry.html?.assetId);
      if (
        !ref ||
        ref.size !== entry.size ||
        !/^text\/html(?:;charset=utf-8)?$/iu.test(ref.mimeType)
      )
        throw new Error('Restored HTML export body is unavailable.');
      await stores.refs.put(ref);
      await stores.owners.put({
        assetId: ref.assetId,
        ownerId: entry.id,
        ownerKind: 'scenario-export',
        role: 'body',
      });
    }
    await stores.exports.put(entry);
  }
  for (const thumbnail of root.exportThumbnails) await stores.thumbnails.put(thumbnail);
  if (root.thumbnail) await stores.thumbnails.put(root.thumbnail);
  if (root.presentation) await stores.presentations.put(root.presentation);
}

export async function putScenarioProjectBackupRestore(args: {
  operation: PhysicalDeleteAssetOperation;
  root: PreparedScenarioProjectArchiveRoot;
  strategy: ArchiveRestoreStrategy;
  stores: ScenarioBackupRestoreStores;
  tx: IDBPTransaction<unknown, string[], 'readwrite'>;
  /** Native sync preserves existing Montage sources; archive replacement keeps its detachment policy. */
  preserveVideoProjectSources?: true;
}): Promise<{ conflicted: boolean; imported: boolean }> {
  for (const asset of args.root.assets) {
    // A frozen gallery representation owns its bytes; it does not publish this canonical root.
    if (asset.entry.galleryAssetId && !asset.entry.borrowedMediaId) continue;
    const raw: unknown = await args.tx
      .objectStore(MEDIA_LIBRARY_STORE)
      .get(`scenario-asset:${asset.entry.id}`);
    const media = parseMediaLibraryEntry(raw);
    if (
      raw !== undefined &&
      (!media ||
        media.source.kind !== 'stored-asset' ||
        media.source.assetId !== asset.entry.assetId)
    )
      throw new Error('Scenario replacement cannot overwrite an independent Library identity.');
  }
  const existing = (await args.stores.projects.get(args.root.entry.id)) !== undefined;
  const childConflict = await hasScenarioChildConflict(args);
  const conflicted = Boolean(existing || childConflict);
  if (conflicted && args.strategy === 'skip') return { conflicted, imported: false };
  if ((existing || childConflict) && args.strategy === 'duplicate') {
    throw new Error('Scenario project restore conflict changed after preflight.');
  }
  if (existing && args.strategy === 'replace')
    await deleteExisting({
      operation: args.operation,
      projectId: args.root.entry.id,
      stores: args.stores,
      tx: args.tx,
      ...(args.preserveVideoProjectSources ? { replacementAssets: args.root.assets } : {}),
    });
  const lifecycle =
    args.root.entry.lifecycle ?? createLibraryLifecycle('library', args.root.entry.updatedAt);
  const { lastAcceptedActionId: _closedAction, ...restoredEntry } = args.root.entry;
  await args.stores.projects.put({
    ...restoredEntry,
    lifecycle: promoteLibraryLifecycle(lifecycle, Date.now()),
  });
  await publishScenarioAssets(args.root, args.stores);
  await publishScenarioDocuments(args.root, args.stores);
  await publishScenarioSidecars(args.root, args.stores);
  await promoteScenarioSourceLifecycles(args.tx, args.root.entry, Date.now());
  return { conflicted, imported: true };
}
