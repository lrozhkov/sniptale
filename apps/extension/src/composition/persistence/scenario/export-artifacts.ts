import {
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_PROJECTS_STORE,
  initDB,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  createAssetObjectWriter,
  createAssetPublicationJournal,
  discardPreparedAsset,
  parseAssetRef,
  parseAssetOwner,
  publishReadyJournalWithRetry,
  readAssetFile,
  recoverStandaloneAssetPublications,
  releaseAssetReadyProtection,
  type AssetObjectWriter,
  type AssetPublicationAdapter,
  type AssetReadyJournal,
  type AssetRef,
  type PhysicalDeleteAssetOperation,
} from '../assets';
import { parseScenarioExportEntry } from './read-guards';
import type { ScenarioExportEntry } from './contracts';

const SCENARIO_HTML_OWNER_KIND = 'scenario-export';
const DOMAIN = 'scenario-html-exports';

interface HtmlOwnershipStores {
  owners: {
    get(key: IDBValidKey): Promise<unknown>;
    delete(key: IDBValidKey): Promise<unknown>;
    index(name: 'assetId'): { count(id: string): Promise<number> };
  };
  refs: { delete(key: IDBValidKey): Promise<unknown> };
}

/** Catalogue deletion releases only its own graph edge, including malformed legacy metadata. */
export async function unlinkScenarioHtmlOwnership(
  id: string,
  stores: HtmlOwnershipStores,
  physicalDelete: PhysicalDeleteAssetOperation
) {
  const key = [SCENARIO_HTML_OWNER_KIND, id, 'body'];
  const raw = await stores.owners.get(key);
  if (raw === undefined) return;
  const owner = parseAssetOwner(raw);
  if (
    !owner ||
    owner.ownerKind !== SCENARIO_HTML_OWNER_KIND ||
    owner.ownerId !== id ||
    owner.role !== 'body'
  )
    throw new Error('Scenario HTML ownership is invalid.');
  await stores.owners.delete(key);
  if ((await stores.owners.index('assetId').count(owner.assetId)) === 0) {
    await stores.refs.delete(owner.assetId);
    physicalDelete.assetIds.push(owner.assetId);
  }
}

/** Advisory retention mirrors native writes without making local quota block file download. */
export async function createScenarioHtmlCapture() {
  let writer: AssetObjectWriter | undefined;
  let failure: unknown;
  try {
    writer = await createAssetObjectWriter({ mimeType: 'text/html;charset=utf-8' });
  } catch (error) {
    failure = error;
  }
  return {
    async append(chunk: Uint8Array) {
      if (!writer || failure !== undefined) return;
      try {
        await writer.append(new Blob([new Uint8Array(chunk)]));
      } catch (error) {
        failure = error;
      }
    },
    async abort() {
      await writer?.abort();
    },
    async finalize() {
      if (!writer || failure !== undefined) {
        await writer?.abort();
        throw failure ?? new Error('HTML retention is unavailable.');
      }
      try {
        return await writer.finalize();
      } catch (error) {
        await writer.abort();
        throw error;
      }
    },
  };
}

function readArtifactPair(payload: unknown, refs: readonly unknown[]) {
  const entry = parseScenarioExportEntry(payload);
  const ref = refs.length === 1 ? parseAssetRef(refs[0]) : null;
  if (
    !entry?.html ||
    !ref ||
    entry.html.assetId !== ref.assetId ||
    entry.size !== ref.size ||
    !/^text\/html(?:;charset=utf-8)?$/iu.test(ref.mimeType)
  )
    throw new Error('Invalid scenario HTML publication.');
  return { entry, ref };
}

function readPublication(journal: AssetReadyJournal) {
  if (journal.domain !== DOMAIN || journal.operationId)
    throw new Error('Invalid scenario HTML publication domain.');
  return readArtifactPair(journal.payload, journal.assetRefs);
}

async function commitHtmlJournal(journal: AssetReadyJournal): Promise<boolean> {
  const { entry, ref } = readPublication(journal);
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [SCENARIO_EXPORTS_STORE, SCENARIO_PROJECTS_STORE, ASSET_REFS_STORE, ASSET_OWNERS_STORE],
      'readwrite'
    );
    const exports = tx.objectStore(SCENARIO_EXPORTS_STORE);
    try {
      const existing = parseScenarioExportEntry(await exports.get(entry.id));
      if (!(await tx.objectStore(SCENARIO_PROJECTS_STORE).get(entry.projectId))) {
        await tx.done;
        return false;
      }
      if (existing) {
        if (existing.projectId !== entry.projectId || existing.html?.assetId !== ref.assetId)
          throw new Error('Scenario HTML catalogue identity collided.');
        await tx.done;
        return true;
      }
      await tx.objectStore(ASSET_REFS_STORE).put(ref);
      await tx.objectStore(ASSET_OWNERS_STORE).put({
        assetId: ref.assetId,
        ownerId: entry.id,
        ownerKind: SCENARIO_HTML_OWNER_KIND,
        role: 'body',
      });
      await exports.put(entry);
      await tx.done;
      return true;
    } finally {
      await tx.done.catch(() => undefined);
    }
  });
}

async function publishHtmlJournal(journal: AssetReadyJournal): Promise<void> {
  if (!(await commitHtmlJournal(journal))) throw new Error('Scenario export source was deleted.');
}

/** A vanished parent invalidates an unpublished artifact instead of recreating its catalogue. */
export const scenarioHtmlPublicationAdapter: AssetPublicationAdapter = {
  domain: DOMAIN,
  async publish(journal) {
    const { ref } = readPublication(journal);
    if (!(await commitHtmlJournal(journal))) await discardPreparedAsset(ref.assetId);
    await releaseAssetReadyProtection([ref.assetId]);
  },
};

/** Transfers a finalized immutable object to durable journal authority before catalogue commit. */
export async function saveScenarioHtmlArtifact(entry: ScenarioExportEntry, ref: AssetRef) {
  let handedOff = false;
  try {
    readArtifactPair(entry, [ref]);
    const journal = await createAssetPublicationJournal({
      assetRefs: [ref],
      domain: DOMAIN,
      payload: entry,
    });
    handedOff = true;
    await publishReadyJournalWithRetry(journal, publishHtmlJournal);
  } catch (error) {
    if (!handedOff) await discardPreparedAsset(ref.assetId);
    throw error;
  } finally {
    await releaseAssetReadyProtection([ref.assetId]);
  }
}

/** Settles retained journals before catalogue deletion can release their body objects. */
export function recoverScenarioHtmlPublications(): Promise<number> {
  return recoverStandaloneAssetPublications([scenarioHtmlPublicationAdapter]);
}

/** Reads the chosen immutable file, independently of the current project document. */
export async function readScenarioHtmlArtifact(id: string) {
  const db = await initDB();
  const entry = parseScenarioExportEntry(await db.get(SCENARIO_EXPORTS_STORE, id));
  if (!entry?.html || entry.trashState?.trashedAt !== undefined) return null;
  const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, entry.html.assetId));
  const owner = parseAssetOwner(
    await db.get(ASSET_OWNERS_STORE, [SCENARIO_HTML_OWNER_KIND, id, 'body'])
  );
  if (
    !owner ||
    owner.assetId !== entry.html.assetId ||
    owner.ownerKind !== SCENARIO_HTML_OWNER_KIND ||
    owner.ownerId !== id ||
    owner.role !== 'body'
  )
    return null;
  if (!ref || ref.size !== entry.size || !/^text\/html(?:;charset=utf-8)?$/iu.test(ref.mimeType))
    return null;
  const blob = await readAssetFile(ref, entry.filename);
  if (blob.size !== entry.size) return null;
  return { entry, blob };
}
