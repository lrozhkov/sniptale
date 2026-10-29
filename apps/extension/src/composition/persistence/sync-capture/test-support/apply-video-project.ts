import type { IDBPTransaction } from 'idb';
import { buildPhysicalDeleteOperation, completePhysicalDeleteOperation } from '../../assets';
import { abortIndexedDbMutation } from '../../infrastructure/indexed-db/transaction';
import { runWithIndexedDbMutation } from '../../infrastructure/indexed-db/mutation';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  IMAGE_WORKSPACES_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  SCENARIO_ASSETS_STORE,
  STORE_NAME,
  VIDEO_PROJECT_REVISIONS_STORE,
  SYNC_CAPTURE_STORE,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
} from '../../infrastructure/indexed-db/core.stores';
import { putVideoProjectBackupRestore } from '../../projects/backup-restore';
import { createVideoWorkspaceStore } from '../../review-workspaces/storage';
import { readEnabledCaptureProfile } from '../capture';
import {
  captureRootKey,
  type SyncCaptureAppliedOperation,
  type SyncCaptureRootState,
} from '../contracts';
import { parseSyncCaptureRecord } from '../guards';

type PreparedRoot = Parameters<typeof putVideoProjectBackupRestore>[0]['root'];

type ApplyTransaction = IDBPTransaction<unknown, string[], 'readwrite'>;
interface ApplyIdentity {
  spaceId: string;
  rootId: string;
  rootKey: string;
  receiptKey: string;
  operationId: string;
  sourceDigest: string;
}

async function readAppliedReceipt(
  tx: ApplyTransaction,
  identity: ApplyIdentity
): Promise<number | null> {
  const raw: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get(identity.receiptKey);
  if (raw === undefined) return null;
  const receipt = parseSyncCaptureRecord(raw);
  if (
    !receipt ||
    receipt.kind !== 'applied-operation' ||
    receipt.key !== identity.receiptKey ||
    receipt.spaceId !== identity.spaceId ||
    receipt.operationId !== identity.operationId ||
    receipt.sourceDigest !== identity.sourceDigest ||
    receipt.rootKey !== identity.rootKey
  )
    throw new Error('Prototype application identity conflicts with its durable receipt.');
  return receipt.generation;
}

async function readApplicationGeneration(
  tx: ApplyTransaction,
  identity: ApplyIdentity
): Promise<number> {
  const key = JSON.stringify(['root-state', identity.rootKey]);
  const raw: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get(key);
  if (raw === undefined) return 0;
  const previous = parseSyncCaptureRecord(raw);
  if (
    !previous ||
    previous.kind !== 'root-state' ||
    previous.key !== key ||
    previous.rootKey !== identity.rootKey ||
    previous.spaceId !== identity.spaceId
  )
    throw new Error('Invalid prototype application root state.');
  return previous.generation;
}

async function prepareApplicationProvenance(
  tx: ApplyTransaction,
  identity: ApplyIdentity,
  expected: number
) {
  const previous = await readApplicationGeneration(tx, identity);
  if (previous !== expected) throw new Error('Prototype application local generation changed.');
  const generation = previous + 1;
  const createdAt = Date.now();
  const state: SyncCaptureRootState = {
    version: 1,
    kind: 'root-state',
    key: JSON.stringify(['root-state', identity.rootKey]),
    createdAt,
    spaceId: identity.spaceId,
    rootKind: 'video-project',
    rootId: identity.rootId,
    rootKey: identity.rootKey,
    generation,
    basis: [identity.operationId],
  };
  const receipt: SyncCaptureAppliedOperation = {
    version: 1,
    kind: 'applied-operation',
    key: identity.receiptKey,
    createdAt,
    spaceId: identity.spaceId,
    rootKey: identity.rootKey,
    operationId: identity.operationId,
    sourceDigest: identity.sourceDigest,
    generation,
  };
  if (!parseSyncCaptureRecord(state) || !parseSyncCaptureRecord(receipt))
    throw new Error('Invalid prototype application provenance.');
  return { state, receipt };
}

/**
 * Test-only native apply seam. The caller has already checked sourceDigest against the source.
 * This command proves transaction provenance, not remote authentication or protocol admission.
 */
export async function applyVideoProjectForCapturePrototype(input: {
  root: PreparedRoot;
  operationId: string;
  sourceDigest: string;
  expectedLocalGeneration: number;
}): Promise<{ status: 'applied' | 'duplicate'; generation: number }> {
  const { operationId, sourceDigest, expectedLocalGeneration } = input;
  if (
    operationId.length === 0 ||
    operationId.length > 256 ||
    !/^[a-f0-9]{64}$/u.test(sourceDigest) ||
    !Number.isSafeInteger(expectedLocalGeneration) ||
    expectedLocalGeneration < 0
  )
    throw new Error('Invalid prototype application receipt input.');
  const root = structuredClone(input.root);
  const operation = buildPhysicalDeleteOperation([]);
  const result = await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        VIDEO_PROJECT_REVISIONS_STORE,
        STORE_NAME,
        VIDEO_PROJECTS_STORE,
        PROJECT_ASSETS_STORE,
        PROJECT_EXPORTS_STORE,
        MEDIA_LIBRARY_STORE,
        VIDEO_WORKSPACES_STORE,
        VIDEO_WORKSPACE_HISTORY_STORE,
        VIDEO_WORKSPACE_DRAFTS_STORE,
        THUMBNAILS_STORE,
        AGGREGATE_PRESENTATIONS_STORE,
        ASSET_REFS_STORE,
        ASSET_OWNERS_STORE,
        ASSET_OPERATIONS_STORE,
        IMAGE_WORKSPACES_STORE,
        SCENARIO_ASSETS_STORE,
        SYNC_CAPTURE_STORE,
      ],
      'readwrite'
    );
    try {
      const profile = await readEnabledCaptureProfile(tx);
      if (!profile) throw new Error('Prototype remote apply requires an enabled capture profile.');
      const store = tx.objectStore(SYNC_CAPTURE_STORE);
      const rootKey = captureRootKey(profile.spaceId, 'video-project', root.entry.id);
      const receiptKey = JSON.stringify(['applied-operation', profile.spaceId, operationId]);
      const identity = {
        spaceId: profile.spaceId,
        rootId: root.entry.id,
        rootKey,
        receiptKey,
        operationId,
        sourceDigest,
      };
      const duplicateGeneration = await readAppliedReceipt(tx, identity);
      if (duplicateGeneration !== null) {
        await tx.done;
        return { status: 'duplicate' as const, generation: duplicateGeneration };
      }
      const { state, receipt } = await prepareApplicationProvenance(
        tx,
        identity,
        expectedLocalGeneration
      );
      await putVideoProjectBackupRestore({
        tx,
        operation,
        root,
        strategy: 'replace',
        stores: {
          assets: tx.objectStore(PROJECT_ASSETS_STORE),
          exports: tx.objectStore(PROJECT_EXPORTS_STORE),
          media: tx.objectStore(MEDIA_LIBRARY_STORE),
          videoWorkspaces: createVideoWorkspaceStore(tx),
          videoDrafts: tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE),
          operations: tx.objectStore(ASSET_OPERATIONS_STORE),
          owners: tx.objectStore(ASSET_OWNERS_STORE),
          presentations: tx.objectStore(AGGREGATE_PRESENTATIONS_STORE),
          projects: tx.objectStore(VIDEO_PROJECTS_STORE),
          refs: tx.objectStore(ASSET_REFS_STORE),
          thumbnails: tx.objectStore(THUMBNAILS_STORE),
          scenarioAssets: tx.objectStore(SCENARIO_ASSETS_STORE),
        },
      });
      if (operation.assetIds.length || operation.privateSources?.length)
        await tx.objectStore(ASSET_OPERATIONS_STORE).put(operation);
      await store.put(state);
      await store.add(receipt);
      await tx.done;
      return { status: 'applied' as const, generation: state.generation };
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
  if (operation.assetIds.length || operation.privateSources?.length)
    await completePhysicalDeleteOperation(operation).catch(() => undefined);
  return result;
}
