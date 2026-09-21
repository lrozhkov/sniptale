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

function restoreSession(
  rootIdMap: Record<string, string> = {},
  childIdMap: Record<string, string> = {}
) {
  return {
    archiveFingerprint: 'a'.repeat(64),
    childIdMap,
    committedRoots: [],
    conflictedRoots: [],
    createdAt: 1,
    currentRoot: 'video-project:p',
    kind: 'archive-restore-session' as const,
    operationId: 'restore',
    rootIdMap,
    skippedRoots: [],
    status: 'pending' as const,
    strategy: 'duplicate' as const,
    updatedAt: 1,
  };
}

function restoreJournal() {
  return {
    assetRefs: [],
    createdAt: 1,
    domain: 'archive-restore' as const,
    journalId: 'j',
    payload: {},
  };
}

function publisherDatabase(values: Map<string, unknown[]> = new Map()) {
  const store = (name: string) => ({
    get: async () => undefined,
    getAll: async () => [],
    put: async (value: unknown) => {
      values.set(name, [...(values.get(name) ?? []), value]);
    },
    delete: async () => undefined,
    index: () => ({ getAll: async () => [], count: async () => 0 }),
  });
  return {
    get: async () => undefined,
    transaction: () => ({ objectStore: store, done: Promise.resolve() }),
  };
}

type PublishArgs = Parameters<typeof videoProjectRootPublisher.publish>[0];
type ExternalAssetSource = ReturnType<
  typeof createVideoProjectEntryWithMediaClip
>['project']['assets'][number]['source'];

function portableMetadata(value: unknown): PublishArgs['envelope']['metadata'] {
  return JSON.parse(JSON.stringify(value)) as PublishArgs['envelope']['metadata'];
}

function publishArgs(
  metadata: PublishArgs['envelope']['metadata'],
  staged: PublishArgs['staged'] = [],
  rootIdMap: Record<string, string> = {},
  childIdMap: Record<string, string> = {}
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
    journal: restoreJournal(),
    session: restoreSession(rootIdMap, childIdMap),
    staged,
  };
}

function stagedObject(objectId: string, assetId: string, mimeType: string, size: number) {
  return {
    objectId,
    ref: {
      assetId,
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
      mimeType,
      sha256: null,
      size,
    },
  };
}

function portableMetadataWithSource(source: ExternalAssetSource) {
  const base = createVideoProjectEntryWithMediaClip();
  return portableMetadata({
    entry: {
      ...base,
      id: 'p',
      project: encodePortableVideoProjectAssetRefs({
        ...base.project,
        id: 'p',
        assets: [{ ...base.project.assets[0]!, source }],
      }),
    },
    projectAssets: [],
    projectExports: [],
  });
}

function portableProjectAsset(id: string, objectId = `o-${id}`) {
  return {
    entry: { id, mimeType: 'video/webm', createdAt: 1, size: 6 },
    filename: `${id}.webm`,
    objectId,
  };
}

it.each([
  {
    label: 'base recording',
    mutateProject(project: ReturnType<typeof createVideoProjectEntryWithMediaClip>['project']) {
      project.baseRecordingId = 'missing-base';
    },
  },
  {
    label: 'project-asset recording provenance',
    mutateProject(project: ReturnType<typeof createVideoProjectEntryWithMediaClip>['project']) {
      const source = project.assets[0]!.source;
      if (source.kind !== 'project-asset') throw new Error('Test fixture source changed.');
      source.originRecordingId = 'missing-origin';
    },
  },
  {
    label: 'scenario project source',
    mutateProject(project: ReturnType<typeof createVideoProjectEntryWithMediaClip>['project']) {
      project.source = { kind: 'scenario', scenarioProjectId: 'missing-scenario' };
    },
  },
])(
  'rejects an unresolved $label before opening a publication transaction',
  async ({ mutateProject }) => {
    const values = new Map<string, unknown[]>();
    mocks.mutate.mockImplementation(async (callback) => callback(publisherDatabase(values)));
    const base = createVideoProjectEntryWithMediaClip();
    mutateProject(base.project);
    const metadata = portableMetadata({
      entry: {
        ...base,
        id: 'p',
        project: encodePortableVideoProjectAssetRefs({ ...base.project, id: 'p' }),
      },
      projectAssets: [portableProjectAsset('project-asset-1')],
      projectExports: [],
    });

    await expect(
      videoProjectRootPublisher.publish(
        publishArgs(metadata, [stagedObject('o-project-asset-1', 'local', 'video/webm', 6)])
      )
    ).rejects.toThrow('Portable video project source reference is unresolved.');
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(values.size).toBe(0);
    expect(mocks.checkpoint).not.toHaveBeenCalled();
  }
);

it.each([
  {
    label: 'project asset',
    source: { kind: 'project-asset' as const, projectAssetId: 'missing-project-asset' },
    error: 'Portable video project asset inventory is inconsistent.',
  },
  {
    label: 'recording',
    source: { kind: 'recording' as const, recordingId: 'missing-recording' },
    error: 'Portable video project source reference is unresolved.',
  },
  {
    label: 'scenario asset',
    source: { kind: 'scenario-asset' as const, scenarioAssetId: 'missing-scenario-asset' },
    error: 'Portable video project source reference is unresolved.',
  },
])('rejects an unmapped $label source before publication', async ({ source, error }) => {
  const values = new Map<string, unknown[]>();
  mocks.mutate.mockImplementation(async (callback) => callback(publisherDatabase(values)));
  const metadata = portableMetadataWithSource(source);

  await expect(videoProjectRootPublisher.publish(publishArgs(metadata))).rejects.toThrow(error);
  expect(mocks.mutate).not.toHaveBeenCalled();
  expect(values.size).toBe(0);
  expect(mocks.checkpoint).not.toHaveBeenCalled();
});

it('publishes a recording source only after resolving it through the restored root map', async () => {
  const values = new Map<string, unknown[]>();
  mocks.mutate.mockImplementation(async (callback) => callback(publisherDatabase(values)));
  const metadata = portableMetadataWithSource({
    kind: 'recording',
    recordingId: 'source-recording',
  });

  await expect(
    videoProjectRootPublisher.publish(
      publishArgs(metadata, [], {
        'media:library-item:recording:source-recording': 'recording:restored-recording',
      })
    )
  ).resolves.toMatchObject({ imported: true });
  const projects = values.get('video_projects') as Array<{
    project: { assets: Array<{ source: { recordingId: string } }> };
  }>;
  expect(projects[0]!.project.assets[0]!.source.recordingId).toBe('restored-recording');
});

it('publishes scenario project and child sources only after exact restored mappings exist', async () => {
  const values = new Map<string, unknown[]>();
  mocks.mutate.mockImplementation(async (callback) => callback(publisherDatabase(values)));
  const base = createVideoProjectEntryWithMediaClip();
  base.project.source = { kind: 'scenario', scenarioProjectId: 'source-scenario' };
  base.project.assets[0]!.source = {
    kind: 'scenario-asset',
    scenarioAssetId: 'source-scenario-image',
  };
  const metadata = portableMetadataWithSource(base.project.assets[0]!.source);
  const entry = metadata as unknown as { entry: { project: Record<string, unknown> } };
  entry.entry.project = encodePortableVideoProjectAssetRefs({ ...base.project, id: 'p' }) as Record<
    string,
    unknown
  >;

  await expect(
    videoProjectRootPublisher.publish(
      publishArgs(
        metadata,
        [],
        { 'scenario-project:source-scenario': 'restored-scenario' },
        { 'scenario-asset:source-scenario-image': 'restored-scenario-image' }
      )
    )
  ).resolves.toMatchObject({ imported: true });
  const projects = values.get('video_projects') as Array<{
    project: {
      source: { scenarioProjectId: string };
      assets: Array<{ source: { scenarioAssetId: string } }>;
    };
  }>;
  expect(projects[0]!.project.source.scenarioProjectId).toBe('restored-scenario');
  expect(projects[0]!.project.assets[0]!.source.scenarioAssetId).toBe('restored-scenario-image');
});

it('duplicates a project only after remapping project-asset and recording identities', async () => {
  const values = new Map<string, unknown[]>();
  mocks.mutate.mockImplementation(async (callback) => callback(publisherDatabase(values)));
  const base = createVideoProjectEntryWithMediaClip();
  base.project.source = { kind: 'recording', recordingId: 'source-recording' };
  base.project.baseRecordingId = 'base-recording';
  const source = base.project.assets[0]!.source;
  if (source.kind !== 'project-asset') throw new Error('Test fixture source changed.');
  source.originRecordingId = 'origin-recording';
  const metadata = portableMetadata({
    entry: {
      ...base,
      id: 'p',
      project: encodePortableVideoProjectAssetRefs({ ...base.project, id: 'p' }),
    },
    projectAssets: [portableProjectAsset('project-asset-1')],
    projectExports: [],
  });

  await expect(
    videoProjectRootPublisher.publish(
      publishArgs(metadata, [stagedObject('o-project-asset-1', 'local-video', 'video/webm', 6)], {
        'media:library-item:recording:source-recording': 'recording:restored-source',
        'media:library-item:recording:base-recording': 'recording:restored-base',
        'media:library-item:recording:origin-recording': 'recording:restored-origin',
      })
    )
  ).resolves.toMatchObject({ imported: true });
  const projects = values.get('video_projects') as Array<{
    project: {
      source: { recordingId: string };
      baseRecordingId: string;
      assets: Array<{
        source: { projectAssetId: string; originRecordingId: string };
      }>;
    };
  }>;
  const assets = values.get('project_assets') as Array<{ id: string }>;
  expect(projects[0]!.project.source.recordingId).toBe('restored-source');
  expect(projects[0]!.project.baseRecordingId).toBe('restored-base');
  expect(projects[0]!.project.assets[0]!.source).toEqual({
    kind: 'project-asset',
    projectAssetId: assets[0]!.id,
    originRecordingId: 'restored-origin',
  });
  expect(assets[0]!.id).not.toBe('project-asset-1');
});
