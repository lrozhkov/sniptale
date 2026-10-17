import { createStrictRecordingTransaction } from './recovery/transaction';
import {
  markRecordingRecoveryPublished,
  assertRecordingRecoveryPublication,
  parseRecordingRecoverySource,
  type RecordingRecoverySource,
} from './recovery/publication';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { DurableAssetLifecyclePermit } from '../infrastructure/mutation-barrier';
import type { VideoPostRecordResult } from '@sniptale/runtime-contracts/video/types/types';
import { assertStandaloneMediaSourceReplaceable } from '../projects/source-admission';
import {
  VIDEO_PROJECTS_STORE,
  SCENARIO_ASSETS_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  PROJECT_ASSETS_STORE,
  RECORDING_RECOVERY_SESSIONS_STORE,
} from '../infrastructure/indexed-db/core';
import { MediaAssetDeletionBlockedError } from '../media-library/deletion-errors';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
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
  assertSourcePublicationVersion,
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
  expectedAssetIds?: Record<string, string | null>;
  recoverySources?: Record<string, RecordingRecoverySource>;
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
  const expected = record['expectedAssetIds'];
  if (
    expected !== undefined &&
    (!isRecord(expected) ||
      Object.values(expected).some((value) => value !== null && typeof value !== 'string'))
  )
    return null;
  const expectedAssetIds: Record<string, string | null> = {};
  if (isRecord(expected))
    for (const [id, value] of Object.entries(expected))
      if (typeof value === 'string' || value === null) expectedAssetIds[id] = value;
  if (
    expected !== undefined &&
    entries.some((entry) => !entry || !Object.hasOwn(expectedAssetIds, entry.id))
  )
    return null;
  const recoverySources: Record<string, RecordingRecoverySource> = {};
  const rawSources = record['recoverySources'];
  if (rawSources !== undefined) {
    if (!isRecord(rawSources)) return null;
    for (const [id, raw] of Object.entries(rawSources)) {
      const source = parseRecordingRecoverySource(raw);
      if (!source || !entries.some((entry) => entry?.id === id)) return null;
      recoverySources[id] = source;
    }
  }
  return {
    ...(rawSources === undefined ? {} : { recoverySources }),
    completion,
    entries: entries as StoredRecordingEntry[],
    ...(expected === undefined ? {} : { expectedAssetIds }),
  };
}

function ownerKey(recordingId: string): [string, string, string] {
  return [RECORDING_ASSET_OWNER_KIND, recordingId, RECORDING_ASSET_ROLE];
}

export async function publishRecordingAssetJournal(
  journal: AssetReadyJournal,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<void> {
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
          VIDEO_PROJECTS_STORE,
          SCENARIO_ASSETS_STORE,
          VIDEO_WORKSPACES_STORE,
          VIDEO_WORKSPACE_HISTORY_STORE,
          PROJECT_ASSETS_STORE,
        ] as const)
      : ([
          STORE_NAME,
          MEDIA_LIBRARY_STORE,
          ASSET_REFS_STORE,
          ASSET_OWNERS_STORE,
          ASSET_OPERATIONS_STORE,
          VIDEO_PROJECTS_STORE,
          SCENARIO_ASSETS_STORE,
          VIDEO_WORKSPACES_STORE,
          VIDEO_WORKSPACE_HISTORY_STORE,
          PROJECT_ASSETS_STORE,
        ] as const);
    const tx = payload.recoverySources
      ? createStrictRecordingTransaction(db, [...storeNames, RECORDING_RECOVERY_SESSIONS_STORE])
      : db.transaction(storeNames, 'readwrite');
    try {
      const recordingStore = tx.objectStore(STORE_NAME);
      const ownerStore = tx.objectStore(ASSET_OWNERS_STORE);
      let replayOnly = true;
      for (const entry of payload.entries) {
        const recoverySource = payload.recoverySources?.[entry.id];
        if (recoverySource) await assertRecordingRecoveryPublication(tx, recoverySource, entry.id);
        const rawPrevious: unknown = await recordingStore.get(entry.id);
        const previous = parseRecordingEntry(rawPrevious);
        if (rawPrevious !== undefined && (!previous || previous.id !== entry.id))
          throw new MediaAssetDeletionBlockedError('source-unavailable');
        const replay = assertSourcePublicationVersion(
          previous?.assetId,
          entry.assetId,
          payload.expectedAssetIds?.[entry.id]
        );
        replayOnly &&= replay;
        if (replay) continue;
        if (previous && previous.assetId !== entry.assetId) {
          const target = buildRecordingMediaEntry(previous);
          await assertStandaloneMediaSourceReplaceable(target, tx);
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
        if (recoverySource) await markRecordingRecoveryPublished(tx, recoverySource, entry.id);
        const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
        const media = buildRecordingMediaEntry(entry);
        const currentMedia = parseMediaLibraryEntry(await mediaStore.get(media.id));
        await mediaStore.put({
          ...media,
          ...(currentMedia?.lifecycle ? { lifecycle: currentMedia.lifecycle } : {}),
        });
      }
      if (payload.completion && !replayOnly) {
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
    } catch (error) {
      await abortIndexedDbMutation(tx, error);
    }
  });
  if (physicalDelete.assetIds.length > 0)
    await completePhysicalDeleteOperation(physicalDelete, lifecyclePermit);
}

export const recordingAssetPublicationAdapter: AssetPublicationAdapter = {
  domain: RECORDING_ASSET_PUBLICATION_DOMAIN,
  publish: publishRecordingAssetJournal,
};

export function recoverRecordingAssetPublications(): Promise<number> {
  return recoverStandaloneAssetPublications([recordingAssetPublicationAdapter]);
}
