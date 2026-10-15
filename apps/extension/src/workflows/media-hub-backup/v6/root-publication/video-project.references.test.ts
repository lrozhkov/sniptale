import { createCameraFollowSettings } from '../../../../features/video/project/camera/cursor-policy';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
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

it('restores selected backup after deleting a secondary recording and its authoring', async () => {
  const { createVideoProjectFromRecording, createVideoProjectAsset } =
    await import('../../../../features/video/project/factories/creation');
  const { createVideoClipFromAsset } =
    await import('../../../../features/video/project/factories/clip');
  const { VideoProjectAssetType } = await import('../../../../features/video/project/types');
  const { removeVideoProjectLibrarySources } =
    await import('../../../../features/video/project/library-source-removal');
  const { collectVideoProjectReferences } =
    await import('../../../../composition/persistence/library-lifecycle/references');
  const { parsePortableVideoProjectMetadata, decodePortableVideoProjectAssetRefs } =
    await import('../root-codecs/projects');
  const { parseHydratableVideoProject } =
    await import('../../../../features/video/project/validation/root');
  const { transformPortableVideoProjectReferences } = await import('./video-project-references');
  const project = createVideoProjectFromRecording({
    recordingId: 'kept',
    filename: 'kept.webm',
    width: 100,
    height: 100,
    duration: 5,
    mimeType: 'video/webm',
    size: 100,
    recordingSignals: [],
  });
  const asset = createVideoProjectAsset(
    'Removed',
    VideoProjectAssetType.VIDEO,
    { kind: 'recording', recordingId: 'removed' },
    project.assets[0]!.metadata
  );
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 100, 100);
  if (clip.type !== 'VIDEO' || !clip.sourceInstanceId) throw new Error('Expected source instance');
  project.assets.push(asset);
  project.clips.push(clip);
  project.actionFeedback!.push({
    recordingId: 'removed',
    sourceInstanceId: clip.sourceInstanceId,
    settings: [],
    signals: [],
  });
  project.cursorFocusPath = {
    version: 1,
    mode: 'follow',
    smoothing: 0.5,
    sensitivity: 0.5,
    gapPolicy: 'hold',
    segments: [
      {
        id: 'removed',
        binding: {
          kind: 'recording-source',
          recordingId: 'removed',
          sourceInstanceId: clip.sourceInstanceId,
        },
        start: 0,
        end: 5,
        keys: [{ id: 'key', time: 1, x: 0.2, y: 0.3, anchor: 'manual', interpolation: 'smooth' }],
      },
    ],
  };
  const retained = removeVideoProjectLibrarySources(project, [
    { kind: 'recording', recordingId: 'removed' },
  ]);
  const base = createVideoProjectEntryWithMediaClip();
  const entry = { ...base, id: retained.id, project: retained };
  const references = collectVideoProjectReferences(entry);
  expect([...references.recordingIds]).toEqual(['kept']);
  const portable = parsePortableVideoProjectMetadata(
    JSON.parse(
      JSON.stringify({
        entry: { ...entry, project: encodePortableVideoProjectAssetRefs(retained) },
        projectAssets: [],
        projectExports: [],
      })
    )
  );
  const decoded = parseHydratableVideoProject(
    decodePortableVideoProjectAssetRefs({ ...portable.entry.project, effectSnapshots: [] })
  );
  if (!decoded) throw new Error('Expected portable admission');
  const rootMap = Object.fromEntries(
    [...references.recordingIds].map((id) => [
      `media:library-item:recording:${id}`,
      `recording:restored-${id}`,
    ])
  );
  const restored = transformPortableVideoProjectReferences(decoded, new Map(), rootMap, {});
  expect(parseHydratableVideoProject(restored)).not.toBeNull();
  expect(restored.actionFeedback?.map((group) => group.recordingId)).toEqual(['restored-kept']);
  expect(restored.cursorFocusPath?.segments).toEqual([]);
  expect(project.actionFeedback).toHaveLength(2);
});

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

it('keeps authored source path and audible feedback attached to duplicated recording identities', async () => {
  const { createVideoProjectFromRecording } =
    await import('../../../../features/video/project/factories/creation');
  const { buildProjectActionAudioPlan } =
    await import('../../../../features/video/review/project-action-audio');
  const { transformPortableVideoProjectReferences } = await import('./video-project-references');
  const { resolveProjectCursorFocusSamples } =
    await import('../../../../features/video/project/cursor-focus-path/projection');
  const project = createVideoProjectFromRecording({
    recordingId: 'old',
    filename: 'old.webm',
    width: 1280,
    height: 720,
    duration: 4,
    mimeType: 'video/webm',
    size: 1024,
    recordingSignals: [],
    sourceNormalizedActionEvents: [
      {
        id: 'click',
        kind: 'CLICK',
        time: 1,
        duration: 0.45,
        point: { x: 0.2, y: 0.3 },
        label: 'Click',
        preset: 'CLICK_RIPPLE',
        data: {},
      },
    ],
  });
  const group = project.actionFeedback![0]!;
  group.settings = [
    {
      ref: { kind: 'action', id: 'click' },
      enabled: true,
      presetId: 'mouse-classic-v1',
      volume: 0.35,
      offset: 0,
    },
  ];
  project.cursorFocusPath = {
    version: 1,
    mode: 'follow',
    smoothing: 0.5,
    sensitivity: 0.5,
    gapPolicy: 'hold',
    segments: [
      {
        id: 'segment',
        binding: {
          kind: 'recording-source',
          recordingId: 'old',
          sourceInstanceId: group.sourceInstanceId,
        },
        start: 0,
        end: 4,
        keys: [{ id: 'key', time: 1, x: 0.2, y: 0.3, anchor: 'manual', interpolation: 'smooth' }],
      },
    ],
  };
  const original = structuredClone(project);
  const restored = transformPortableVideoProjectReferences(
    project,
    new Map(),
    { 'media:library-item:recording:old': 'recording:new' },
    {}
  );
  expect(buildProjectActionAudioPlan(original).descriptors).toHaveLength(1);
  expect(buildProjectActionAudioPlan(restored).descriptors).toHaveLength(1);
  expect(restored.actionFeedback?.[0]?.recordingId).toBe('new');
  expect(resolveProjectCursorFocusSamples(restored)[0]?.sourceAnchor?.recordingId).toBe('new');
  expect(project).toEqual(original);
  expect(() => transformPortableVideoProjectReferences(project, new Map(), {}, {})).toThrow(
    'unresolved'
  );
});

it('requires the new project discriminator for authored interaction branches', async () => {
  const { createEmptyVideoProject } =
    await import('../../../../features/video/project/factories/creation');
  const { parseHydratableVideoProject } =
    await import('../../../../features/video/project/validation/root');
  const { applyVideoProjectMutationPatch } =
    await import('../../../../features/video/project/mutation');
  const legacy = createEmptyVideoProject();
  expect(legacy.version).toBe(2);
  expect(parseHydratableVideoProject(legacy)).not.toBeNull();
  const authored = applyVideoProjectMutationPatch(legacy, { actionFeedback: [] });
  expect(authored.version).toBe(3);
  expect(parseHydratableVideoProject(authored)?.version).toBe(3);
  expect(parseHydratableVideoProject({ ...authored, version: 2 })).toBeNull();
});

it('keeps one editable captured-key override through Gallery handoff and portable restore', async () => {
  const { createVideoProjectFromRecording } =
    await import('../../../../features/video/project/factories/creation');
  const { createVideoProjectCursorTrack } =
    await import('../../../../features/video/project/defaults');
  const { createQuickEditAdvancedContent } =
    await import('../../../../features/video/review/advanced/defaults');
  const { deriveReviewCursorFocusPath } =
    await import('../../../../features/video/review/advanced/cursor-focus-path');
  const { applyRecordingReviewInteractions } =
    await import('../../../../features/video/review/standalone-interactions');
  const { updateCursorFocusKey, authoredCursorFocusPath, cursorFocusOverrideId } =
    await import('../../../../features/video/project/cursor-focus-path/authoring');
  const { resolveProjectCursorFocusPath } =
    await import('../../../../features/video/project/cursor-focus-path/projection');
  const { transformPortableVideoProjectReferences } = await import('./video-project-references');
  const { parsePortableVideoProjectMetadata, decodePortableVideoProjectAssetRefs } =
    await import('../root-codecs/projects');
  const { parseHydratableVideoProject } =
    await import('../../../../features/video/project/validation/root');
  const track = createVideoProjectCursorTrack('embedded-fallback');
  track.samples = [0, 4].map((time, index) => ({
    id: `sample:${index}`,
    time,
    x: 256,
    y: 216,
    visible: true,
    observation: 'observed' as const,
    captureSegment: 0,
    recordingPoint: { x: 0.2, y: 0.3 },
  }));
  const action = {
    id: 'source-click',
    kind: 'CLICK' as const,
    time: 1,
    duration: 0.45,
    point: { x: 256, y: 216 },
    recordingPoint: { x: 0.2, y: 0.3 },
    label: '',
    preset: 'CLICK_RIPPLE' as const,
    data: { button: 0, downTime: 1, upTime: 1.1, pressDuration: 0.1, completion: 'released' },
  };
  const facts = structuredClone({ cursorTrack: track, actionEvents: [action], signals: [] });
  const original = createVideoProjectFromRecording({
    recordingId: 'old',
    filename: 'source.webm',
    width: 1280,
    height: 720,
    duration: 4,
    mimeType: 'video/webm',
    size: 4,
    cursorTrack: track,
    recordingSignals: [],
    sourceNormalizedActionEvents: [{ ...action, point: action.recordingPoint }],
  });
  const content = createQuickEditAdvancedContent();
  content.cursorFocusPath = authoredCursorFocusPath(
    updateCursorFocusKey(
      deriveReviewCursorFocusPath(facts, { width: 1280, height: 720, duration: 4 }),
      'click:source-click',
      { x: 0.6, y: 0.7 }
    )
  );
  const handed = applyRecordingReviewInteractions(original, 'old', content);
  const portable = parsePortableVideoProjectMetadata(
    JSON.parse(
      JSON.stringify({
        entry: {
          id: handed.id,
          createdAt: handed.createdAt,
          updatedAt: handed.updatedAt,
          workspaceRevision: 1,
          project: encodePortableVideoProjectAssetRefs(handed),
        },
        projectAssets: [],
        projectExports: [],
      })
    )
  );
  const decoded = parseHydratableVideoProject(
    decodePortableVideoProjectAssetRefs({ ...portable.entry.project, effectSnapshots: [] })
  );
  if (!decoded) throw new Error('Portable project fixture was not admitted');
  const restored = transformPortableVideoProjectReferences(
    decoded,
    new Map(),
    { 'media:library-item:recording:old': 'recording:new' },
    {}
  );
  expect(parseHydratableVideoProject(restored)).not.toBeNull();
  const capturedId = `click:${restored.actionEvents[0]!.id}`;
  const overrideId = cursorFocusOverrideId(capturedId);
  const edited = updateCursorFocusKey(resolveProjectCursorFocusPath(restored), capturedId, {
    x: 0.8,
  });
  const overrides = edited.segments
    .flatMap((segment) => segment.keys)
    .filter((key) => key.id.startsWith('focus-override:'));
  expect(overrides).toHaveLength(1);
  expect(overrides[0]).toMatchObject({ id: overrideId, x: 0.8, y: 0.7 });
  expect(restored.actionEvents[0]?.data).toEqual(handed.actionEvents[0]?.data);
  expect(restored.cursorTrack).toEqual({
    ...handed.cursorTrack,
    samples: handed.cursorTrack!.samples.map((sample) => ({
      ...sample,
      sourceAnchor:
        sample.sourceAnchor?.kind === 'recording-source'
          ? { ...sample.sourceAnchor, recordingId: 'new' }
          : sample.sourceAnchor,
    })),
  });
  expect({ cursorTrack: track, actionEvents: [action], signals: [] }).toEqual(facts);
  expect(handed.cursorFocusPath?.segments[0]?.binding).toMatchObject({ recordingId: 'old' });
});

it('retains camera defaults and overrides through portable backup admission and reference remapping', async () => {
  const { parsePortableVideoProjectMetadata, decodePortableVideoProjectAssetRefs } =
    await import('../root-codecs/projects');
  const { parseHydratableVideoProject } =
    await import('../../../../features/video/project/validation/root');
  const { transformPortableVideoProjectReferences } = await import('./video-project-references');
  const entry = createVideoProjectEntryWithMediaClip();
  const project = entry.project;
  project.version = 4;
  project.cameraFollowDefaults = createCameraFollowSettings('calm');
  project.motionRegions = [
    {
      ...createVideoProjectMotionRegion(project, 0),
      cameraFollow: createCameraFollowSettings('fast'),
    },
  ];
  const before = structuredClone(project);
  const portable = parsePortableVideoProjectMetadata(
    JSON.parse(
      JSON.stringify({
        entry: { ...entry, project: encodePortableVideoProjectAssetRefs(project) },
        projectAssets: [portableProjectAsset('project-asset-1')],
        projectExports: [],
      })
    )
  );
  const decoded = parseHydratableVideoProject(
    decodePortableVideoProjectAssetRefs({ ...portable.entry.project, effectSnapshots: [] })
  );
  if (!decoded) throw new Error('Expected camera backup admission');
  const restored = transformPortableVideoProjectReferences(
    decoded,
    new Map([['project-asset-1', 'restored-asset']]),
    { 'media:library-item:recording:recording-1': 'recording:restored-recording' },
    {}
  );
  expect(restored.cameraFollowDefaults).toEqual(project.cameraFollowDefaults);
  expect(restored.motionRegions?.[0]?.cameraFollow).toEqual(project.motionRegions[0]!.cameraFollow);
  expect(restored.version).toBe(4);
  expect(project).toEqual(before);
});
