import { expect, it, vi } from 'vitest';
import { hasMediaReviewAssetConflict } from './media-review-assets';
import {
  createMediaLibraryEntry,
  createProjectAssetEntry,
} from '../../../../composition/persistence/projects/index.test-support';
const ref = {
  assetId: 'shared-body',
  size: 3,
  mimeType: 'audio/mpeg',
  createdAt: 1,
  sha256: null,
  location: { kind: 'opfs' as const, objectKey: 'objects/shared-body' },
};
const entry = createProjectAssetEntry({
  id: 'shared',
  assetId: ref.assetId,
  size: ref.size,
  mimeType: ref.mimeType,
});
const resource = { entry, ref, filename: 'music.mp3', sourceId: 'old', reusePublished: true };
const stores = () => ({
  projectAssets: { get: vi.fn(async () => undefined as unknown) },
  media: { get: vi.fn(async () => undefined as unknown) },
  refs: { get: vi.fn(async () => undefined as unknown) },
});
it('refuses standalone review sharing deleted between preparation and commit', async () => {
  await expect(hasMediaReviewAssetConflict(stores(), [resource])).rejects.toThrow();
});
it('refuses a private auxiliary whose original material disappeared before commit', async () => {
  await expect(
    hasMediaReviewAssetConflict(stores(), [
      {
        ...resource,
        reusePublished: false,
        publishToLibrary: false,
        entry: { ...entry, originMediaId: 'deleted' },
      },
    ])
  ).rejects.toThrow();
});
it('admits shared review content through unchanged transactional owner rows', async () => {
  const db = stores();
  db.projectAssets.get.mockResolvedValue(entry);
  db.refs.get.mockResolvedValue(ref);
  db.media.get.mockResolvedValue(
    createMediaLibraryEntry({
      id: 'project-asset:shared',
      source: { kind: 'project-asset', projectAssetId: entry.id },
    })
  );
  await expect(hasMediaReviewAssetConflict(db, [resource])).resolves.toBe(false);
});
