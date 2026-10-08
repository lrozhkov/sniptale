import { beforeEach, expect, it, vi } from 'vitest';
import { createMediaLibraryEntry, createProjectExportEntry } from './index.storage.test-support';
import { betaV1Fixture } from '../infrastructure/indexed-db/fixtures/beta-v1';
import type { MediaAssetSource } from '../media-library/contracts';
const harness = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: harness.database,
}));
import { readLibrarySceneSource } from './library-scene-source';
const ref = {
  assetId: 'scene-bytes',
  createdAt: 1,
  size: 15,
  mimeType: 'video/webm',
  sha256: null,
  location: { kind: 'opfs', objectKey: 'objects/scene-bytes' },
};
let rows: Map<string, Map<string, unknown>>;
beforeEach(() => {
  rows = new Map(
    ['media_library', 'project_assets', 'project_exports', 'recordings', 'asset_refs'].map(
      (name) => [name, new Map()]
    )
  );
  rows.get('asset_refs')!.set(ref.assetId, ref);
  harness.database.mockResolvedValue({
    transaction: () => ({
      objectStore: (name: string) => ({ get: async (id: string) => rows.get(name)!.get(id) }),
      done: Promise.resolve(),
    }),
  });
});

it.each<MediaAssetSource>([
  { kind: 'stored-asset', assetId: ref.assetId },
  { kind: 'project-asset', projectAssetId: 'scene' },
  { kind: 'recording', recordingId: 'scene' },
  { kind: 'project-export', exportId: 'scene', projectId: 'project' },
])(
  'resolves immutable $kind identity and rejects replaced or trashed source metadata',
  async (source) => {
    const media = createMediaLibraryEntry({
      id: 'scene-media',
      kind:
        source.kind === 'recording'
          ? 'recording'
          : source.kind === 'project-export'
            ? 'export'
            : 'video',
      mimeType: ref.mimeType,
      size: ref.size,
      source,
    });
    rows.get('media_library')!.set(media.id, media);
    rows.get('project_assets')!.set('scene', {
      id: 'scene',
      assetId: ref.assetId,
      createdAt: 1,
      size: ref.size,
      mimeType: ref.mimeType,
    });
    rows.get('recordings')!.set('scene', {
      ...betaV1Fixture.records.recordings[0],
      id: 'scene',
      assetId: ref.assetId,
      size: ref.size,
      mimeType: ref.mimeType,
    });
    rows.get('project_exports')!.set(
      'scene',
      createProjectExportEntry({
        id: 'scene',
        projectId: 'project',
        assetId: ref.assetId,
        size: ref.size,
        mimeType: ref.mimeType,
      })
    );
    const selected = await readLibrarySceneSource(media.id, 'video');
    expect(selected.ref).toEqual(ref);
    expect(selected.entry?.id ?? null).toBe(source.kind === 'project-asset' ? 'scene' : null);
    await expect(readLibrarySceneSource(media.id, 'image')).rejects.toMatchObject({
      code: 'unavailable',
    });
    rows.get('asset_refs')!.set(ref.assetId, { ...ref, size: ref.size + 1 });
    await expect(readLibrarySceneSource(media.id, 'video')).rejects.toMatchObject({
      code: 'unavailable',
    });
    rows.get('asset_refs')!.set(ref.assetId, ref);
    rows
      .get('media_library')!
      .set(media.id, { ...media, lifecycle: { trashedAt: 2, revision: 1 } });
    await expect(readLibrarySceneSource(media.id, 'video')).rejects.toMatchObject({
      code: 'unavailable',
    });
  }
);
