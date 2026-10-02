import { beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectEntryWithMediaClip } from '../../../../composition/persistence/projects/index.test-support';
import { encodePortableVideoProjectAssetRefs } from '../root-codecs/projects';

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), checkpoint: vi.fn(), database: vi.fn() }));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.mutate,
}));
vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  appendCommittedArchiveRootInTransaction: mocks.checkpoint,
  readAssetFile: vi.fn(async () => new File(['source'], 'source.webm', { type: 'video/webm' })),
}));
vi.mock(
  '../../../../composition/persistence/infrastructure/indexed-db/core',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/infrastructure/indexed-db/core')
    >()),
    initDB: () => mocks.database(),
  })
);
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
    get: async (_key?: IDBValidKey): Promise<unknown> => undefined,
    getAll: async () => [],
    put: async (value: unknown) => {
      values.set(name, [...(values.get(name) ?? []), value]);
    },
    delete: async () => undefined,
    index: () => ({ getAll: async () => [], count: async () => 0 }),
  });
  return {
    get: async (_name?: string, _key?: IDBValidKey): Promise<unknown> => undefined,
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
  source.originMediaId = 'original-image';
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
        'media:library-item:original-image': 'restored-image',
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
    originMediaId: 'restored-image',
  });
  expect(assets[0]!.id).not.toBe('project-asset-1');
});

it('restores a project resource using its already restored Library identity', async () => {
  const { createMediaLibraryEntry } =
    await import('../../../../composition/persistence/projects/index.test-support');
  const values = new Map<string, unknown[]>();
  const db = publisherDatabase(values);
  const ref = stagedObject('shared', 'shared-bytes', 'video/webm', 6).ref;
  const media = createMediaLibraryEntry({
    id: 'project-asset:restored',
    source: { kind: 'project-asset', projectAssetId: 'restored' },
    size: 6,
  });
  db.get = async (name?: string) =>
    name === 'media_library'
      ? media
      : name === 'project_assets'
        ? { id: 'restored', assetId: ref.assetId, mimeType: 'video/webm', size: 6, createdAt: 1 }
        : name === 'asset_refs'
          ? ref
          : undefined;
  const transaction = db.transaction;
  db.transaction = () => {
    const tx = transaction();
    return {
      ...tx,
      objectStore: (name: string) => ({
        ...tx.objectStore(name),
        get: (key?: IDBValidKey) => db.get(name, key),
      }),
    };
  };
  mocks.database.mockReturnValue(db);
  mocks.mutate.mockImplementation(async (callback) => callback(db));
  const base = createVideoProjectEntryWithMediaClip();
  const metadata = portableMetadata({
    entry: { ...base, project: encodePortableVideoProjectAssetRefs(base.project) },
    projectExports: [],
    projectAssets: [
      {
        ...portableProjectAsset('project-asset-1'),
        libraryMediaId: 'project-asset:project-asset-1',
      },
    ],
  });
  await videoProjectRootPublisher.publish(
    publishArgs(metadata, [stagedObject('o-project-asset-1', 'nested-bytes', 'video/webm', 6)], {
      'media:library-item:project-asset:project-asset-1': media.id,
    })
  );
  expect(values.get('media_library')).toBeUndefined();
  expect(values.get('project_assets')).toBeUndefined();
  const saved = values.get('video_projects') as Array<{
    project: { assets: Array<{ source: { projectAssetId: string } }> };
  }>;
  expect(saved[0]!.project.assets[0]!.source.projectAssetId).toBe('restored');
});
