import {
  listRecoverableRecordings as listStoredRecoveryRecordings,
  readRecoveryRecording,
  deleteRecoveryRecording,
  withRecoveryRecording,
  type RecoveryRecording,
} from '../../composition/persistence/recordings/recovery';
import { getRecording } from '../../composition/persistence/recordings';
import { saveRecordingsBatchSafely } from '../media-hub/store';
import { remuxRecoveryRecording } from './recording-recovery-remux';
import { runWithPersistenceMutationTransition } from '../../composition/persistence/infrastructure/mutation-barrier';
import { releaseAssetReadyProtection } from '../../composition/persistence/assets';

export type { RecoveryRecording };
export { deleteRecoveryRecording };

/** Show inactive sources only when publication failed or both saved targets are unavailable. */
export async function listRecoverableRecordings(): Promise<RecoveryRecording[]> {
  const entries = await listStoredRecoveryRecordings();
  const interrupted: RecoveryRecording[] = [];
  for (const entry of entries) {
    if (
      !entry.published ||
      (!(await getRecording(entry.id)) && !(await getRecording(entry.recoveryId)))
    )
      interrupted.push(entry);
  }
  return interrupted;
}

/** Materializes an immutable download snapshot. The download consumer owns release. */
export function prepareOriginalRecordingDownload(entry: RecoveryRecording) {
  return withRecoveryRecording(entry.id, entry.incarnation, async () => {
    const snapshot = await readRecoveryRecording(entry.id);
    return {
      file: snapshot.file,
      filename: entry.filename,
      release: snapshot.release,
    };
  });
}

/** Publishes a separately validated playable copy and retains every original block. */
export function recoverRecording(entry: RecoveryRecording): Promise<string> {
  return withRecoveryRecording(entry.id, entry.incarnation, async (current) => {
    if (await getRecording(current.recoveryId))
      throw new Error('The recovery target already exists. The saved copy was retained.');
    return runWithPersistenceMutationTransition(async (transitionPermit) => {
      const original = await readRecoveryRecording(current.id, transitionPermit);
      try {
        const result = await remuxRecoveryRecording(original.file, transitionPermit);
        try {
          await saveRecordingsBatchSafely([
            {
              id: current.recoveryId,
              preparedAsset: result.preparedAsset,
              filename: current.filename,
              recoverySource: {
                id: current.id,
                incarnation: current.incarnation,
                epoch: current.epoch,
              },
            },
          ]);
          return current.recoveryId;
        } finally {
          // Publication owns its journal and asset after handoff, including retryable failures.
          await releaseAssetReadyProtection([result.preparedAsset.ref.assetId]);
        }
      } finally {
        await original.release();
      }
    });
  });
}
