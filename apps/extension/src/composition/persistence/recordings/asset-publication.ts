import type { VideoPostRecordResult } from '@sniptale/runtime-contracts/video/types/types';
import { buildRecordingMediaEntry } from '../media-library/entry-mapping';
import {
  ASSET_OWNERS_STORE,
  ASSET_OPERATIONS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  STATE_MANAGER_STORE,
  STORE_NAME,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  parseAssetRef,
  recoverStandaloneAssetPublications,
  type AssetPublicationAdapter,
  type AssetReadyJournal,
  type AssetRef,
} from '../assets';
import {
  createVideoRecordingCompletionOutboxRecord,
  parseVideoRecordingCompletionOutboxRecord,
} from './completion-outbox';
import type { StoredRecordingEntry } from './contracts';
import { parseRecordingEntry } from './index.guards';

export const RECORDING_ASSET_PUBLICATION_DOMAIN = 'recording-assets';
export const RECORDING_ASSET_OWNER_KIND = 'recording';
export const RECORDING_ASSET_ROLE = 'body';

export interface RecordingPublicationPayload {
  completion: VideoPostRecordResult | null;
  entries: StoredRecordingEntry[];
}

function parseCompletion(value: unknown): VideoPostRecordResult | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return typeof record['primaryRecordingId'] === 'string' &&
    typeof record['recordingId'] === 'string' &&
    (record['projectId'] === null || typeof record['projectId'] === 'string')
    ? {
        primaryRecordingId: record['primaryRecordingId'],
        projectId: record['projectId'],
        recordingId: record['recordingId'],
      }
    : undefined;
}

function parsePayload(value: unknown): RecordingPublicationPayload | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record['entries'])) return null;
  const entries = record['entries'].map(parseRecordingEntry);
  const completion = parseCompletion(record['completion']);
  if (entries.some((entry) => entry === null) || completion === undefined) return null;
  return { completion, entries: entries as StoredRecordingEntry[] };
}

function ownerKey(recordingId: string): [string, string, string] {
  return [RECORDING_ASSET_OWNER_KIND, recordingId, RECORDING_ASSET_ROLE];
}

export async function publishRecordingAssetJournal(journal: AssetReadyJournal): Promise<void> {
  if (journal.domain !== RECORDING_ASSET_PUBLICATION_DOMAIN || journal.operationId) {
    throw new Error('Invalid standalone recording publication journal.');
  }
  const payload = parsePayload(journal.payload);
  const refs = journal.assetRefs.map(parseAssetRef);
  if (!payload || refs.some((ref) => ref === null) || refs.length !== payload.entries.length) {
    throw new Error('Invalid recording publication payload.');
  }
  const refsById = new Map((refs as AssetRef[]).map((ref) => [ref.assetId, ref]));
  if (payload.entries.some((entry) => !refsById.has(entry.assetId))) {
    throw new Error('Recording publication assets do not match entries.');
  }
  const physicalDelete = buildPhysicalDeleteOperation([]);
  await runWithIndexedDbMutation(async (db) => {
    const storeNames = payload.completion
      ? ([
          STORE_NAME,
          MEDIA_LIBRARY_STORE,
          STATE_MANAGER_STORE,
          ASSET_REFS_STORE,
          ASSET_OWNERS_STORE,
          ASSET_OPERATIONS_STORE,
        ] as const)
      : ([
          STORE_NAME,
          MEDIA_LIBRARY_STORE,
          ASSET_REFS_STORE,
          ASSET_OWNERS_STORE,
          ASSET_OPERATIONS_STORE,
        ] as const);
    const tx = db.transaction(storeNames, 'readwrite');
    const recordingStore = tx.objectStore(STORE_NAME);
    const ownerStore = tx.objectStore(ASSET_OWNERS_STORE);
    for (const entry of payload.entries) {
      const previous = parseRecordingEntry(await recordingStore.get(entry.id));
      if (previous && previous.assetId !== entry.assetId) {
        await ownerStore.delete(ownerKey(entry.id));
        if ((await ownerStore.index('assetId').count(previous.assetId)) === 0) {
          await tx.objectStore(ASSET_REFS_STORE).delete(previous.assetId);
          physicalDelete.assetIds.push(previous.assetId);
        }
      }
      const ref = refsById.get(entry.assetId)!;
      await tx.objectStore(ASSET_REFS_STORE).put(ref);
      await ownerStore.put({
        assetId: entry.assetId,
        ownerId: entry.id,
        ownerKind: RECORDING_ASSET_OWNER_KIND,
        role: RECORDING_ASSET_ROLE,
      });
      await recordingStore.put(entry);
      await tx.objectStore(MEDIA_LIBRARY_STORE).put(buildRecordingMediaEntry(entry));
    }
    if (payload.completion) {
      const outboxStore = tx.objectStore(STATE_MANAGER_STORE);
      const outboxRecord = createVideoRecordingCompletionOutboxRecord(payload.completion);
      const current = parseVideoRecordingCompletionOutboxRecord(
        await outboxStore.get([outboxRecord.domain, outboxRecord.key])
      );
      if (!current) {
        await outboxStore.add(outboxRecord);
      } else if (
        current.primaryRecordingId !== payload.completion.primaryRecordingId ||
        current.projectId !== payload.completion.projectId ||
        current.recordingId !== payload.completion.recordingId
      ) {
        throw new Error('A different video recording completion is already pending.');
      }
    }
    if (physicalDelete.assetIds.length > 0) {
      await tx.objectStore(ASSET_OPERATIONS_STORE).put(physicalDelete);
    }
    await tx.done;
  });
  if (physicalDelete.assetIds.length > 0) await completePhysicalDeleteOperation(physicalDelete);
}

export const recordingAssetPublicationAdapter: AssetPublicationAdapter = {
  domain: RECORDING_ASSET_PUBLICATION_DOMAIN,
  publish: publishRecordingAssetJournal,
};

export function recoverRecordingAssetPublications(): Promise<number> {
  return recoverStandaloneAssetPublications([recordingAssetPublicationAdapter]);
}
