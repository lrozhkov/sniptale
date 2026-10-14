import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { restoreStoredItemsFromTrash } from './trash';
vi.mock('../scenario/aggregate-mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scenario/aggregate-mutations')>()),
  recoverScenarioAssetPublications: vi.fn().mockResolvedValue(0),
}));
import { betaV1Fixture } from '../infrastructure/indexed-db/fixtures/beta-v1';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('./project-retention', () => ({
  repairTemporaryProjectLifecycles: vi.fn().mockResolvedValue(0),
}));
import {
  createVideoProjectEntry,
  createVideoProjectEntryWithMediaClip,
} from '../projects/index.test-support';

const persistenceMocks = vi.hoisted(() => ({
  listMediaLibrary: vi.fn(),
  listScenarioProjectEntries: vi.fn(),
  listVideoProjectEntries: vi.fn(),
  runWithIndexedDbMutation: vi.fn(),
}));

vi.mock('../projects/asset-publication', async (importOriginal) => ({
  ...(await importOriginal()),
  recoverProjectMediaPublications: vi.fn().mockResolvedValue(0),
}));
vi.mock('../recordings/asset-publication', async (importOriginal) => ({
  ...(await importOriginal()),
  recoverRecordingAssetPublications: vi.fn().mockResolvedValue(0),
}));
vi.mock('../image-aggregates/mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../image-aggregates/mutations')>()),
  recoverImageWorkspacePublications: vi.fn().mockResolvedValue(0),
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: persistenceMocks.runWithIndexedDbMutation,
}));
vi.mock('./project-recordings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./project-recordings')>()),
  repairLinkedRecordingLifecycles: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  buildPhysicalDeleteOperation: () => ({
    assetIds: [],
    createdAt: 1,
    kind: 'physical-delete',
    operationId: 'delete-1',
    status: 'pending',
    updatedAt: 1,
  }),
  completePhysicalDeleteOperation: vi.fn(),
}));
vi.mock('../media-library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media-library')>()),
  listMediaLibrary: persistenceMocks.listMediaLibrary,
}));
vi.mock('../projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../projects')>()),
  listVideoProjectEntries: persistenceMocks.listVideoProjectEntries,
}));
vi.mock('../scenario/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scenario/projects')>()),
  listScenarioProjectEntries: persistenceMocks.listScenarioProjectEntries,
}));

import { cleanupDrafts, createLibraryLifecycle, DEFAULT_LOCAL_STORAGE_POLICY } from '.';

const day = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  persistenceMocks.runWithIndexedDbMutation.mockReset();
  persistenceMocks.listMediaLibrary.mockResolvedValue([]);
  persistenceMocks.listScenarioProjectEntries.mockResolvedValue([]);
  persistenceMocks.listVideoProjectEntries.mockResolvedValue([]);
});

it('moves an expired image root to Trash and preserves its sidecars', async () => {
  const now = 40 * day;
  const media = {
    createdAt: 1,
    duration: null,
    filename: 'draft.png',
    height: 1,
    id: 'draft-image',
    kind: 'image' as const,
    lifecycle: createLibraryLifecycle('temporary', 1),
    mimeType: 'image/png',
    originalFilename: 'draft.png',
    size: 5,
    source: { kind: 'screenshot' as const },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 1,
    width: 1,
  };
  persistenceMocks.listMediaLibrary.mockResolvedValue([media]);
  const deletes = vi.fn();
  const put = vi.fn();
  persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: string) => ({
          delete: vi.fn((id: string) => deletes(name, id)),
          put,
          get: vi.fn(async () => (name === 'media_library' ? media : undefined)),
          index: vi.fn(() => ({
            getAll: vi.fn(async () => []),
            getAllKeys: vi.fn(async () => []),
          })),
          getAll: vi.fn(async () => []),
        })),
      })),
    })
  );

  await expect(cleanupDrafts({ now, policy: DEFAULT_LOCAL_STORAGE_POLICY })).resolves.toEqual({
    deletedCount: 1,
    deletedIds: [media.id],
  });
  expect(deletes).not.toHaveBeenCalled();
  expect(put).toHaveBeenCalledWith(
    expect.objectContaining({
      ...media,
      lifecycle: { ...media.lifecycle, trashedAt: now },
    })
  );
});

it.each([
  ['fresh temporary', createLibraryLifecycle('temporary', 39 * day)],
  ['library', createLibraryLifecycle('library', 1)],
])('keeps stale recording media when its authoritative recording is %s', async (_, lifecycle) => {
  const now = 40 * day;
  const recording = {
    assetId: 'asset-recording-1',
    createdAt: 1,
    filename: 'recording.webm',
    id: 'recording-1',
    lifecycle,
    mimeType: 'video/webm',
    size: 5,
  };
  const media = {
    blob: new Blob(['video'], { type: 'video/webm' }),
    createdAt: 1,
    duration: null,
    filename: recording.filename,
    height: null,
    id: 'recording:recording-1',
    kind: 'recording' as const,
    lifecycle: createLibraryLifecycle('temporary', 1),
    mimeType: 'video/webm',
    originalFilename: recording.filename,
    size: recording.size,
    source: { kind: 'recording' as const, recordingId: recording.id },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 1,
    width: null,
  };
  persistenceMocks.listMediaLibrary.mockResolvedValue([media]);
  const deletes = vi.fn();
  persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: string) => ({
          delete: vi.fn((id: string) => deletes(name, id)),
          get: vi.fn(async () =>
            name === 'media_library' ? media : name === 'recordings' ? recording : undefined
          ),
          getAll: vi.fn(async () => []),
        })),
      })),
    })
  );

  await expect(cleanupDrafts({ now, policy: DEFAULT_LOCAL_STORAGE_POLICY })).resolves.toEqual({
    deletedCount: 0,
    deletedIds: [],
  });
  expect(deletes).not.toHaveBeenCalled();
});

async function runExpiredVideoProjectCleanup(args: {
  mediaUpdatedAt: number;
  now: number;
  trashedAt?: number;
}) {
  const project = {
    ...createVideoProjectEntryWithMediaClip(),
    lifecycle: createLibraryLifecycle('temporary', 1),
  };
  const media = {
    createdAt: 1,
    duration: 10,
    filename: 'project-asset.webm',
    height: 1080,
    id: 'project-asset:project-asset-1',
    kind: 'video' as const,
    lifecycle: {
      ...createLibraryLifecycle('temporary', args.mediaUpdatedAt),
      ...(args.trashedAt === undefined ? {} : { trashedAt: args.trashedAt }),
    },
    mimeType: 'video/webm',
    originalFilename: 'project-asset.webm',
    size: 5,
    source: { kind: 'project-asset' as const, projectAssetId: 'project-asset-1' },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: args.mediaUpdatedAt,
    width: 1920,
  };
  persistenceMocks.listVideoProjectEntries.mockResolvedValue([project]);
  persistenceMocks.listMediaLibrary.mockResolvedValue([media]);
  const deletes = vi.fn();
  const valuesByStore = new Map<string, Map<string, unknown>>([
    ['video_projects', new Map([[project.id, project]])],
    ['media_library', new Map([[media.id, media]])],
    ['project_assets', new Map([['project-asset-1', { id: 'project-asset-1' }]])],
  ]);
  persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: string) => ({
          delete: vi.fn(async (id: string) => {
            deletes(name, id);
            valuesByStore.get(name)?.delete(id);
          }),
          get: vi.fn(async (id: string) => valuesByStore.get(name)?.get(id)),
          getAll: vi.fn(async () => [...(valuesByStore.get(name)?.values() ?? [])]),
          index: vi.fn(() => ({ count: vi.fn(async () => 0) })),
          put: vi.fn(),
        })),
      })),
    })
  );

  await expect(
    cleanupDrafts({ now: args.now, policy: DEFAULT_LOCAL_STORAGE_POLICY })
  ).resolves.toEqual({
    deletedCount: 0,
    deletedIds: [],
  });
  return { deletes, media, project };
}

it('keeps a fresh temporary child and its legacy project past the old expiry', async () => {
  const now = 40 * day;
  const { deletes, media, project } = await runExpiredVideoProjectCleanup({
    mediaUpdatedAt: now - day,
    now,
  });

  expect(deletes).not.toHaveBeenCalledWith('video_projects', project.id);
  expect(deletes).not.toHaveBeenCalledWith('media_library', media.id);
  expect(deletes).not.toHaveBeenCalledWith('project_assets', 'project-asset-1');
});

it('retains recording telemetry and project thumbnail with a legacy project graph', async () => {
  const now = 40 * day;
  const project = createVideoProjectEntry(
    {
      baseRecordingId: 'recording-1',
      source: { kind: 'recording', recordingId: 'recording-1' },
    },
    { lifecycle: createLibraryLifecycle('temporary', 1) }
  );
  const recording = {
    assetId: 'asset-recording-1',
    createdAt: 1,
    filename: 'recording.webm',
    id: 'recording-1',
    lifecycle: createLibraryLifecycle('temporary', 1),
    mimeType: 'video/webm',
    size: 5,
  };
  const media = {
    blob: new Blob(['video'], { type: 'video/webm' }),
    createdAt: 1,
    duration: null,
    filename: recording.filename,
    height: null,
    id: 'recording:recording-1',
    kind: 'recording' as const,
    lifecycle: createLibraryLifecycle('temporary', 1),
    mimeType: 'video/webm',
    originalFilename: recording.filename,
    size: recording.size,
    source: { kind: 'recording' as const, recordingId: recording.id },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 1,
    width: null,
  };
  persistenceMocks.listVideoProjectEntries.mockResolvedValue([project]);
  persistenceMocks.listMediaLibrary.mockResolvedValue([media]);
  const deletes = vi.fn();
  const valuesByStore = new Map<string, Map<string, unknown>>([
    ['video_projects', new Map([[project.id, project]])],
    ['media_library', new Map([[media.id, media]])],
    ['recordings', new Map([[recording.id, recording]])],
  ]);
  persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: string) => ({
          delete: vi.fn(async (id: string) => {
            deletes(name, id);
            valuesByStore.get(name)?.delete(id);
          }),
          get: vi.fn(async (id: string) => valuesByStore.get(name)?.get(id)),
          getAll: vi.fn(async () => [...(valuesByStore.get(name)?.values() ?? [])]),
          index: vi.fn(() => ({ count: vi.fn(async () => 0) })),
          put: vi.fn(),
        })),
      })),
    })
  );

  await expect(cleanupDrafts({ now, policy: DEFAULT_LOCAL_STORAGE_POLICY })).resolves.toEqual({
    deletedCount: 0,
    deletedIds: [],
  });
  expect(deletes).not.toHaveBeenCalled();
});

it('retains independently trashed media and its legacy video project', async () => {
  const { deletes, media, project } = await runExpiredVideoProjectCleanup({
    mediaUpdatedAt: 1,
    now: 40 * day,
    trashedAt: 2,
  });
  expect(deletes).not.toHaveBeenCalledWith('video_projects', project.id);
  expect(deletes).not.toHaveBeenCalledWith('media_library', media.id);
  expect(deletes).not.toHaveBeenCalledWith('project_assets', 'project-asset-1');
});

it('does not start recovery or deletion for cancelled maintenance', async () => {
  const { recoverRecordingAssetPublications } = await import('../recordings/asset-publication');
  const abort = new AbortController();
  abort.abort();
  await expect(
    cleanupDrafts({ policy: DEFAULT_LOCAL_STORAGE_POLICY, signal: abort.signal })
  ).resolves.toEqual({ deletedCount: 0, deletedIds: [] });
  expect(recoverRecordingAssetPublications).not.toHaveBeenCalled();
});

it.each(['recording', 'project', 'image'] as const)(
  'cancels after %s recovery without starting retention scans',
  async (phase) => {
    const { recoverRecordingAssetPublications } = await import('../recordings/asset-publication');
    const { recoverProjectMediaPublications } = await import('../projects/asset-publication');
    const { recoverImageWorkspacePublications } = await import('../image-aggregates/mutations');
    const abort = new AbortController();
    const recover =
      phase === 'recording'
        ? recoverRecordingAssetPublications
        : phase === 'project'
          ? recoverProjectMediaPublications
          : recoverImageWorkspacePublications;
    vi.mocked(recover).mockImplementationOnce(async () => {
      abort.abort();
      return 0;
    });
    await expect(
      cleanupDrafts({ policy: DEFAULT_LOCAL_STORAGE_POLICY, signal: abort.signal })
    ).resolves.toEqual({ deletedCount: 0, deletedIds: [] });
    expect(persistenceMocks.listMediaLibrary).not.toHaveBeenCalled();
  }
);

it('cancels candidate deletion when discovery completes after cancellation', async () => {
  const abort = new AbortController();
  persistenceMocks.listMediaLibrary.mockImplementationOnce(async () => {
    abort.abort();
    return [
      {
        id: 'expired',
        lifecycle: createLibraryLifecycle('temporary', 1),
        source: { kind: 'screenshot' },
      },
    ];
  });
  await expect(
    cleanupDrafts({ policy: DEFAULT_LOCAL_STORAGE_POLICY, signal: abort.signal, now: 40 * day })
  ).resolves.toEqual({ deletedCount: 0, deletedIds: [] });
  expect(persistenceMocks.runWithIndexedDbMutation).not.toHaveBeenCalled();
});

it('moves a seven-day unused recording to Trash without source deletion or physical intent', async () => {
  const now = 1 + 7 * day;
  const recording = {
    ...betaV1Fixture.records.recordings[0]!,
    lifecycle: createLibraryLifecycle('temporary', 1),
  };
  const media = {
    ...betaV1Fixture.records.media_library[0]!,
    lifecycle: createLibraryLifecycle('temporary', 1),
  };
  const rows = new Map<string, Map<string, unknown>>([
    ['media_library', new Map([[media.id, media]])],
    ['recordings', new Map([[recording.id, recording]])],
    ['asset_operations', new Map()],
    [
      'asset_refs',
      new Map([
        [
          recording.assetId,
          {
            assetId: recording.assetId,
            size: recording.size,
            mimeType: recording.mimeType,
            location: { kind: 'opfs', objectKey: 'objects/retained-recording' },
            sha256: null,
            createdAt: 1,
          },
        ],
      ]),
    ],
  ]);
  persistenceMocks.listMediaLibrary.mockResolvedValue([media]);
  persistenceMocks.runWithIndexedDbMutation.mockImplementationOnce(async (effect) =>
    effect({
      transaction: () => ({
        done: Promise.resolve(),
        abort: vi.fn(),
        objectStore: (name: string) => {
          let values = rows.get(name);
          if (!values) {
            values = new Map();
            rows.set(name, values);
          }
          const owned = values;
          return {
            get: async (id: string) => owned.get(id),
            getAll: async () => [...owned.values()],
            delete: async (key: IDBValidKey) => owned.delete(String(key)),
            put: async (value: { id?: string; assetId?: string; operationId?: string }) => {
              const key = value.id ?? value.operationId ?? value.assetId;
              if (!key) throw new Error('Missing fixture row identity.');
              owned.set(key, value);
            },
            index: () => ({
              getAll: async () => [],
              getAllKeys: async () => [],
              count: async () => 0,
            }),
          };
        },
      }),
    })
  );
  await cleanupDrafts({
    now,
    policy: { ...DEFAULT_LOCAL_STORAGE_POLICY, cleanupEnabled: true, videoDraftRetentionDays: 7 },
  });
  expect(rows.get('media_library')!.get(media.id)).toMatchObject({
    lifecycle: { storageClass: 'temporary', trashedAt: now },
  });
  expect(rows.get('recordings')!.get(recording.id)).toMatchObject({ assetId: recording.assetId });
  expect(rows.get('asset_refs')!.has(recording.assetId)).toBe(true);
  expect(rows.get('asset_operations')!.size).toBe(0);
});

it('uses actual Trash admission, preserves duplicate admission and renews expiry after restore', async () => {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  const media = {
    ...betaV1Fixture.records.media_library[0]!,
    lifecycle: createLibraryLifecycle('temporary', 1),
  };
  const recording = {
    ...betaV1Fixture.records.recordings[0]!,
    lifecycle: createLibraryLifecycle('temporary', 1),
  };
  fixture.rows.get('media_library')!.set(media.id, media);
  fixture.rows.get('recordings')!.set(recording.id, recording);
  persistenceMocks.runWithIndexedDbMutation.mockImplementation(async (operation) =>
    operation(fixture.database)
  );
  persistenceMocks.listMediaLibrary.mockResolvedValue([media]);
  const expire = (now: number, enabled = true) =>
    cleanupDrafts({
      now,
      policy: {
        ...DEFAULT_LOCAL_STORAGE_POLICY,
        cleanupEnabled: enabled,
        videoDraftRetentionDays: 7,
      },
    });
  expect((await expire(1 + 7 * day - 1)).deletedCount).toBe(0);
  expect((await expire(1 + 7 * day, false)).deletedCount).toBe(0);
  expect((await expire(1 + 7 * day)).deletedCount).toBe(1);
  const admitted = structuredClone(fixture.rows);
  expect((await expire(1 + 40 * day)).deletedCount).toBe(0);
  expect(fixture.rows).toEqual(admitted);
  await restoreStoredItemsFromTrash([{ kind: 'media', id: media.id }], 1 + 41 * day);
  expect((await expire(1 + 48 * day - 1)).deletedCount).toBe(0);
  expect((await expire(1 + 48 * day)).deletedCount).toBe(1);
  expect(fixture.rows.get('media_library')!.get(media.id)).toMatchObject({
    lifecycle: { trashedAt: 1 + 48 * day },
  });
  expect(fixture.rows.get('recordings')!.get(recording.id)).toEqual(recording);
  expect(fixture.rows.get('asset_operations')!.size).toBe(0);
});

it.each(['image', 'review', 'unknown-review', 'write-failure'] as const)(
  'retains the fresh source graph during expiry (%s)',
  async (state) => {
    const fixture = createReviewWorkspaceStoreFixture(
      (store) => state === 'write-failure' && store === 'media_library'
    );
    const media = {
      ...betaV1Fixture.records.media_library[0]!,
      lifecycle: createLibraryLifecycle('temporary', 1),
    };
    const recording = {
      ...betaV1Fixture.records.recordings[0]!,
      lifecycle: createLibraryLifecycle('temporary', 1),
    };
    fixture.rows.get('media_library')!.set(media.id, media);
    fixture.rows.get('recordings')!.set(recording.id, recording);
    if (state === 'image')
      fixture.rows.get('image_workspaces')!.set(media.id, { unreadable: true });
    if (state === 'review')
      fixture.rows.get('video_workspaces')!.set(media.id, { aggregateId: media.id });
    if (state === 'unknown-review')
      fixture.rows.get('video_workspaces')!.set('unknown', { unreadable: true });
    persistenceMocks.listMediaLibrary.mockResolvedValue([media]);
    persistenceMocks.runWithIndexedDbMutation.mockImplementation(async (operation) =>
      operation(fixture.database)
    );
    const before = structuredClone(fixture.rows);
    const result = cleanupDrafts({ now: 1 + 7 * day, policy: DEFAULT_LOCAL_STORAGE_POLICY });
    if (state === 'write-failure') await expect(result).rejects.toThrow();
    else expect((await result).deletedCount).toBe(0);
    expect(fixture.rows).toEqual(before);
  }
);

it('starts the full Trash window when delayed admission resumes', async () => {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  const media = {
    ...betaV1Fixture.records.media_library[0]!,
    lifecycle: createLibraryLifecycle('temporary', 1),
  };
  const recording = {
    ...betaV1Fixture.records.recordings[0]!,
    lifecycle: createLibraryLifecycle('temporary', 1),
  };
  fixture.rows.get('media_library')!.set(media.id, media);
  fixture.rows.get('recordings')!.set(recording.id, recording);
  persistenceMocks.listMediaLibrary.mockResolvedValue([media]);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1 + 7 * day);
  persistenceMocks.runWithIndexedDbMutation.mockImplementation(async (operation) => {
    clock.mockReturnValue(1 + 47 * day);
    return operation(fixture.database);
  });
  try {
    await expect(
      cleanupDrafts({
        policy: {
          ...DEFAULT_LOCAL_STORAGE_POLICY,
          cleanupEnabled: true,
          videoDraftRetentionDays: 7,
        },
      })
    ).resolves.toEqual({ deletedCount: 1, deletedIds: [media.id] });
    expect(fixture.rows.get('media_library')!.get(media.id)).toMatchObject({
      lifecycle: { trashedAt: 1 + 47 * day },
    });
    expect(fixture.rows.get('asset_operations')!.size).toBe(0);
  } finally {
    clock.mockRestore();
  }
});
