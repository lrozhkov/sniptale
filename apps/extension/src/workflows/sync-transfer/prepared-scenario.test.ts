import { expect, it } from 'vitest';
import { createGuideProject } from '../../features/scenario/project/factories';
import { createScenarioProjectEntry } from '../../composition/persistence/scenario/projects/entry';
import { encodePortableScenarioProjectEntry } from '../media-hub-backup/v6/root-codecs/projects';
import {
  parsePortableSyncRoot,
  portableSyncDependencyIds,
  portableSyncEditingObjectIds,
} from './prepared-root';

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

it('omits Scenario thumbnails without removing a shared authored child object', async () => {
  const source = envelope();
  const root = await parsePortableSyncRoot({
    ...source,
    metadata: {
      ...source.metadata,
      thumbnail: { objectId: 'body', createdAt: 1, updatedAt: 1, width: 10, height: 10 },
      exportThumbnails: [],
      presentation: {
        entry: {
          aggregateId: source.metadata.entry.id,
          aggregateKind: 'scenario',
          presentationRevision: 0,
          updatedAt: 1,
        },
        thumbnailObjectId: 'preview',
      },
    },
    descriptor: { ...source.descriptor, objectCount: 2, totalBytes: 10 },
    objects: [
      ...source.objects,
      {
        ...source.objects[0],
        objectId: 'preview',
        path: '_sniptale/assets/preview/preview.png',
        filename: 'preview.png',
      },
    ],
  });
  expect(portableSyncEditingObjectIds(root, undefined, true)).toEqual(['body']);
  expect(portableSyncEditingObjectIds(root)).toEqual(['body', 'preview']);
});

it('excludes saved HTML from Scenario editing closure independently of disposable presentation', async () => {
  const source = envelope();
  const root = await parsePortableSyncRoot({
    ...source,
    descriptor: { ...source.descriptor, objectCount: 2, totalBytes: 9 },
    metadata: {
      ...source.metadata,
      exports: [
        {
          id: 'saved',
          projectId: 'guide',
          filename: 'saved.html',
          format: 'html',
          size: 4,
          createdAt: 1,
          html: { mode: 'guide', objectId: 'saved-body' },
        },
      ],
    },
    objects: [
      ...source.objects,
      {
        objectId: 'saved-body',
        path: 'Scenarios/guide/saved.html',
        filename: 'saved.html',
        mimeType: 'text/html',
        size: 4,
      },
    ],
  });
  expect(portableSyncEditingObjectIds(root)).toEqual(['body']);
  expect(portableSyncEditingObjectIds(root, undefined, true)).toEqual(['body']);
  expect(root.envelope.objects).toHaveLength(2);
});

it('still validates saved HTML object inventory before removing it from editing reads', async () => {
  const source = envelope();
  await expect(
    parsePortableSyncRoot({
      ...source,
      descriptor: { ...source.descriptor, objectCount: 2, totalBytes: 9 },
      metadata: {
        ...source.metadata,
        exports: [
          {
            id: 'saved',
            projectId: 'guide',
            filename: 'saved.html',
            format: 'html',
            size: 4,
            createdAt: 1,
            html: { mode: 'guide', objectId: 'saved-body' },
          },
        ],
      },
      objects: [
        ...source.objects,
        {
          objectId: 'saved-body',
          path: 'Scenarios/guide/saved.html',
          filename: 'saved.html',
          mimeType: 'image/png',
          size: 4,
        },
      ],
    })
  ).rejects.toThrow();
});
