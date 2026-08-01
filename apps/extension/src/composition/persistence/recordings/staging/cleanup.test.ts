import { describe, expect, it, vi } from 'vitest';

import type { RecordingStagingStorageAdapter } from './contracts';
import { cleanupOrphanedRecordingStaging } from './cleanup';

describe('recording staging orphan cleanup', () => {
  it('delegates complete orphan removal to the staging storage authority', async () => {
    const storage: RecordingStagingStorageAdapter = {
      countSessions: vi.fn().mockResolvedValue(0),
      createSession: vi.fn(),
      removeAllSessions: vi.fn().mockResolvedValue(3),
    };

    await expect(cleanupOrphanedRecordingStaging(storage)).resolves.toBe(3);
    expect(storage.removeAllSessions).toHaveBeenCalledOnce();
  });

  it('surfaces cleanup failure', async () => {
    const error = new Error('cleanup failed');
    const storage: RecordingStagingStorageAdapter = {
      countSessions: vi.fn().mockResolvedValue(0),
      createSession: vi.fn(),
      removeAllSessions: vi.fn().mockRejectedValue(error),
    };

    await expect(cleanupOrphanedRecordingStaging(storage)).rejects.toBe(error);
  });
});
