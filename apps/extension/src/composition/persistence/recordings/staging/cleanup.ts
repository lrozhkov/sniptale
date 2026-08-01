import type { RecordingStagingStorageAdapter } from './contracts';
import { createOpfsRecordingStagingStorage } from './opfs-adapter';

export async function cleanupOrphanedRecordingStaging(
  storage: RecordingStagingStorageAdapter = createOpfsRecordingStagingStorage()
): Promise<number> {
  return storage.removeAllSessions();
}
