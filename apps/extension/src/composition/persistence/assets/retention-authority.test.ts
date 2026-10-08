import { expect, it, vi } from 'vitest';
import { collectDurableAssetSnapshot } from './retention-authority';
const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(await mocks.db()),
}));

it('yields while validating many rows and returns only their retention projection', async () => {
  const getAll = vi.fn(async (store: string) =>
    store === 'recordings'
      ? Array.from({ length: 1000 }, (_, i) => ({
          id: `recording-${i}`,
          assetId: `asset-${i}`,
          createdAt: 1,
          filename: 'recording.webm',
          mimeType: 'video/webm',
          size: 1,
        }))
      : []
  );
  mocks.db.mockResolvedValue({ getAll });
  let ticks = 0;
  const heartbeat = setInterval(() => ticks++, 0);
  try {
    const snapshot = await collectDurableAssetSnapshot();
    expect(snapshot.authorityValid).toBe(true);
    expect(snapshot.expectedOwners).toHaveLength(1000);
    expect(getAll).toHaveBeenCalledTimes(12);
    expect(ticks).toBeGreaterThan(10);
    expect(snapshot).not.toHaveProperty('recordings');
  } finally {
    clearInterval(heartbeat);
  }
});
