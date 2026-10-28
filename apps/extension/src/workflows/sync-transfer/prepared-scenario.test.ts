import { expect, it } from 'vitest';
import { createGuideProject } from '../../features/scenario/project/factories';
import { createScenarioProjectEntry } from '../../composition/persistence/scenario/projects/entry';
import { encodePortableScenarioProjectEntry } from '../media-hub-backup/v6/root-codecs/projects';
import { parsePortableSyncRoot, portableSyncDependencyIds } from './prepared-root';

function envelope(borrowedMediaId?: string) {
  const project = createGuideProject('Portable Guide', 'guide', 1);
  return {
    descriptor: {
      rootKind: 'scenario-project',
      rootId: project.id,
      metadataPath: 'Metadata/sync-root.json',
      objectCount: 1,
      totalBytes: 5,
    },
    metadata: {
      entry: encodePortableScenarioProjectEntry(
        createScenarioProjectEntry({ project, existing: undefined, updatedAt: 2 })
      ),
      assets: [
        {
          entry: {
            id: 'child',
            projectId: project.id,
            galleryAssetId: borrowedMediaId ?? null,
            ...(borrowedMediaId ? { borrowedMediaId } : {}),
            mimeType: 'image/png',
            width: 10,
            height: 10,
            createdAt: 1,
            size: 5,
          },
          objectId: 'body',
        },
      ],
      stepDocuments: [],
      exports: [],
      exportThumbnails: [],
    },
    objects: [
      {
        objectId: 'body',
        path: '_sniptale/assets/body/body.png',
        filename: 'body.png',
        mimeType: 'image/png',
        size: 5,
      },
    ],
  };
}

it('keeps an absent owned Library mirror private and accepts only its exact optional canonical identity', async () => {
  const root = await parsePortableSyncRoot(envelope());
  expect(portableSyncDependencyIds(root)).toEqual([]);
  expect(portableSyncDependencyIds(root, ['scenario-asset:child'])).toEqual([
    'scenario-asset:child',
  ]);
  expect(() => portableSyncDependencyIds(root, ['scenario-asset:foreign'])).toThrow();
  expect(() => portableSyncDependencyIds(root, ['recording:foreign'])).toThrow();
});

it('requires an explicit borrowed source and does not replace it with an owned-mirror declaration', async () => {
  const root = await parsePortableSyncRoot(envelope('project-asset:borrowed'));
  expect(portableSyncDependencyIds(root, [])).toEqual(['project-asset:borrowed']);
  expect(() => portableSyncDependencyIds(root, ['scenario-asset:child'])).toThrow();
});

it('refuses wrong Scenario resource MIME and size before physical object reads', async () => {
  const wrongMime = envelope();
  wrongMime.objects[0]!.mimeType = 'video/webm';
  await expect(parsePortableSyncRoot(wrongMime)).rejects.toThrow();
  const wrongSize = envelope();
  wrongSize.objects[0]!.size = 6;
  wrongSize.descriptor.totalBytes = 6;
  await expect(parsePortableSyncRoot(wrongSize)).rejects.toThrow();
});
