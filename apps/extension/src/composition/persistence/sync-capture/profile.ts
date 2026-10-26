import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { SYNC_CAPTURE_STORE } from '../infrastructure/indexed-db/core.stores';
import { type SyncCaptureProfile } from './contracts';
import { parseSyncCaptureRecord } from './guards';

/** Install the bounded experiment once. Profile rotation is outside this experiment. */
export async function installExperimentalCaptureProfile(
  profile: SyncCaptureProfile
): Promise<void> {
  const parsed = parseSyncCaptureRecord(profile);
  if (!parsed || parsed.kind !== 'profile') throw new Error('Invalid sync capture profile.');
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([SYNC_CAPTURE_STORE], 'readwrite');
    try {
      const store = tx.objectStore(SYNC_CAPTURE_STORE);
      if ((await store.count()) !== 0) throw new Error('Sync capture is already configured.');
      await store.add(parsed);
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Transaction can already be closed. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
}
