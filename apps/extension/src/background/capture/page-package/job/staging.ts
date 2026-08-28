import { MAX_POPUP_EXPORT_JOB_TABS } from '@sniptale/runtime-contracts/export';
import { PAGE_PACKAGE_ARCHIVE_MIME_TYPE } from '@sniptale/runtime-contracts/page-package';
import {
  decodeBase64Bytes,
  estimateBase64DecodedBytes,
  isCanonicalBase64,
} from '@sniptale/runtime-contracts/validation/base64';
import {
  createAssetObjectWriter,
  discardPreparedAsset,
  readAssetFile,
  type AssetObjectWriter,
  type PreparedAssetObject,
} from '../../../../composition/persistence/assets';

const MAX_CHUNK_BYTES = 512 * 1024;
const MAX_PAGE_PACKAGE_BYTES = 1024 * 1024 * 1024;
const MAX_PAGE_PACKAGE_CHUNKS = MAX_PAGE_PACKAGE_BYTES / MAX_CHUNK_BYTES;

export interface PagePackageStageBinding {
  jobId: string;
  ordinal: number;
  stagedBlobId: string;
  tabId: number;
}

interface PagePackageStageRecord extends PagePackageStageBinding {
  activeOperation: Promise<void> | null;
  consumed: boolean;
  durableFinalized: boolean;
  expectedSequence: number;
  phase: 'finalized' | 'open';
  prepared: PreparedAssetObject | null;
  receivedBytes: number;
  releasing: boolean;
  writerPromise: Promise<AssetObjectWriter>;
}

interface PagePackageStageChunk extends PagePackageStageBinding {
  base64: string;
  final: boolean;
  sequence: number;
}

interface StagedPagePackage {
  binding: PagePackageStageBinding;
  file: File;
  prepared: PreparedAssetObject;
}

function bindingMatches(record: PagePackageStageRecord, binding: PagePackageStageBinding): boolean {
  return (
    record.jobId === binding.jobId &&
    record.ordinal === binding.ordinal &&
    record.stagedBlobId === binding.stagedBlobId &&
    record.tabId === binding.tabId
  );
}

function toStageBinding(value: PagePackageStageBinding): PagePackageStageBinding {
  return {
    jobId: value.jobId,
    ordinal: value.ordinal,
    stagedBlobId: value.stagedBlobId,
    tabId: value.tabId,
  };
}

function assertChunk(chunk: PagePackageStageChunk): number {
  if (
    !Number.isSafeInteger(chunk.ordinal) ||
    chunk.ordinal < 0 ||
    !Number.isSafeInteger(chunk.tabId) ||
    chunk.tabId < 0 ||
    !Number.isSafeInteger(chunk.sequence) ||
    chunk.sequence < 0 ||
    chunk.sequence >= MAX_PAGE_PACKAGE_CHUNKS ||
    !isCanonicalBase64(chunk.base64)
  ) {
    throw new Error('Page Package stage chunk is invalid.');
  }
  const size = estimateBase64DecodedBytes(chunk.base64);
  if (size <= 0 || size > MAX_CHUNK_BYTES) {
    throw new Error('Page Package stage chunk exceeds its byte limit.');
  }
  return size;
}

async function cleanupRecord(record: PagePackageStageRecord): Promise<void> {
  await record.activeOperation?.catch(() => undefined);
  if (record.prepared) {
    if (!record.durableFinalized) await discardPreparedAsset(record.prepared.ref.assetId);
    return;
  }
  await (await record.writerPromise).abort();
}

interface PagePackageStagingCallbacks {
  assertBindingActive(binding: PagePackageStageBinding): void;
  onFinalized(binding: PagePackageStageBinding, prepared: PreparedAssetObject): Promise<void>;
  onReleased(binding: PagePackageStageBinding): Promise<void>;
}

function createStageRecord(chunk: PagePackageStageChunk): PagePackageStageRecord {
  return {
    activeOperation: null,
    consumed: false,
    durableFinalized: false,
    expectedSequence: 0,
    jobId: chunk.jobId,
    ordinal: chunk.ordinal,
    phase: 'open',
    prepared: null,
    receivedBytes: 0,
    releasing: false,
    stagedBlobId: chunk.stagedBlobId,
    tabId: chunk.tabId,
    writerPromise: createAssetObjectWriter({ mimeType: PAGE_PACKAGE_ARCHIVE_MIME_TYPE }),
  };
}

class PagePackageStagingStore {
  private readonly records = new Map<string, PagePackageStageRecord>();

  constructor(private readonly callbacks: PagePackageStagingCallbacks) {}

  private requireWritableRecord(chunk: PagePackageStageChunk): PagePackageStageRecord {
    const existing = this.records.get(chunk.stagedBlobId);
    if (!existing && chunk.sequence !== 0) {
      throw new Error('Page Package stage sequence is invalid.');
    }
    if (!existing && this.records.size >= MAX_POPUP_EXPORT_JOB_TABS) {
      throw new Error('Too many Page Package pages are being staged.');
    }
    const record = existing ?? createStageRecord(chunk);
    if (
      !bindingMatches(record, chunk) ||
      record.phase !== 'open' ||
      record.consumed ||
      record.releasing ||
      record.activeOperation ||
      record.expectedSequence !== chunk.sequence
    ) {
      throw new Error('Page Package stage is not writable.');
    }
    if (!existing) this.records.set(chunk.stagedBlobId, record);
    return record;
  }

  private async decodeChunk(
    record: PagePackageStageRecord,
    chunk: PagePackageStageChunk,
    chunkSize: number
  ): Promise<Uint8Array> {
    const nextSize = record.receivedBytes + chunkSize;
    if (!Number.isSafeInteger(nextSize) || nextSize > MAX_PAGE_PACKAGE_BYTES) {
      await this.release(chunk);
      throw new Error('Page Package stage exceeds its byte limit.');
    }
    const bytes = decodeBase64Bytes(chunk.base64);
    if (bytes.byteLength !== chunkSize) {
      await this.release(chunk);
      throw new Error('Page Package stage chunk is invalid.');
    }
    record.expectedSequence += 1;
    record.receivedBytes = nextSize;
    return bytes;
  }

  private async writeChunk(
    record: PagePackageStageRecord,
    chunk: PagePackageStageChunk,
    bytes: Uint8Array
  ): Promise<void> {
    const writer = await record.writerPromise;
    const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
    copy.set(bytes);
    await writer.append(new Blob([copy]));
    if (!chunk.final) return;
    record.prepared = await writer.finalize();
    if (
      record.prepared.ref.size !== record.receivedBytes ||
      record.prepared.ref.mimeType !== PAGE_PACKAGE_ARCHIVE_MIME_TYPE
    ) {
      throw new Error('Page Package stage finalized with invalid metadata.');
    }
    record.phase = 'finalized';
    await this.callbacks.onFinalized(toStageBinding(chunk), record.prepared);
    record.durableFinalized = true;
  }

  private async compensateAppendFailure(
    record: PagePackageStageRecord,
    chunk: PagePackageStageChunk,
    error: unknown
  ): Promise<never> {
    this.records.delete(chunk.stagedBlobId);
    try {
      if (record.prepared && record.durableFinalized) {
        await this.callbacks.onReleased(toStageBinding(chunk));
      } else await cleanupRecord(record);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Page Package staging failed and OPFS cleanup was incomplete.',
        { cause: cleanupError }
      );
    }
    throw error;
  }

  async release(binding: PagePackageStageBinding): Promise<void> {
    const record = this.records.get(binding.stagedBlobId);
    if (!record) return;
    if (!bindingMatches(record, binding)) {
      throw new Error('Page Package stage binding does not match.');
    }
    if (record.releasing) throw new Error('Page Package stage release is already in progress.');
    record.releasing = true;
    try {
      if (record.prepared && record.durableFinalized) await this.callbacks.onReleased(binding);
      else await cleanupRecord(record);
      if (this.records.get(binding.stagedBlobId) === record) {
        this.records.delete(binding.stagedBlobId);
      }
    } finally {
      record.releasing = false;
    }
  }

  async append(chunk: PagePackageStageChunk): Promise<{ complete: boolean; stagedBlobId: string }> {
    this.callbacks.assertBindingActive(chunk);
    const chunkSize = assertChunk(chunk);
    const record = this.requireWritableRecord(chunk);
    const bytes = await this.decodeChunk(record, chunk, chunkSize);
    const operation = this.writeChunk(record, chunk, bytes);
    record.activeOperation = operation;
    try {
      await operation;
      this.callbacks.assertBindingActive(chunk);
      return { complete: chunk.final, stagedBlobId: chunk.stagedBlobId };
    } catch (error) {
      return await this.compensateAppendFailure(record, chunk, error);
    } finally {
      if (record.activeOperation === operation) record.activeOperation = null;
    }
  }

  async consume(binding: PagePackageStageBinding): Promise<StagedPagePackage> {
    this.callbacks.assertBindingActive(binding);
    const record = this.records.get(binding.stagedBlobId);
    if (
      !record ||
      !bindingMatches(record, binding) ||
      record.phase !== 'finalized' ||
      !record.prepared ||
      record.activeOperation ||
      record.releasing ||
      record.consumed
    ) {
      throw new Error('Page Package stage is missing or incomplete.');
    }
    const file = await readAssetFile(record.prepared.ref, `${binding.stagedBlobId}.page-package`);
    this.callbacks.assertBindingActive(binding);
    if (file.size !== record.receivedBytes || file.type !== PAGE_PACKAGE_ARCHIVE_MIME_TYPE) {
      throw new Error('Page Package staged object does not match its metadata.');
    }
    record.consumed = true;
    return { binding: { ...binding }, file, prepared: record.prepared };
  }

  async releaseJob(jobId: string): Promise<void> {
    const cleanup: Promise<void>[] = [];
    for (const record of this.records.values()) {
      if (record.jobId !== jobId) continue;
      cleanup.push(
        this.release({
          jobId: record.jobId,
          ordinal: record.ordinal,
          stagedBlobId: record.stagedBlobId,
          tabId: record.tabId,
        })
      );
    }
    const results = await Promise.allSettled(cleanup);
    const errors = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : []
    );
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Page Package job staging cleanup failed.');
    }
  }
}

/** Job-local OPFS staging authority. Admission remains with the parent job owner. */
export function createPagePackageStagingStore(args: PagePackageStagingCallbacks) {
  return new PagePackageStagingStore(args);
}
