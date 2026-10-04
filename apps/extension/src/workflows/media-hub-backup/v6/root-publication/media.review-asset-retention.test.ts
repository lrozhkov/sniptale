import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkpoint: vi.fn(),
  completeDelete: vi.fn(async () => undefined),
  runMutation: vi.fn(),
  failWrite: vi.fn(),
}));
vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  appendCommittedArchiveRootInTransaction: mocks.checkpoint,
  buildPhysicalDeleteOperation: () => ({
    assetIds: [],
    createdAt: 1,
    operationId: 'delete-1',
    status: 'pending',
    type: 'physical-delete',
  }),
  completePhysicalDeleteOperation: mocks.completeDelete,
  readAssetFile: vi.fn(),
}));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

import { mediaLibraryRootPublisher } from './media';
import {
  journal,
  portableJson,
  portableMetadata,
  reviewFixture,
  session,
  stagedObjects,
} from './media.review-assets.test-support';

const oldReviewAssets = ['background', 'music', 'voice'].map((id) => ({
  assetId: `old-${id}-bytes`,
  createdAt: 1,
  id: `old-${id}`,
  mimeType: id === 'background' ? 'image/png' : 'audio/mpeg',
  size: 10,
}));

function oldWorkspace() {
  const workspace = structuredClone(reviewFixture().workspace);
  if (workspace.advanced.background.type === 'image') {
    workspace.advanced.background.assetId = 'project-asset:old-background';
  }
  workspace.advanced.audio.music[0]!.assetId = 'project-asset:old-music';
  const operation = workspace.history[0];
  if (operation?.target === 'advancedContent') {
    if (operation.before.background.enabled && operation.before.background.type === 'image') {
      operation.before.background.assetId = 'project-asset:old-background';
    }
    operation.before.audio.music[0]!.assetId = 'project-asset:old-music';
    if (operation.after.background.enabled && operation.after.background.type === 'image') {
      operation.after.background.assetId = 'project-asset:old-background';
    }
    operation.after.audio.music[0]!.assetId = 'project-asset:old-music';
    operation.after.audio.voiceover[0]!.assetId = 'project-asset:old-voice';
  }
  return workspace;
}

function createTables(metadata: ReturnType<typeof portableMetadata>) {
  const review = reviewFixture();
  return new Map<string, Map<string, unknown>>([
    [
      'media_library',
      new Map<string, unknown>([
        [metadata.entry.id, metadata.entry],
        ...oldReviewAssets.map(
          (entry) =>
            [
              `project-asset:${entry.id}`,
              {
                ...entry,
                id: `project-asset:${entry.id}`,
                kind: 'video',
                filename: `${entry.id}.bin`,
                originalFilename: `${entry.id}.bin`,
                source: { kind: 'project-asset', projectAssetId: entry.id },
                sourceFavicon: null,
                sourceTitle: null,
                sourceUrl: null,
                tags: [],
                updatedAt: 1,
              },
            ] as const
        ),
      ]),
    ],
    ['project_exports', new Map([['e', { ...metadata.projectExport, assetId: 'old-local' }]])],
    ['project_assets', new Map(oldReviewAssets.map((entry) => [entry.id, entry]))],
    [
      'asset_refs',
      new Map(
        oldReviewAssets.map((entry) => [
          entry.assetId,
          {
            assetId: entry.assetId,
            createdAt: 1,
            location: { kind: 'opfs', objectKey: `objects/${entry.assetId}` },
            mimeType: entry.mimeType,
            sha256: null,
            size: entry.size,
          },
        ])
      ),
    ],
    [
      'asset_owners',
      new Map(
        oldReviewAssets.map((entry) => [
          String(['project-asset', entry.id, 'body']),
          {
            assetId: entry.assetId,
            ownerId: entry.id,
            ownerKind: 'project-asset',
            role: 'body',
          },
        ])
      ),
    ],
    [
      'video_workspaces',
      new Map<string, unknown>([
        [metadata.entry.id, { ...oldWorkspace(), sourceAssetId: 'old-local' }],
        ...oldReviewAssets.map(
          (entry) =>
            [
              `project-asset:${entry.id}`,
              {
                ...oldWorkspace(),
                sourceAssetId: entry.assetId,
                aggregateId: `project-asset:${entry.id}`,
                cursor: 0,
                history: [],
                advanced: {
                  ...oldWorkspace().advanced,
                  background: { enabled: false },
                  audio: { ...oldWorkspace().advanced.audio, music: [], voiceover: [] },
                },
              },
            ] as const
        ),
      ]),
    ],
    [
      'video_workspace_drafts',
      new Map<string, unknown>([
        [metadata.entry.id, review.draft],
        ...oldReviewAssets.map(
          (entry) =>
            [
              `project-asset:${entry.id}`,
              { aggregateId: `project-asset:${entry.id}`, stale: true },
            ] as const
        ),
      ]),
    ],
  ]);
}

function installDatabase(metadata: ReturnType<typeof portableMetadata>, retainPublished = false) {
  const tables = createTables(metadata);
  if (!retainPublished) {
    for (const entry of oldReviewAssets)
      tables.get('media_library')!.delete(`project-asset:${entry.id}`);
  }
  const storeFor = (name: string) => {
    const table = tables.get(name) ?? new Map<string, unknown>();
    tables.set(name, table);
    return {
      get: async (key: IDBValidKey) => table.get(String(key)),
      getAll: async () => [...table.values()],
      delete: async (key: IDBValidKey) => table.delete(String(key)),
      put: async (value: Record<string, unknown>) => {
        mocks.failWrite(name, value);
        const key = value['ownerKind']
          ? String([value['ownerKind'], value['ownerId'], value['role']])
          : (value['aggregateId'] ?? value['id'] ?? value['assetId'] ?? 'other');
        table.set(String(key), structuredClone(value));
      },
      index: () => ({
        count: async (assetId: string) =>
          [...table.values()].filter(
            (value) =>
              typeof value === 'object' &&
              value !== null &&
              (value as Record<string, unknown>)['assetId'] === assetId
          ).length,
      }),
    };
  };
  mocks.runMutation.mockImplementation(async (callback) =>
    callback({
      get: async (name: string, key: IDBValidKey) => storeFor(name).get(key),
      transaction: () => {
        const before = structuredClone(tables);
        return {
          objectStore: storeFor,
          done: Promise.resolve(),
          abort: () => {
            tables.clear();
            for (const [name, table] of before) tables.set(name, table);
          },
        };
      },
    })
  );
  return tables;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.failWrite.mockReset();
});

it('removes the obsolete exclusive review graph and journals its bytes on replace', async () => {
  const metadata = portableMetadata(true);
  const tables = installDatabase(metadata);
  await mediaLibraryRootPublisher.publish({
    envelope: {
      descriptor: {
        mediaSubtype: 'library-item',
        metadataPath: '_sniptale/metadata/media/export-e.json',
        objectCount: 4,
        rootId: metadata.entry.id,
        rootKind: 'media',
        totalBytes: 36,
      },
      metadata: portableJson(metadata),
      objects: [],
    },
    journal,
    session: session('replace'),
    staged: stagedObjects(),
  });

  for (const entry of oldReviewAssets) {
    const aggregateId = `project-asset:${entry.id}`;
    expect(tables.get('project_assets')?.has(entry.id)).toBe(false);
    expect(tables.get('media_library')?.has(aggregateId)).toBe(false);
    expect(tables.get('video_workspaces')?.has(aggregateId)).toBe(false);
    expect(tables.get('video_workspace_drafts')?.has(aggregateId)).toBe(false);
    expect(
      [...(tables.get('asset_owners')?.values() ?? [])].some(
        (value) =>
          typeof value === 'object' &&
          value !== null &&
          (value as Record<string, unknown>)['ownerId'] === entry.id
      )
    ).toBe(false);
    expect(tables.get('asset_refs')?.has(entry.assetId)).toBe(false);
  }
  expect(mocks.completeDelete).toHaveBeenCalledWith(
    expect.objectContaining({
      assetIds: expect.arrayContaining(oldReviewAssets.map((entry) => entry.assetId)),
    }),
    undefined
  );
});

it('preserves independently published auxiliary materials when replacing their former review root', async () => {
  const metadata = portableMetadata(true);
  const tables = installDatabase(metadata, true);
  await mediaLibraryRootPublisher.publish({
    envelope: {
      descriptor: {
        mediaSubtype: 'library-item',
        metadataPath: '_sniptale/metadata/media/export-e.json',
        objectCount: 4,
        rootId: metadata.entry.id,
        rootKind: 'media',
        totalBytes: 36,
      },
      metadata: portableJson(metadata),
      objects: [],
    },
    journal,
    session: session('replace'),
    staged: stagedObjects(),
  });
  expect(tables.get('media_library')?.has('project-asset:old-music')).toBe(true);
  expect(tables.get('project_assets')?.has('old-music')).toBe(true);
  expect(tables.get('asset_refs')?.has('old-music-bytes')).toBe(true);
});

it.each(['video', 'review'] as const)(
  'retains private auxiliaries used by malformed external %s consumers',
  async (kind) => {
    const metadata = portableMetadata(true);
    const tables = installDatabase(metadata);
    for (const entry of oldReviewAssets)
      tables.get('video_workspaces')!.delete(`project-asset:${entry.id}`);
    if (kind === 'video') {
      const { createVideoProjectEntryWithMediaClip } =
        await import('../../../../composition/persistence/projects/index.test-support');
      const video = createVideoProjectEntryWithMediaClip({ id: 'external' });
      video.project.assets[0]!.source = { kind: 'project-asset', projectAssetId: 'old-music' };
      tables.set('video_projects', new Map([[video.id, { ...video, updatedAt: 'invalid' }]]));
    } else {
      tables
        .get('video_workspaces')!
        .set('external', { ...oldWorkspace(), aggregateId: 'external', revision: 'invalid' });
    }
    await mediaLibraryRootPublisher.publish({
      envelope: {
        descriptor: {
          mediaSubtype: 'library-item',
          metadataPath: '_sniptale/metadata/media/export-e.json',
          objectCount: 4,
          rootId: metadata.entry.id,
          rootKind: 'media',
          totalBytes: 36,
        },
        metadata: portableJson(metadata),
        objects: [],
      },
      journal,
      session: session('replace'),
      staged: stagedObjects(),
    });
    expect(tables.get('project_assets')?.has('old-music')).toBe(true);
    expect(tables.get('asset_refs')?.has('old-music-bytes')).toBe(true);
  }
);

it('retains the auxiliaries of an independently retained review source', async () => {
  const metadata = portableMetadata(true);
  const tables = installDatabase(metadata);
  const background = oldReviewAssets[0]!;
  tables
    .get('media_library')!
    .set(`project-asset:${background.id}`, { id: `project-asset:${background.id}` });
  const workspace = oldWorkspace();
  workspace.aggregateId = `project-asset:${background.id}`;
  tables.get('video_workspaces')!.set(workspace.aggregateId, workspace);
  await mediaLibraryRootPublisher.publish({
    envelope: {
      descriptor: {
        mediaSubtype: 'library-item',
        metadataPath: '_sniptale/metadata/media/export-e.json',
        objectCount: 4,
        rootId: metadata.entry.id,
        rootKind: 'media',
        totalBytes: 36,
      },
      metadata: portableJson(metadata),
      objects: [],
    },
    journal,
    session: session('replace'),
    staged: stagedObjects(),
  });
  expect(tables.get('project_assets')?.has('old-music')).toBe(true);
  expect(tables.get('asset_refs')?.has('old-music-bytes')).toBe(true);
});

it('reclaims nested private resources before replacing their source workspace', async () => {
  const metadata = portableMetadata(true);
  const tables = installDatabase(metadata);
  for (const entry of oldReviewAssets)
    tables.get('video_workspaces')!.delete(`project-asset:${entry.id}`);
  const nested = {
    id: 'nested',
    assetId: 'nested-bytes',
    createdAt: 1,
    mimeType: 'audio/mpeg',
    size: 10,
  };
  tables.get('project_assets')!.set(nested.id, nested);
  tables.get('asset_refs')!.set(nested.assetId, { assetId: nested.assetId });
  tables.get('asset_owners')!.set(String(['project-asset', nested.id, 'body']), {
    assetId: nested.assetId,
    ownerId: nested.id,
    ownerKind: 'project-asset',
    role: 'body',
  });
  const workspace = { ...oldWorkspace(), sourceAssetId: 'old-music-bytes' };
  workspace.aggregateId = 'project-asset:old-music';
  workspace.cursor = 0;
  workspace.history = [];
  workspace.advanced.audio.music[0]!.assetId = 'project-asset:nested';
  tables.get('video_workspaces')!.set(workspace.aggregateId, workspace);
  await mediaLibraryRootPublisher.publish({
    envelope: {
      descriptor: {
        mediaSubtype: 'library-item',
        metadataPath: '_sniptale/metadata/media/export-e.json',
        objectCount: 4,
        rootId: metadata.entry.id,
        rootKind: 'media',
        totalBytes: 36,
      },
      metadata: portableJson(metadata),
      objects: [],
    },
    journal,
    session: session('replace'),
    staged: stagedObjects(),
  });
  expect(tables.get('project_assets')?.has('nested')).toBe(false);
  expect(tables.get('asset_refs')?.has('nested-bytes')).toBe(false);
});

it('aborts replacement after a failed publication write and preserves the original graph', async () => {
  const metadata = portableMetadata(true);
  const tables = installDatabase(metadata);
  const names = [
    'media_library',
    'project_assets',
    'video_workspaces',
    'asset_owners',
    'asset_refs',
  ];
  const before = names.map((name) => structuredClone(tables.get(name)));
  mocks.failWrite.mockImplementation((name) => {
    if (name === 'media_library') throw new Error('publication failed');
  });
  await expect(
    mediaLibraryRootPublisher.publish({
      envelope: {
        descriptor: {
          mediaSubtype: 'library-item',
          metadataPath: '_sniptale/metadata/media/export-e.json',
          objectCount: 4,
          rootId: metadata.entry.id,
          rootKind: 'media',
          totalBytes: 36,
        },
        metadata: portableJson(metadata),
        objects: [],
      },
      journal,
      session: session('replace'),
      staged: stagedObjects(),
    })
  ).rejects.toThrow('publication failed');
  expect(names.map((name) => tables.get(name))).toEqual(before);
  expect(mocks.checkpoint).not.toHaveBeenCalled();
  expect(mocks.completeDelete).not.toHaveBeenCalled();
});

it('retains a malformed private auxiliary source while replacing its former root', async () => {
  const metadata = portableMetadata(true);
  const tables = installDatabase(metadata);
  const invalid = { ...oldReviewAssets[1]!, createdAt: 'invalid' };
  tables.get('project_assets')!.set('old-music', invalid);
  await mediaLibraryRootPublisher.publish({
    envelope: {
      descriptor: {
        mediaSubtype: 'library-item',
        metadataPath: '_sniptale/metadata/media/export-e.json',
        objectCount: 4,
        rootId: metadata.entry.id,
        rootKind: 'media',
        totalBytes: 36,
      },
      metadata: portableJson(metadata),
      objects: [],
    },
    journal,
    session: session('replace'),
    staged: stagedObjects(),
  });
  expect(tables.get('project_assets')?.get('old-music')).toEqual(invalid);
  expect(tables.get('asset_refs')?.has('old-music-bytes')).toBe(true);
  expect(tables.get('asset_owners')?.has(String(['project-asset', 'old-music', 'body']))).toBe(
    true
  );
});

it.each(['material', 'source'] as const)(
  'preserves malformed existing %s during archive replacement',
  async (kind) => {
    const metadata = portableMetadata(true);
    const tables = installDatabase(metadata);
    const target =
      kind === 'material' ? tables.get('media_library')! : tables.get('project_exports')!;
    target.set(kind === 'material' ? metadata.entry.id : 'e', {
      id: kind === 'material' ? metadata.entry.id : 'e',
      invalid: true,
    });
    await expect(
      mediaLibraryRootPublisher.publish({
        envelope: {
          descriptor: {
            mediaSubtype: 'library-item',
            metadataPath: '_sniptale/metadata/media/export-e.json',
            objectCount: 4,
            rootId: metadata.entry.id,
            rootKind: 'media',
            totalBytes: 36,
          },
          metadata: portableJson(metadata),
          objects: [],
        },
        journal,
        session: session('replace'),
        staged: stagedObjects(),
      })
    ).rejects.toThrow();
    expect(mocks.checkpoint).not.toHaveBeenCalled();
    expect(target.get(kind === 'material' ? metadata.entry.id : 'e')).toMatchObject({
      invalid: true,
    });
  }
);

it('refuses changing the logical source identity during same-root archive replacement', async () => {
  const metadata = portableMetadata(true);
  const tables = installDatabase(metadata);
  tables.get('media_library')!.set(metadata.entry.id, {
    ...metadata.entry,
    kind: 'image',
    mimeType: 'image/png',
    source: { kind: 'screenshot' },
    blob: new Blob(['original']),
  });
  await expect(
    mediaLibraryRootPublisher.publish({
      envelope: {
        descriptor: {
          mediaSubtype: 'library-item',
          metadataPath: '_sniptale/metadata/media/export-e.json',
          objectCount: 4,
          rootId: metadata.entry.id,
          rootKind: 'media',
          totalBytes: 36,
        },
        metadata: portableJson(metadata),
        objects: [],
      },
      journal,
      session: session('replace'),
      staged: stagedObjects(),
    })
  ).rejects.toThrow();
  expect(mocks.checkpoint).not.toHaveBeenCalled();
  expect(tables.get('media_library')!.get(metadata.entry.id)).toMatchObject({
    source: { kind: 'screenshot' },
  });
});

it('replaces an independent root version while retaining live identity and frozen shared bytes', async () => {
  const metadata = portableMetadata(true);
  const tables = installDatabase(metadata);
  const { createVideoProjectEntryWithMediaClip } =
    await import('../../../../composition/persistence/projects/index.test-support');
  const external = createVideoProjectEntryWithMediaClip({ id: 'external' });
  external.project.assets[0]!.source = { kind: 'library-asset', mediaId: metadata.entry.id };
  tables.set('video_projects', new Map([[external.id, external]]));
  const oldRef = {
    assetId: 'old-local',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/old-local' },
    mimeType: 'video/mp4',
    sha256: null,
    size: 10,
  };
  tables.get('asset_refs')!.set('old-local', oldRef);
  tables.get('asset_owners')!.set(String(['project-export', 'e', 'body']), {
    assetId: 'old-local',
    ownerId: 'e',
    ownerKind: 'project-export',
    role: 'body',
  });
  const frozen = {
    id: 'frozen',
    assetId: 'old-local',
    createdAt: 1,
    mimeType: 'video/mp4',
    size: 10,
    publishToLibrary: false,
    originMediaId: metadata.entry.id,
  };
  tables.get('project_assets')!.set('frozen', frozen);
  tables.get('asset_owners')!.set(String(['project-asset', 'frozen', 'body']), {
    assetId: 'old-local',
    ownerId: 'frozen',
    ownerKind: 'project-asset',
    role: 'body',
  });
  await mediaLibraryRootPublisher.publish({
    envelope: {
      descriptor: {
        mediaSubtype: 'library-item',
        metadataPath: '_sniptale/metadata/media/export-e.json',
        objectCount: 4,
        rootId: metadata.entry.id,
        rootKind: 'media',
        totalBytes: 36,
      },
      metadata: portableJson(metadata),
      objects: [],
    },
    journal,
    session: session('replace'),
    staged: stagedObjects(),
  });
  expect(tables.get('video_projects')?.get(external.id)).toEqual(external);
  expect(tables.get('project_assets')?.get('frozen')).toEqual(frozen);
  expect(tables.get('asset_refs')?.get('old-local')).toEqual(oldRef);
  expect(
    tables.get('asset_owners')?.get(String(['project-asset', 'frozen', 'body']))
  ).toMatchObject({ assetId: 'old-local' });
  expect(tables.get('project_exports')?.get('e')).not.toMatchObject({ assetId: 'old-local' });
});

it.each(['canonical', 'borrowed'] as const)(
  'freezes the %s scenario representation before replacing its published root version',
  async (relation) => {
    const tables = installDatabase(portableMetadata(true));
    for (const table of tables.values()) table.clear();
    const { createMediaLibraryEntry } =
      await import('../../../../composition/persistence/projects/index.test-support');
    const entry = createMediaLibraryEntry({
      id: relation === 'canonical' ? 'scenario-asset:captured' : 'independent-image',
      source: { kind: 'stored-asset', assetId: 'old-image' },
    });
    const oldRef = {
      assetId: 'old-image',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'objects/old-image' },
      mimeType: entry.mimeType,
      size: entry.size,
      sha256: null,
    };
    tables.get('media_library')!.set(entry.id, entry);
    tables.get('asset_refs')!.set(oldRef.assetId, oldRef);
    tables.get('asset_owners')!.set(String(['media-library', entry.id, 'source']), {
      assetId: oldRef.assetId,
      ownerId: entry.id,
      ownerKind: 'media-library',
      role: 'source',
    });
    tables.get('asset_owners')!.set(String(['scenario-asset', 'captured', 'body']), {
      assetId: oldRef.assetId,
      ownerId: 'captured',
      ownerKind: 'scenario-asset',
      role: 'body',
    });
    const child = {
      id: 'captured',
      projectId: 'scenario',
      assetId: oldRef.assetId,
      galleryAssetId: relation === 'borrowed' ? entry.id : null,
      ...(relation === 'borrowed' ? { borrowedMediaId: entry.id } : {}),
      mimeType: entry.mimeType,
      size: entry.size,
      width: 100,
      height: 50,
      createdAt: 1,
    };
    tables.set('scenario_assets', new Map([[child.id, child]]));
    const nextRef = {
      ...oldRef,
      assetId: 'new-image',
      location: { kind: 'opfs' as const, objectKey: 'objects/new-image' },
    };
    await mediaLibraryRootPublisher.publish({
      envelope: {
        descriptor: {
          mediaSubtype: 'library-item',
          metadataPath: '_sniptale/metadata/media/image.json',
          objectCount: 1,
          rootId: entry.id,
          rootKind: 'media',
          totalBytes: nextRef.size,
        },
        metadata: portableJson({
          entry: { ...entry, source: { kind: 'stored-asset' } },
          originalObjectId: 'image',
        }),
        objects: [],
      },
      journal,
      session: session('replace'),
      staged: [{ objectId: 'image', ref: nextRef }],
    });
    expect(tables.get('scenario_assets')!.get(child.id)).toMatchObject({
      assetId: oldRef.assetId,
      galleryAssetId: entry.id,
    });
    expect(tables.get('scenario_assets')!.get(child.id)).not.toHaveProperty('borrowedMediaId');
    expect(tables.get('asset_refs')!.get(oldRef.assetId)).toEqual(oldRef);
  }
);
