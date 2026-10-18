import type { RecordingRecoverySource } from '../recovery/publication';
import { createAssetObjectWriter, type AssetObjectWriter } from '../../assets';
import {
  acquireRecoveryLock,
  openRecoverySession,
  commitRecoveryBlock,
  completeRecoverySession,
  streamRecoveryRecording,
  RECORDING_RECOVERY_BLOCK_BYTES,
} from '../recovery/storage';
import type { RecordingStagingArtifactInput } from './contracts';

/** Strict durable recovery blocks own bytes; OPFS is a rebuildable publication copy. */
export async function createDurableRecordingWriter(
  input: RecordingStagingArtifactInput,
  epoch: string
): Promise<
  AssetObjectWriter & {
    recoverySource: RecordingRecoverySource;
    invalidate(): Promise<void>;
    discard(): Promise<void>;
    release(): Promise<void>;
  }
> {
  const release = await acquireRecoveryLock(input.artifactId);
  let entry;
  try {
    entry = await openRecoverySession(input, epoch);
  } catch (error) {
    await release();
    throw error;
  }
  const recovery = entry;
  let output: AssetObjectWriter | null = null;
  let cancelled = false;
  return {
    recoverySource: { id: recovery.id, incarnation: recovery.incarnation, epoch: recovery.epoch },
    get assetId() {
      return output?.assetId ?? recovery.id;
    },
    async append(chunk) {
      for (let offset = 0; offset < chunk.size; offset += RECORDING_RECOVERY_BLOCK_BYTES) {
        const bytes = await chunk
          .slice(offset, offset + RECORDING_RECOVERY_BLOCK_BYTES)
          .arrayBuffer();
        if (cancelled) throw new Error('Recording recovery writer is closed.');
        await commitRecoveryBlock(recovery, bytes);
      }
    },
    async finalize() {
      if (cancelled) throw new Error('Recording recovery writer is closed.');
      await completeRecoverySession(recovery);
      output = await createAssetObjectWriter({ mimeType: recovery.mimeType });
      if (cancelled) {
        await output.abort();
        throw new Error('Recording recovery writer is closed.');
      }
      const reader = streamRecoveryRecording(recovery).getReader();
      try {
        for (;;) {
          const block = await reader.read();
          if (block.done) break;
          await output.append(new Blob([block.value.slice().buffer]));
        }
        return await output.finalize();
      } finally {
        reader.releaseLock();
      }
    },
    async invalidate() {
      cancelled = true;
      try {
        await output?.abort();
      } finally {
        await release();
      }
    },
    async abort() {
      cancelled = true;
      try {
        await output?.abort();
      } finally {
        await release();
      }
    },
    release,
    async discard() {
      await release();
      const { deleteRecoveryRecording } = await import('../recovery');
      await deleteRecoveryRecording(recovery.id, recovery.incarnation);
    },
  };
}
