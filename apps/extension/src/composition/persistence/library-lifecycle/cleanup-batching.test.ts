import { beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import {
  createMediaLibraryEntry,
  createVideoProjectEntryWithMediaClip,
} from '../projects/index.test-support';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { videoEntryIsUnrelated } from '../media-library/dependencies';
import type { MediaLibraryEntry } from '../media-library/contracts';
import type { VideoProjectAssetSource } from '../../../features/video/project/types';
import { createLibraryLifecycle } from './contracts';
import { DEFAULT_LOCAL_STORAGE_POLICY } from './policy';
import { cleanupDrafts } from './cleanup';

const mocks = vi.hoisted(() => ({ media: vi.fn(), projects: vi.fn(), mutate: vi.fn() }));
vi.mock('../media-library', async (original) => ({
  ...(await original<typeof import('../media-library')>()),
  listMediaLibrary: mocks.media,
}));
vi.mock('../projects', async (original) => ({
  ...(await original<typeof import('../projects')>()),
  listVideoProjectEntries: mocks.projects,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.mutate,
}));
vi.mock('../recordings/asset-publication', () => ({
  recoverRecordingAssetPublications: async () => {},
}));
vi.mock('../projects/asset-publication', () => ({
  recoverProjectMediaPublications: async () => {},
}));
vi.mock('../image-aggregates/mutations', () => ({
  recoverImageWorkspacePublications: async () => {},
}));
vi.mock('../scenario/aggregate-mutations', () => ({
  recoverScenarioAssetPublications: async () => {},
}));
vi.mock('./project-retention', () => ({ repairTemporaryProjectLifecycles: async () => {} }));
vi.mock('./project-recordings', () => ({ repairLinkedRecordingLifecycles: async () => {} }));
vi.mock('./maintenance-log', () => ({ createMaintenanceLog: () => ({ append: async () => {} }) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mutate.mockReset();
  mocks.projects.mockResolvedValue([]);
});

const now = 40 * 24 * 60 * 60 * 1000;
const args = { now, policy: DEFAULT_LOCAL_STORAGE_POLICY };

function fixture(count: number, failure: (storeName?: string) => boolean = () => false) {
  const owner = createReviewWorkspaceStoreFixture(failure);
  for (const rows of owner.rows.values()) rows.clear();
  const media = Array.from({ length: count }, (_, index) =>
    createMediaLibraryEntry({
      id: `root-${index}`,
      workspaceRevision: 0,
      imageContentState: 'original',
      source: { kind: 'screenshot' },
      lifecycle: createLibraryLifecycle('temporary', 1),
    })
  );
  for (const row of media) owner.rows.get('media_library')!.set(row.id, row);
  const reads = vi.fn();
  const transaction = owner.database.transaction.bind(owner.database);
  const transactions = vi
    .spyOn(owner.database, 'transaction')
    .mockImplementation((stores, mode) => {
      const tx = transaction(stores, mode);
      const objectStore = tx.objectStore.bind(tx);
      vi.spyOn(tx, 'objectStore').mockImplementation((name) => {
        const store = objectStore(name);
        const getAll = store.getAll;
        store.getAll = async (query, count) => {
          reads(name, count);
          return getAll(query, count);
        };
        return store;
      });
      return tx;
    });
  mocks.media.mockResolvedValue(media);
  mocks.mutate.mockImplementation(async (operation) => operation(owner.database));
  return { ...owner, media, reads, transactions };
}

it('reads each dependency store once per bounded group of expired roots', async () => {
  const f = fixture(129);
  await expect(cleanupDrafts(args)).resolves.toEqual({
    movedCount: 129,
    movedIds: f.media.map((row) => row.id),
    retainedCount: 0,
  });
  expect(f.transactions).toHaveBeenCalledTimes(3);
  for (const store of [
    'project_assets',
    'scenario_assets',
    'video_projects',
    'video_workspaces',
    'video_workspace_history',
  ]) {
    expect(f.reads.mock.calls.filter(([name]) => name === store)).toHaveLength(3);
  }
  expect(f.rows.get('asset_operations')!.size).toBe(0);
  for (const row of f.media)
    expect(f.rows.get('media_library')!.get(row.id)).toEqual({
      ...row,
      lifecycle: { ...row.lifecycle, trashedAt: now },
    });
});

function addReference(f: ReturnType<typeof fixture>, mediaId: string) {
  const video = createVideoProjectEntryWithMediaClip();
  video.project.assets[0]!.source = { kind: 'library-asset', mediaId };
  f.rows.get('video_projects')!.set(video.id, { ...video, usageReferenceKeys: ['indexed:v2'] });
}

it('retains a dependency committed after discovery without trusting an incomplete advisory index', async () => {
  const f = fixture(3);
  mocks.mutate.mockImplementation(async (operation) => {
    addReference(f, f.media[1]!.id);
    return operation(f.database);
  });
  await expect(cleanupDrafts(args)).resolves.toEqual({
    movedCount: 2,
    movedIds: [f.media[0]!.id, f.media[2]!.id],
    retainedCount: 1,
  });
  expect(f.rows.get('media_library')!.get(f.media[1]!.id)).toEqual(f.media[1]);
});

it('rereads dependency evidence when the next batch starts', async () => {
  const f = fixture(66);
  let admissions = 0;
  mocks.mutate.mockImplementation(async (operation) => {
    if (++admissions === 2) addReference(f, f.media[64]!.id);
    return operation(f.database);
  });
  const result = await cleanupDrafts(args);
  expect(result.movedIds).toEqual(f.media.filter((_, index) => index !== 64).map((row) => row.id));
  expect(result.retainedCount).toBe(1);
  expect(f.rows.get('media_library')!.get(f.media[64]!.id)).toEqual(f.media[64]);
});

it('does not scan references or overwrite a permanent recreation of the candidate identity', async () => {
  const f = fixture(1);
  const replacement = {
    ...f.media[0]!,
    filename: 'replacement.png',
    lifecycle: createLibraryLifecycle('library', now),
  };
  mocks.mutate.mockImplementation(async (operation) => {
    f.rows.get('media_library')!.delete(replacement.id);
    f.rows.get('media_library')!.set(replacement.id, replacement);
    return operation(f.database);
  });
  await expect(cleanupDrafts(args)).resolves.toEqual({
    movedCount: 0,
    movedIds: [],
    retainedCount: 0,
  });
  expect(f.reads).not.toHaveBeenCalled();
  expect(f.rows.get('media_library')!.get(replacement.id)).toEqual(replacement);
});

it('rolls back every staged move in the failed batch before an explicit retry', async () => {
  let writes = 0;
  let fail = true;
  const f = fixture(3, (store) => store === 'media_library' && ++writes === 2 && fail);
  await expect(cleanupDrafts(args)).rejects.toMatchObject({
    result: { movedCount: 0, movedIds: [], retainedCount: 0 },
    cause: { name: 'QuotaExceededError' },
  });
  expect([...f.rows.get('media_library')!.values()]).toEqual(f.media);
  fail = false;
  await expect(cleanupDrafts(args)).resolves.toEqual({
    movedCount: 3,
    movedIds: f.media.map((row) => row.id),
    retainedCount: 0,
  });
});

it('does not start a queued batch after cancellation and preserves the previous commit', async () => {
  const controller = new AbortController();
  const f = fixture(66);
  let admissions = 0;
  mocks.mutate.mockImplementation(async (operation) => {
    if (++admissions === 2) controller.abort();
    return operation(f.database);
  });
  await expect(cleanupDrafts({ ...args, signal: controller.signal })).resolves.toEqual({
    movedCount: 64,
    movedIds: f.media.slice(0, 64).map((row) => row.id),
    retainedCount: 0,
  });
  expect(f.transactions).toHaveBeenCalledTimes(1);
  expect(f.rows.get('media_library')!.get(f.media[64]!.id)).toEqual(f.media[64]);
});

it.each(['video_projects', 'scenario_assets', 'video_workspaces', 'video_workspace_history'])(
  'retains the complete batch when %s contains ambiguous evidence',
  async (store) => {
    const f = fixture(3);
    f.rows.get(store)!.set('unknown', {
      id: 'unknown',
      aggregateId: 'unknown',
      formatVersion: 999,
      project: { version: 999 },
      usageReferenceKeys: ['indexed:v2'],
    });
    await expect(cleanupDrafts(args)).resolves.toEqual({
      movedCount: 0,
      movedIds: [],
      retainedCount: 3,
    });
    expect([...f.rows.get('media_library')!.values()]).toEqual(f.media);
  }
);

it.each([
  {
    name: 'private project asset',
    mediaSource: { kind: 'project-asset', projectAssetId: 'file' },
    source: { kind: 'project-asset', projectAssetId: 'file' },
  },
  {
    name: 'private media origin',
    mediaSource: { kind: 'screenshot' },
    source: { kind: 'project-asset', projectAssetId: 'file', originMediaId: 'root-0' },
  },
  {
    name: 'recording locator',
    mediaSource: { kind: 'recording', recordingId: 'recording' },
    source: { kind: 'recording', recordingId: 'recording' },
  },
  {
    name: 'private recording origin',
    mediaSource: { kind: 'recording', recordingId: 'recording' },
    source: { kind: 'project-asset', projectAssetId: 'file', originRecordingId: 'recording' },
  },
] satisfies {
  name: string;
  mediaSource: MediaLibraryEntry['source'];
  source: VideoProjectAssetSource;
}[])(
  'retains the canonical $name identity from freshly admitted video evidence',
  async ({ mediaSource, source }) => {
    const f = fixture(1);
    f.media[0]!.source = mediaSource;
    if (mediaSource.kind === 'recording') {
      f.media[0]!.kind = 'recording';
      f.media[0]!.mimeType = 'video/webm';
      delete f.media[0]!.imageContentState;
    }
    const video = createVideoProjectEntryWithMediaClip();
    video.project.assets[0]!.source = source;
    f.rows.get('video_projects')!.set(video.id, video);
    await expect(cleanupDrafts(args)).resolves.toEqual({
      movedCount: 0,
      movedIds: [],
      retainedCount: 1,
    });
    expect(f.rows.get('media_library')!.get(f.media[0]!.id)).toEqual(f.media[0]);
  }
);

it.each(['base', 'origin'] as const)(
  'retains a %s primary recording without any placement asset',
  async (kind) => {
    const f = fixture(1);
    f.media[0]!.source = { kind: 'recording', recordingId: 'recording' };
    f.media[0]!.kind = 'recording';
    f.media[0]!.mimeType = 'video/webm';
    delete f.media[0]!.imageContentState;
    const video = createVideoProjectEntryWithMediaClip();
    video.project.assets = [];
    if (kind === 'base') video.project.baseRecordingId = 'recording';
    else video.project.source = { kind: 'recording', recordingId: 'recording' };
    f.rows.get('video_projects')!.set(video.id, video);
    await expect(cleanupDrafts(args)).resolves.toEqual({
      movedCount: 0,
      movedIds: [],
      retainedCount: 1,
    });
  }
);

it('keeps a private auxiliary named by another workspace and permits an unrelated root', async () => {
  const f = fixture(2);
  f.media[0]!.source = { kind: 'project-asset', projectAssetId: 'private-music' };
  const advanced = createQuickEditAdvancedState();
  advanced.audio.music.push({
    id: 'music',
    assetId: 'project-asset:private-music',
    timelineStart: 0,
    sourceOffset: 0,
    duration: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  });
  const review = {
    aggregateId: 'other',
    formatVersion: 1,
    sourceAssetId: 'source',
    source: { duration: 2, width: 100, height: 100, size: 5, mimeType: 'video/webm' },
    revision: 1,
    cursor: 0,
    history: [],
    advanced,
    createdAt: 1,
    updatedAt: 1,
  };
  f.rows.get('video_workspaces')!.set('other', review);
  await expect(cleanupDrafts(args)).resolves.toEqual({
    movedCount: 1,
    movedIds: [f.media[1]!.id],
    retainedCount: 1,
  });
  expect(f.rows.get('media_library')!.get(f.media[0]!.id)).toEqual(f.media[0]);
  expect(f.rows.get('video_workspaces')!.get('other')).toEqual(review);
});

it('preserves the existing retention match for a legacy empty base-recording locator', async () => {
  const f = fixture(1);
  f.media[0]!.source = { kind: 'recording', recordingId: '' };
  f.media[0]!.kind = 'recording';
  f.media[0]!.mimeType = 'video/webm';
  delete f.media[0]!.imageContentState;
  const video = createVideoProjectEntryWithMediaClip();
  video.project.assets = [];
  video.project.baseRecordingId = '';
  f.rows.get('video_projects')!.set(video.id, video);
  expect(videoEntryIsUnrelated(video, f.media[0]!, new Set())).toBe(false);
  await expect(cleanupDrafts(args)).resolves.toEqual({
    movedCount: 0,
    movedIds: [],
    retainedCount: 1,
  });
});

it('retains a reference in a late bounded video page and refuses malformed late evidence', async () => {
  vi.stubGlobal('IDBKeyRange', {
    lowerBound: (lower: IDBValidKey, lowerOpen: boolean) => ({ lower, lowerOpen }),
  });
  try {
    const f = fixture(2);
    const videos = f.rows.get('video_projects')!;
    for (let index = 0; index < 1025; index++) {
      const id = `video-${String(index).padStart(4, '0')}`;
      videos.set(id, createVideoProjectEntryWithMediaClip({ id }));
    }
    const reference = createVideoProjectEntryWithMediaClip({ id: 'video-1024' });
    reference.project.assets[0]!.source = { kind: 'library-asset', mediaId: f.media[0]!.id };
    videos.set(reference.id, reference);
    const result = await cleanupDrafts(args);
    expect(result).toMatchObject({ movedIds: [f.media[1]!.id], retainedCount: 1 });
    expect(f.reads.mock.calls.filter(([name]) => name === 'video_projects')).toEqual([
      ['video_projects', 512],
      ['video_projects', 512],
      ['video_projects', 512],
    ]);
    const retained = fixture(1);
    for (const [id, value] of videos) retained.rows.get('video_projects')!.set(id, value);
    retained.rows.get('video_projects')!.set('video-1024', { id: 'video-1024' });
    await expect(cleanupDrafts(args)).resolves.toMatchObject({ movedCount: 0, retainedCount: 1 });
    expect(retained.rows.get('media_library')!.get(retained.media[0]!.id)).toEqual(
      retained.media[0]
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
