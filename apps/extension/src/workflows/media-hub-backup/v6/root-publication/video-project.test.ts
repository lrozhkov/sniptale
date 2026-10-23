import { verifyVideoProjectEffectSnapshotIntegrity } from '../../../../features/video/project/effect-instance/integrity';
import { parseVideoProjectEntry } from '../../../../composition/persistence/projects/read-guards';
import { annotationReviewFixture } from './media.review-assets.test-support';
import { encodePortableReviewAssetRefs } from '../../../../composition/persistence/review-workspaces/asset-refs';
import { materializeWorkspaceStorage } from '../../../../composition/persistence/review-workspaces/storage-format';
import { parseVideoWorkspace } from '../../../../composition/persistence/review-workspaces/parser';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  createVideoProjectEntry,
  createVideoProjectEntryWithMediaClip,
} from '../../../../composition/persistence/projects/index.test-support';
import { assertPortableJson } from '../codec';
import { encodePortableVideoProjectAssetRefs } from '../root-codecs/projects';

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), checkpoint: vi.fn() }));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.mutate,
}));
vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  appendCommittedArchiveRootInTransaction: mocks.checkpoint,
  readAssetFile: vi.fn(),
}));
import { videoProjectRootPublisher } from './video-project';

beforeEach(() => vi.clearAllMocks());

function restoreSession(rootIdMap: Record<string, string> = {}) {
  return {
    archiveFingerprint: 'a'.repeat(64),
    childIdMap: {},
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
    index: () => ({ getAll: async () => [], getAllKeys: async () => [], count: async () => 0 }),
  });
  return {
    get: async () => undefined,
    transaction: () => ({ objectStore: store, done: Promise.resolve() }),
  };
}

function logicalRestoredWorkspaces(values: Map<string, unknown[]>) {
  return (values.get('video_workspaces') ?? []).map((head) => {
    const rows = (values.get('video_workspace_history') ?? []).filter(
      (row) => isRecord(row) && isRecord(head) && row['aggregateId'] === head['aggregateId']
    );
    const workspace = parseVideoWorkspace(materializeWorkspaceStorage(head, rows));
    if (!workspace) throw new Error('Invalid restored review fixture');
    return workspace;
  });
}

type PublishArgs = Parameters<typeof videoProjectRootPublisher.publish>[0];

function publishArgs(
  metadata: PublishArgs['envelope']['metadata'],
  staged: PublishArgs['staged'] = [],
  rootIdMap: Record<string, string> = {}
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
    session: restoreSession(rootIdMap),
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

function portableReviewAdvanced(options: { assetRef?: string; recoveryV1?: string } = {}) {
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
      music: options.assetRef
        ? [
            {
              id: 'm',
              assetRef: options.assetRef,
              timelineStart: 0,
              sourceOffset: 0,
              duration: 2,
              volume: 1,
              muted: false,
              fadeIn: 0,
              fadeOut: 0,
            },
          ]
        : [],
    },
    ...(options.recoveryV1 ? { recoveryV1: options.recoveryV1 } : {}),
  };
}

it.each([
  { explicitMime: true, project: true },
  { explicitMime: false, project: false },
])('duplicates project export/review with explicit MIME=%s', async ({ explicitMime, project }) => {
  const values = new Map<string, unknown[]>();
  mocks.mutate.mockImplementation(async (callback) => callback(publisherDatabase(values)));
  const annotation = { id: 'a', text: 'Point comment', anchor: { kind: 'point', time: 1 } };
  const history = [{ id: 'op', at: 1, target: 'annotation', before: null, after: annotation }];
  const metadata = {
    entry: createVideoProjectEntry({ id: 'p' }, { id: 'p' }),
    projectAssets: [],
    projectExports: [
      {
        entry: {
          id: 'e',
          projectId: 'p',
          createdAt: 1,
          filename: 'result.webm',
          ...(explicitMime ? { mimeType: 'video/webm' } : {}),
          size: 6,
          duration: 2,
          width: 640,
          height: 360,
          fps: 30,
        },
        objectId: 'o',
        videoReview: {
          workspace: {
            aggregateId: 'export:e',
            formatVersion: project ? 3 : 1,
            ...(project
              ? {
                  project: {
                    name: 'Export review',
                    lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 3 },
                  },
                }
              : {}),
            source: { duration: 2, width: 640, height: 360, size: 6, mimeType: 'video/webm' },
            revision: 3,
            cursor: 0,
            history,
            createdAt: 1,
            updatedAt: 2,
          },
          draft: {
            aggregateId: 'export:e',
            revision: 1,
            annotation: { ...annotation, text: 'Recovery' },
            before: null,
            updatedAt: 2,
          },
        },
      },
    ],
  };
  assertPortableJson(metadata);
  const result = await videoProjectRootPublisher.publish(
    publishArgs(metadata, [stagedObject('o', 'new-local', 'video/webm', 6)])
  );
  expect(result.imported).toBe(true);
  expect(values.get('video_workspaces')).toHaveLength(1);
  const workspace = logicalRestoredWorkspaces(values)[0];
  expect(workspace).toMatchObject({ sourceAssetId: 'new-local', history, cursor: 0 });
  expect(workspace?.project).toEqual(
    project
      ? {
          name: 'Export review',
          lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 3 },
        }
      : undefined
  );
  expect(workspace).not.toMatchObject({ aggregateId: 'export:e' });
  expect(values.get('video_workspace_drafts')).toEqual([
    expect.objectContaining({
      aggregateId: expect.stringMatching(/^export:/),
      annotation: { ...annotation, text: 'Recovery' },
    }),
  ]);
  expect(mocks.checkpoint).toHaveBeenCalledOnce();
});

it('duplicates review audio references to the restored asset ids', async () => {
  const values = new Map<string, unknown[]>();
  mocks.mutate.mockImplementation(async (callback) => callback(publisherDatabase(values)));
  const musicAssetId = 'project-asset:music';
  const base = createVideoProjectEntryWithMediaClip();
  const metadata = {
    entry: {
      id: 'p',
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
      workspaceRevision: base.workspaceRevision,
      project: encodePortableVideoProjectAssetRefs({
        ...base.project,
        id: 'p',
      }) as typeof base.project,
    },
    projectAssets: [
      {
        entry: { id: 'music', mimeType: 'audio/mpeg', createdAt: 1, size: 8 },
        filename: 'theme.mp3',
        objectId: 'o-music',
      },
      {
        entry: { id: 'project-asset-1', mimeType: 'video/webm', createdAt: 1, size: 6 },
        filename: 'take.webm',
        objectId: 'o-video',
        videoReview: {
          workspace: {
            aggregateId: 'project-asset:project-asset-1',
            formatVersion: 1,
            source: { duration: 2, width: 640, height: 360, size: 6, mimeType: 'video/webm' },
            revision: 3,
            cursor: 0,
            history: [],
            createdAt: 1,
            updatedAt: 2,
            advanced: portableReviewAdvanced({ assetRef: musicAssetId }),
          },
          draft: null,
        },
      },
    ],
    projectExports: [
      {
        entry: {
          id: 'e',
          projectId: 'p',
          createdAt: 1,
          filename: 'result.webm',
          mimeType: 'video/webm',
          size: 6,
          duration: 2,
          width: 640,
          height: 360,
          fps: 30,
        },
        objectId: 'o-export',
        videoReview: {
          workspace: {
            aggregateId: 'export:e',
            formatVersion: 1,
            source: { duration: 2, width: 640, height: 360, size: 6, mimeType: 'video/webm' },
            revision: 2,
            cursor: 0,
            history: [],
            createdAt: 1,
            updatedAt: 2,
            advanced: portableReviewAdvanced({ assetRef: musicAssetId }),
          },
          draft: null,
        },
      },
    ],
  };
  assertPortableJson(metadata);
  const result = await videoProjectRootPublisher.publish(
    publishArgs(metadata, [
      stagedObject('o-music', 'new-music-local', 'audio/mpeg', 8),
      stagedObject('o-video', 'new-video-local', 'video/webm', 6),
      stagedObject('o-export', 'new-export-local', 'video/webm', 6),
    ])
  );
  expect(result.imported).toBe(true);
  const workspaces = logicalRestoredWorkspaces(values);
  expect(workspaces).toHaveLength(2);
  const restoredMusic = workspaces.map((ws) => ws.advanced.audio.music[0]!.assetId);
  for (const assetId of restoredMusic) {
    expect(assetId).toMatch(/^project-asset:.+/);
    expect(assetId).not.toBe(musicAssetId);
  }
  expect(restoredMusic[0]).toBe(restoredMusic[1]);
  const projects = values.get('video_projects') as Array<{
    project: {
      clips: Array<{ assetId?: string }>;
      assets: Array<{ id: string; source: { projectAssetId: string } }>;
    };
  }>;
  // The internal clip identity is stable; the store linkage is remapped.
  const baseClip = base.project.clips[0] as { assetId: string };
  expect(projects[0]!.project.clips[0]!.assetId).toBe(baseClip.assetId);
  expect(projects[0]!.project.clips[0]!.assetId).toBe(projects[0]!.project.assets[0]!.id);
  expect(projects[0]!.project.assets[0]!.source.projectAssetId).not.toBe('project-asset-1');
  expect(metadata.projectAssets.map((asset) => asset.entry.id).includes('project-asset-1')).toBe(
    true
  );
});

it('duplicates a private representation without recreating a Library card', async () => {
  const values = new Map<string, unknown[]>();
  mocks.mutate.mockImplementation(async (callback) => callback(publisherDatabase(values)));
  const base = createVideoProjectEntryWithMediaClip();
  const metadata = JSON.parse(
    JSON.stringify({
      entry: { ...base, project: encodePortableVideoProjectAssetRefs(base.project) },
      projectAssets: [
        {
          entry: { id: 'project-asset-1', mimeType: 'video/webm', createdAt: 1, size: 6 },
          filename: 'private.webm',
          objectId: 'private',
          publishToLibrary: false,
        },
      ],
      projectExports: [],
    })
  ) as PublishArgs['envelope']['metadata'];
  await videoProjectRootPublisher.publish(
    publishArgs(metadata, [stagedObject('private', 'private-bytes', 'video/webm', 6)])
  );
  expect(values.get('project_assets')).toHaveLength(1);
  expect(values.get('asset_owners')).toHaveLength(1);
  expect(values.get('media_library')).toBeUndefined();
});

it('rolls back promoted recording and parent when the later archive checkpoint fails', async () => {
  const { createMediaLibraryEntry } =
    await import('../../../../composition/persistence/projects/index.test-support');
  const lifecycle = { storageClass: 'temporary' as const, savedAt: null, updatedAt: 1 };
  const recording = {
    id: 'recording',
    assetId: 'bytes',
    filename: 'source.webm',
    mimeType: 'video/webm',
    size: 4,
    createdAt: 1,
    lifecycle,
  };
  const media = createMediaLibraryEntry({
    id: 'recording:recording',
    source: { kind: 'recording', recordingId: recording.id },
    lifecycle,
  });
  const persisted = new Map<string, Map<string, unknown>>([
    ['recordings', new Map([[recording.id, recording]])],
    ['media_library', new Map([[media.id, media]])],
  ]);
  const before = structuredClone(persisted);
  let pending = structuredClone(persisted);
  const abort = vi.fn();
  mocks.mutate.mockImplementation(async (callback) =>
    callback({
      get: async (name: string, key: string) => persisted.get(name)?.get(key),
      transaction: (names: readonly string[]) => {
        let aborted = false;
        pending = structuredClone(persisted);
        return {
          objectStore: (name: string) => {
            if (!names.includes(name)) throw new Error(`Missing transaction store ${name}`);
            if (!pending.has(name)) pending.set(name, new Map());
            const table = pending.get(name)!;
            return {
              get: async (key: string) => table.get(key),
              getAll: async () => [...table.values()],
              put: async (value: { id: string }) => {
                table.set(value.id, structuredClone(value));
              },
              delete: async (key: string) => {
                table.delete(key);
              },
              index: () => ({
                getAll: async () => [],
                getAllKeys: async () => [],
                count: async () => 0,
              }),
            };
          },
          abort: () => {
            aborted = true;
            abort();
          },
          get done() {
            if (!aborted) {
              persisted.clear();
              for (const [name, table] of pending) persisted.set(name, table);
            }
            return Promise.resolve();
          },
        };
      },
    })
  );
  mocks.checkpoint.mockImplementationOnce(async () => {
    expect(pending.get('media_library')!.get(media.id)).toMatchObject({
      lifecycle: { storageClass: 'library' },
    });
    expect(pending.get('recordings')!.get(recording.id)).toMatchObject({
      lifecycle: { storageClass: 'library' },
    });
    expect(pending.get('video_projects')!.size).toBe(1);
    expect(persisted).toEqual(before);
    throw new Error('Late checkpoint rejected');
  });
  const entry = createVideoProjectEntryWithMediaClip({ id: 'p' });
  entry.project.assets[0]!.source = { kind: 'recording', recordingId: recording.id };
  const metadata = {
    entry: { ...entry, project: encodePortableVideoProjectAssetRefs(entry.project) },
    projectAssets: [],
    projectExports: [],
  };
  assertPortableJson(metadata);
  const args = publishArgs(metadata, [], {
    [`media:library-item:${media.id}`]: media.id,
  });
  await expect(videoProjectRootPublisher.publish(args)).rejects.toThrow('Late checkpoint rejected');
  expect(mocks.checkpoint).toHaveBeenCalledOnce();
  expect(abort).toHaveBeenCalledOnce();
  expect(persisted).toEqual(before);
});

it.each(
  (['asset', 'export'] as const).flatMap((kind) =>
    (['source-hash', 'resource-hash', 'valid'] as const).map((mode) => ({ kind, mode }))
  )
)('checks retained annotation before nested $kind restore: $mode', async ({ kind, mode }) => {
  const fixture = await annotationReviewFixture();
  if (mode === 'source-hash')
    fixture.snapshot.source = fixture.snapshot.source.replace(
      'Neutral runtime conformance',
      'Mutated runtime conformance'
    );
  const { readAssetFile } = await import('../../../../composition/persistence/assets');
  const blob =
    mode === 'resource-hash'
      ? new Blob([(await fixture.blob.text()).replace('width="1"', 'width="2"')], {
          type: fixture.blob.type,
        })
      : fixture.blob;
  vi.mocked(readAssetFile).mockImplementation(async (reference) => {
    if (reference.assetId !== 'mark-bytes') throw new Error('Unexpected prepared read');
    return new File([blob], 'mark.svg', { type: blob.type });
  });
  const aggregateId = kind === 'asset' ? 'project-asset:clip' : 'export:e';
  const review = encodePortableReviewAssetRefs({
    ...fixture.review,
    workspace: { ...fixture.review.workspace, aggregateId },
    draft: null,
  });
  const values = new Map<string, unknown[]>();
  mocks.mutate.mockImplementation(async (callback) => callback(publisherDatabase(values)));
  const baseProject = createVideoProjectEntryWithMediaClip({ id: 'p' });
  const entry =
    kind === 'asset'
      ? {
          ...baseProject,
          id: 'p',
          project: encodePortableVideoProjectAssetRefs({
            ...baseProject.project,
            assets: baseProject.project.assets.map((asset) => ({
              ...asset,
              source: { kind: 'project-asset', projectAssetId: 'clip' },
            })),
          }),
        }
      : createVideoProjectEntry({ id: 'p' }, { id: 'p' });
  const metadata = {
    entry,
    projectAssets: [
      {
        entry: { id: 'mark', mimeType: 'image/svg+xml', size: fixture.blob.size, createdAt: 1 },
        filename: 'mark.svg',
        objectId: 'mark-object',
        publishToLibrary: false,
      },
      ...(kind === 'asset'
        ? [
            {
              entry: { id: 'clip', mimeType: 'video/webm', size: 6, createdAt: 1 },
              filename: 'clip.webm',
              objectId: 'o',
              videoReview: review,
            },
          ]
        : []),
    ],
    projectExports:
      kind === 'export'
        ? [
            {
              entry: {
                id: 'e',
                projectId: 'p',
                createdAt: 1,
                filename: 'export.webm',
                mimeType: 'video/webm',
                size: 6,
                duration: 2,
                width: 640,
                height: 360,
                fps: 30,
              },
              objectId: 'o',
              videoReview: review,
            },
          ]
        : [],
  };
  assertPortableJson(metadata);
  const pending = videoProjectRootPublisher.publish(
    publishArgs(metadata, [
      stagedObject('o', 'new-local', 'video/webm', 6),
      stagedObject('mark-object', 'mark-bytes', 'image/svg+xml', fixture.blob.size),
    ])
  );
  if (mode !== 'valid') {
    await expect(pending).rejects.toMatchObject({
      code: mode === 'source-hash' ? 'source-integrity' : 'resource-integrity',
    });
    expect(values.size).toBe(0);
    expect(mocks.checkpoint).not.toHaveBeenCalled();
  } else {
    await expect(pending).resolves.toMatchObject({ imported: true });
    const restored = logicalRestoredWorkspaces(values)[0];
    expect(restored?.cursor).toBe(0);
    expect(restored?.effectSnapshots?.[0]?.assets[0]?.assetId).not.toBe('project-asset:mark');
    expect(vi.mocked(readAssetFile)).toHaveBeenCalledOnce();
  }
});

it('restores Native effect snapshot resource bytes without passing Blobs through the JSON decoder', async () => {
  const fixture = await annotationReviewFixture();
  const { assets, ...snapshot } = fixture.snapshot;
  const resource = assets[0]!;
  const { assetId: _assetId, ...resourceMetadata } = resource;
  const file = new File([fixture.blob], 'mark.svg', { type: fixture.blob.type });
  const nativeSnapshot = { ...snapshot, assets: [{ ...resourceMetadata, blob: file }] };
  const entry = createVideoProjectEntry(
    { id: 'p', effectSnapshots: [nativeSnapshot] },
    { id: 'p' }
  );
  expect(parseVideoProjectEntry(entry)).not.toBeNull();
  await verifyVideoProjectEffectSnapshotIntegrity(entry.project);
  const portableProject = encodePortableVideoProjectAssetRefs({
    ...entry.project,
    effectSnapshots: [],
  });
  if (!isRecord(portableProject)) throw new Error('Invalid portable project fixture');
  const metadata = {
    entry: {
      ...entry,
      project: {
        ...portableProject,
        effectSnapshots: [
          { ...snapshot, assets: [{ ...resourceMetadata, objectId: 'mark-object' }] },
        ],
      },
    },
    projectAssets: [],
    projectExports: [],
  };
  assertPortableJson(metadata);
  const { readAssetFile } = await import('../../../../composition/persistence/assets');
  vi.mocked(readAssetFile).mockResolvedValue(file);
  const values = new Map<string, unknown[]>();
  mocks.mutate.mockImplementation(async (callback) => callback(publisherDatabase(values)));
  await videoProjectRootPublisher.publish(
    publishArgs(metadata, [stagedObject('mark-object', 'mark-bytes', file.type, file.size)])
  );
  const restored = parseVideoProjectEntry(values.get('video_projects')?.[0]);
  expect(restored).not.toBeNull();
  const restoredBlob = restored!.project.effectSnapshots![0]!.assets[0]!.blob;
  expect(restoredBlob).toBeInstanceOf(Blob);
  await verifyVideoProjectEffectSnapshotIntegrity(restored!.project);
  expect(await restoredBlob.arrayBuffer()).toEqual(await file.arrayBuffer());
  expect(restored!.project.effectSnapshots![0]).toMatchObject({
    ...snapshot,
    assets: [resourceMetadata],
  });
  expect(entry.project.effectSnapshots![0]!.assets[0]!.blob).toBe(file);
  const originalBytes = await file.arrayBuffer();
  vi.spyOn(file, 'arrayBuffer').mockRejectedValue(
    new DOMException('Staging file removed', 'NotFoundError')
  );
  expect(await restoredBlob.arrayBuffer()).toEqual(originalBytes);
  expect(mocks.checkpoint).toHaveBeenCalledOnce();
});

it.each(['resource', 'source', 'closure'] as const)(
  'refuses direct Native snapshot %s corruption before replacing the existing project',
  async (mode) => {
    const fixture = await annotationReviewFixture();
    const { assets, ...snapshot } = fixture.snapshot;
    const { assetId: _assetId, ...resource } = assets[0]!;
    const originalFile = new File([fixture.blob], 'mark.svg', { type: fixture.blob.type });
    const original = createVideoProjectEntry(
      {
        id: 'p',
        effectSnapshots: [{ ...snapshot, assets: [{ ...resource, blob: originalFile }] }],
      },
      { id: 'p' }
    );
    await verifyVideoProjectEffectSnapshotIntegrity(original.project);
    const source =
      mode === 'source'
        ? snapshot.source.replace('Neutral runtime conformance', 'Neutram runtime conformance')
        : snapshot.source;
    if (mode === 'source') expect(source).not.toBe(snapshot.source);
    const resourceMetadata = {
      ...resource,
      ...(mode === 'closure' ? { id: 'different-resource' } : {}),
    };
    const file =
      mode === 'resource'
        ? new File([(await fixture.blob.text()).replace('width="1"', 'width="2"')], 'mark.svg', {
            type: fixture.blob.type,
          })
        : originalFile;
    const candidate = {
      ...original,
      project: {
        ...original.project,
        effectSnapshots: [{ ...snapshot, source, assets: [{ ...resourceMetadata, blob: file }] }],
      },
    };
    expect(parseVideoProjectEntry(candidate)).not.toBeNull();
    await expect(
      verifyVideoProjectEffectSnapshotIntegrity(candidate.project)
    ).rejects.toMatchObject({ code: 'effectSnapshotIntegrityFailure' });
    const portable = encodePortableVideoProjectAssetRefs({
      ...candidate.project,
      effectSnapshots: [],
    });
    if (!isRecord(portable)) throw new Error('Invalid portable corruption fixture');
    const metadata = {
      entry: {
        ...candidate,
        project: {
          ...portable,
          effectSnapshots: [
            { ...snapshot, source, assets: [{ ...resourceMetadata, objectId: 'direct-resource' }] },
          ],
        },
      },
      projectAssets: [],
      projectExports: [],
    };
    assertPortableJson(metadata);
    const { readAssetFile } = await import('../../../../composition/persistence/assets');
    vi.mocked(readAssetFile).mockResolvedValue(file);
    const values = new Map<string, unknown[]>([['video_projects', [original]]]);
    mocks.mutate.mockImplementation(async (callback) => callback(publisherDatabase(values)));
    const args = publishArgs(metadata, [
      stagedObject('direct-resource', 'direct-bytes', file.type, file.size),
    ]);
    args.session = { ...args.session, strategy: 'replace' };
    await expect(videoProjectRootPublisher.publish(args)).rejects.toMatchObject({
      code: 'effectSnapshotIntegrityFailure',
    });
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.checkpoint).not.toHaveBeenCalled();
    expect(values.get('video_projects')).toEqual([original]);
    await verifyVideoProjectEffectSnapshotIntegrity(original.project);
  }
);
