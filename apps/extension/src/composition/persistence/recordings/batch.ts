import type { VideoPostRecordResult } from '@sniptale/runtime-contracts/video/types/types';
import type { LibraryStorageClass } from '../library-lifecycle/contracts';
import { createLibraryLifecycle } from '../library-lifecycle/contracts';
import {
  assertAssetWriteAdmission,
  discardPreparedAsset,
  createAssetPublicationJournal,
  publishReadyJournalWithRetry,
  releaseAssetReadyProtection,
  writeBlobToAsset,
  type PreparedAssetObject,
} from '../assets';
import type { StoredRecordingEntry } from './contracts';
import {
  publishRecordingAssetJournal,
  RECORDING_ASSET_PUBLICATION_DOMAIN,
  recoverRecordingAssetPublications,
  type RecordingPublicationPayload,
} from './asset-publication';

export interface SaveRecordingBatchInput {
  blob?: Blob;
  createdAt?: number;
  filename: string;
  id: string;
  mimeType?: string;
  preparedAsset?: PreparedAssetObject;
  storageClass?: LibraryStorageClass;
}

function validateInputs(inputs: readonly SaveRecordingBatchInput[]): void {
  const ids = new Set<string>();
  for (const input of inputs) {
    if (input.id.trim().length === 0) throw new Error('Recording ID must not be empty.');
    if (input.filename.trim().length === 0)
      throw new Error('Recording filename must not be empty.');
    if (ids.has(input.id)) throw new Error(`Duplicate recording ID in batch: ${input.id}.`);
    if ((input.blob ? 1 : 0) + (input.preparedAsset ? 1 : 0) !== 1) {
      throw new Error('Recording input must provide exactly one binary source.');
    }
    ids.add(input.id);
  }
}

async function writeInputsToAssets(
  inputs: readonly SaveRecordingBatchInput[]
): Promise<Array<{ input: SaveRecordingBatchInput; prepared: PreparedAssetObject }>> {
  const blobBytes = inputs.reduce((total, input) => total + (input.blob?.size ?? 0), 0);
  if (blobBytes > 0) await assertAssetWriteAdmission(blobBytes);
  const prepared: Array<{ input: SaveRecordingBatchInput; prepared: PreparedAssetObject }> = [];
  try {
    for (const input of inputs) {
      prepared.push({
        input,
        prepared:
          input.preparedAsset ??
          (await writeBlobToAsset(input.blob!, {
            mimeType: input.mimeType || input.blob!.type || 'video/webm',
          })),
      });
    }
    return prepared;
  } catch (error) {
    await Promise.all(
      prepared.map(({ prepared: asset }) => discardPreparedAsset(asset.ref.assetId))
    );
    throw error;
  }
}

function createEntries(
  preparedInputs: Array<{ input: SaveRecordingBatchInput; prepared: PreparedAssetObject }>
): StoredRecordingEntry[] {
  const defaultCreatedAt = Date.now();
  return preparedInputs.map(({ input, prepared }) => {
    const createdAt = input.createdAt ?? defaultCreatedAt;
    return {
      assetId: prepared.ref.assetId,
      createdAt,
      filename: input.filename,
      id: input.id,
      lifecycle: createLibraryLifecycle(input.storageClass ?? 'library', createdAt),
      mimeType: prepared.ref.mimeType,
      size: prepared.ref.size,
    };
  });
}

async function saveRecordingEntries(
  inputs: readonly SaveRecordingBatchInput[],
  completion: VideoPostRecordResult | null
): Promise<StoredRecordingEntry[]> {
  validateInputs(inputs);
  if (inputs.length === 0) return [];
  if (completion && !inputs.some((input) => input.id === completion.primaryRecordingId)) {
    throw new Error('The primary completed recording is not present in the media batch.');
  }
  await recoverRecordingAssetPublications();
  const preparedInputs = await writeInputsToAssets(inputs);
  const entries = createEntries(preparedInputs);
  let journalCreated = false;
  try {
    const payload: RecordingPublicationPayload = { completion, entries };
    const journal = await createAssetPublicationJournal({
      assetRefs: preparedInputs.map(({ prepared }) => prepared.ref),
      domain: RECORDING_ASSET_PUBLICATION_DOMAIN,
      payload,
    });
    journalCreated = true;
    await publishReadyJournalWithRetry(journal, publishRecordingAssetJournal);
    releaseAssetReadyProtection(
      preparedInputs
        .filter(({ input }) => input.blob !== undefined)
        .map(({ prepared }) => prepared.ref.assetId)
    );
    return entries;
  } catch (error) {
    if (!journalCreated) {
      await Promise.all(
        preparedInputs.map(({ prepared }) => discardPreparedAsset(prepared.ref.assetId))
      );
    }
    throw error;
  }
}

export function saveRecordingsBatch(
  inputs: readonly SaveRecordingBatchInput[]
): Promise<StoredRecordingEntry[]> {
  return saveRecordingEntries(inputs, null);
}

export function saveRecordingsBatchWithCompletion(
  inputs: readonly SaveRecordingBatchInput[],
  completion: VideoPostRecordResult
): Promise<StoredRecordingEntry[]> {
  return saveRecordingEntries(inputs, completion);
}
