import type { AggregatePresentationEntry } from '../aggregate-presentations/contracts';
import { createAggregatePresentationKey } from '../aggregate-presentations/contracts';
import type {
  ArchiveRestoreStrategy,
  AssetOwner,
  AssetRef,
  PhysicalDeleteAssetOperation,
} from '../assets';
import { removeEditorDocumentOwnership } from '../document-assets';
import type { MediaThumbnailEntry } from '../media-library/contracts';
import type {
  ScenarioAssetEntry,
  ScenarioExportEntry,
  ScenarioProjectEntry,
  StoredScenarioStepEditorDocumentEntry,
} from './contracts';
import {
  parseScenarioAssetEntry,
  parseScenarioExportEntry,
  parseScenarioProjectEntry,
} from './read-guards';
import { parseScenarioStepEditorDocumentEntry } from './editor-documents';

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

interface PreparedScenarioProjectArchiveRoot {
  assets: Array<{ entry: ScenarioAssetEntry; ref: AssetRef }>;
  entry: ScenarioProjectEntry;
  exportThumbnails: MediaThumbnailEntry[];
  exports: ScenarioExportEntry[];
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
}) {
  if (!parseScenarioProjectEntry(await args.stores.projects.get(args.projectId))) return;
  for (const raw of await args.stores.assets.index('projectId').getAll(args.projectId)) {
    const asset = parseScenarioAssetEntry(raw);
    if (!asset) continue;
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
  for (const raw of await args.stores.stepDocuments.index('projectId').getAll(args.projectId)) {
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
  for (const raw of await args.stores.exports.index('projectId').getAll(args.projectId)) {
    const entry = parseScenarioExportEntry(raw);
    if (!entry) continue;
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
      const current = parseScenarioAssetEntry(await args.stores.assets.get(item.entry.id));
      if (current && args.strategy === 'replace' && current.projectId !== args.root.entry.id) {
        throw new Error(`Scenario asset belongs to another root: ${item.entry.id}.`);
      }
      return Boolean(current);
    }),
    ...args.root.exports.map(async (item) => {
      const current = parseScenarioExportEntry(await args.stores.exports.get(item.id));
      if (current && args.strategy === 'replace' && current.projectId !== args.root.entry.id) {
        throw new Error(`Scenario export belongs to another root: ${item.id}.`);
      }
      return Boolean(current);
    }),
    ...args.root.stepDocuments.map(async (item) => {
      const current = parseScenarioStepEditorDocumentEntry(
        await args.stores.stepDocuments.get(item.entry.stepId)
      );
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
  for (const entry of root.exports) await stores.exports.put(entry);
  for (const thumbnail of root.exportThumbnails) await stores.thumbnails.put(thumbnail);
  if (root.thumbnail) await stores.thumbnails.put(root.thumbnail);
  if (root.presentation) await stores.presentations.put(root.presentation);
}

export async function putScenarioProjectBackupRestore(args: {
  operation: PhysicalDeleteAssetOperation;
  root: PreparedScenarioProjectArchiveRoot;
  strategy: ArchiveRestoreStrategy;
  stores: ScenarioBackupRestoreStores;
}): Promise<{ conflicted: boolean; imported: boolean }> {
  const existing = parseScenarioProjectEntry(await args.stores.projects.get(args.root.entry.id));
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
    });
  await args.stores.projects.put(args.root.entry);
  await publishScenarioAssets(args.root, args.stores);
  await publishScenarioDocuments(args.root, args.stores);
  await publishScenarioSidecars(args.root, args.stores);
  return { conflicted, imported: true };
}
