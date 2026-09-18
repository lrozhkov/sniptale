import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveReviewAssetBytes } from './asset-bytes';

const storeMocks = vi.hoisted(() => ({ getProjectAsset: vi.fn() }));
vi.mock('../../composition/persistence/projects', () => ({
  getProjectAsset: storeMocks.getProjectAsset,
}));

describe('resolveReviewAssetBytes', () => {
  afterEach(() => vi.clearAllMocks());

  it('reads ready project assets and refuses missing ones', async () => {
    const file = new Blob();
    storeMocks.getProjectAsset.mockImplementation(async (id: string) =>
      id === 'known' ? { status: 'ready', entry: { file } } : { status: 'not-found' }
    );
    await expect(resolveReviewAssetBytes('recording:other')).resolves.toBeNull();
    await expect(resolveReviewAssetBytes('project-asset:known')).resolves.toBe(file);
    await expect(resolveReviewAssetBytes('project-asset:missing')).resolves.toBeNull();
    expect(storeMocks.getProjectAsset.mock.calls.map((call) => call[0])).toEqual([
      'known',
      'missing',
    ]);
  });
});
