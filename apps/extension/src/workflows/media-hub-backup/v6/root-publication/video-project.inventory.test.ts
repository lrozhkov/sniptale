import { beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectEntryWithMediaClip } from '../../../../composition/persistence/projects/index.test-support';
import { encodePortableVideoProjectAssetRefs } from '../root-codecs/projects';

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), checkpoint: vi.fn() }));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.mutate,
}));
vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  appendCommittedArchiveRootInTransaction: mocks.checkpoint,
}));
import { videoProjectRootPublisher } from './video-project';

beforeEach(() => vi.clearAllMocks());

type PublishArgs = Parameters<typeof videoProjectRootPublisher.publish>[0];

function portableMetadata(value: unknown): PublishArgs['envelope']['metadata'] {
  return JSON.parse(JSON.stringify(value)) as PublishArgs['envelope']['metadata'];
}

function publishArgs(
  metadata: PublishArgs['envelope']['metadata'],
  staged: PublishArgs['staged'] = []
): PublishArgs {
  return {
    envelope: {
      descriptor: {
        rootKind: 'video-project',
        rootId: 'p',
        metadataPath: '_sniptale/metadata/projects/p.json',
        objectCount: staged.length,
        totalBytes: staged.reduce((total, object) => total + object.ref.size, 0),
      },
      metadata,
      objects: [],
    },
    journal: {
      assetRefs: [],
      createdAt: 1,
      domain: 'archive-restore' as const,
      journalId: 'j',
      payload: {},
    },
    session: {
      archiveFingerprint: 'a'.repeat(64),
      childIdMap: {},
      committedRoots: [],
      conflictedRoots: [],
      createdAt: 1,
      currentRoot: 'video-project:p',
      kind: 'archive-restore-session' as const,
      operationId: 'restore',
      rootIdMap: {},
      skippedRoots: [],
      status: 'pending' as const,
      strategy: 'duplicate' as const,
      updatedAt: 1,
    },
    staged,
  };
}

function stagedObject(objectId: string, assetId: string) {
  return {
    objectId,
    ref: {
      assetId,
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
      mimeType: 'video/webm',
      sha256: null,
      size: 6,
    },
  };
}

function portableProjectAsset(id: string, objectId = `o-${id}`) {
  return {
    entry: { id, mimeType: 'video/webm', createdAt: 1, size: 6 },
    filename: `${id}.webm`,
    objectId,
  };
}

function portableMetadataWithProjectAssets(
  sourceIds: string[],
  projectAssets = sourceIds.map((id) => portableProjectAsset(id))
) {
  const base = createVideoProjectEntryWithMediaClip();
  return portableMetadata({
    entry: {
      ...base,
      id: 'p',
      project: encodePortableVideoProjectAssetRefs({
        ...base.project,
        id: 'p',
        assets: sourceIds.map((projectAssetId, index) => ({
          ...base.project.assets[0]!,
          id: index === 0 ? base.project.assets[0]!.id : `internal-${index}`,
          source: { kind: 'project-asset', projectAssetId },
        })),
      }),
    },
    projectAssets,
    projectExports: [],
  });
}

function portableRecovery(recoveryV1: string) {
  return {
    schemaVersion: 2,
    ui: {
      mode: 'advanced',
      tracks: { actions: true, zoom: false, audio: true },
      overlaysVisible: true,
    },
    zoom: { enabled: false, regions: [] },
    background: { enabled: false },
    audio: {
      original: { muted: false, volume: 1 },
      voiceover: [],
      music: [],
    },
    recoveryV1,
  };
}

it('rejects an unresolved recovery reference before opening the publication transaction', async () => {
  const base = createVideoProjectEntryWithMediaClip();
  const metadata = {
    entry: {
      ...base,
      id: 'p',
      project: encodePortableVideoProjectAssetRefs({ ...base.project, id: 'p' }),
    },
    projectAssets: [
      {
        entry: { id: 'project-asset-1', mimeType: 'video/webm', createdAt: 1, size: 6 },
        filename: 'take.webm',
        objectId: 'o-video',
        videoReview: {
          workspace: {
            aggregateId: 'project-asset:project-asset-1',
            formatVersion: 1,
            source: { duration: 2, width: 640, height: 360, size: 6, mimeType: 'video/webm' },
            revision: 1,
            cursor: 0,
            history: [],
            createdAt: 1,
            updatedAt: 2,
            advanced: portableRecovery(
              JSON.stringify({
                background: {
                  enabled: true,
                  type: 'image',
                  assetRef: 'project-asset:not-in-inventory',
                  imageFit: 'cover',
                  layout: { padding: 0, cornerRadius: 0 },
                },
              })
            ),
          },
          draft: null,
        },
      },
    ],
    projectExports: [],
  };

  await expect(
    videoProjectRootPublisher.publish(
      publishArgs(portableMetadata(metadata), [stagedObject('o-video', 'new-video-local')])
    )
  ).rejects.toThrow('Portable video project asset inventory is inconsistent.');
  expect(mocks.mutate).not.toHaveBeenCalled();
  expect(mocks.checkpoint).not.toHaveBeenCalled();
});

it.each([
  {
    label: 'duplicate entry ids',
    metadata: portableMetadataWithProjectAssets(
      ['project-asset-1'],
      [
        portableProjectAsset('project-asset-1', 'o-first'),
        portableProjectAsset('project-asset-1', 'o-second'),
      ]
    ),
  },
  {
    label: 'duplicate object ids',
    metadata: portableMetadataWithProjectAssets(
      ['project-asset-1', 'project-asset-2'],
      [
        portableProjectAsset('project-asset-1', 'o-shared'),
        portableProjectAsset('project-asset-2', 'o-shared'),
      ]
    ),
  },
  {
    label: 'extra entries',
    metadata: portableMetadataWithProjectAssets(
      ['project-asset-1'],
      [portableProjectAsset('project-asset-1'), portableProjectAsset('extra')]
    ),
  },
  {
    label: 'omitted entries',
    metadata: portableMetadataWithProjectAssets(['project-asset-1'], []),
  },
])('rejects $label before opening a publication transaction', async ({ metadata }) => {
  await expect(videoProjectRootPublisher.publish(publishArgs(metadata))).rejects.toThrow(
    'Portable video project asset inventory is inconsistent.'
  );
  expect(mocks.mutate).not.toHaveBeenCalled();
  expect(mocks.checkpoint).not.toHaveBeenCalled();
});
