import { beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectEntryWithMediaClip } from '../projects/index.test-support';
import { createGuideProject } from '../../../features/scenario/project/public';
import { createScenarioProjectEntry } from '../scenario/projects/entry';
import type { MediaLibraryEntry } from './contracts';
import type { VideoWorkspace } from '../review-workspaces/contracts';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';

const mocks = vi.hoisted(() => ({
  initDB: vi.fn(),
  videos: vi.fn(),
  scenarios: vi.fn(),
  events: vi.fn(),
}));
vi.mock('../../../features/media-hub/events', () => ({
  subscribeToMediaHubEvents: mocks.events,
}));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.initDB,
}));
vi.mock('../projects/queries', async (original) => ({
  ...(await original<typeof import('../projects/queries')>()),
  listVideoProjectEntries: mocks.videos,
}));
vi.mock('../scenario/projects', async (original) => ({
  ...(await original<typeof import('../scenario/projects')>()),
  listScenarioProjectEntries: mocks.scenarios,
}));

import {
  listMediaAssetProjectUsage,
  listMediaAssetProjectUsageBatch,
  listPreviewMediaAssetProjectUsage,
} from './usage';

let media: MediaLibraryEntry;
let childRows: unknown[];
let reviewRows: unknown[];
let video = createVideoProjectEntryWithMediaClip();
let extraMedia: MediaLibraryEntry | null;

beforeEach(() => {
  mocks.initDB.mockClear();
  mocks.videos.mockClear();
  mocks.scenarios.mockClear();
  extraMedia = null;
  media = {
    id: 'project-asset:original',
    kind: 'image',
    source: { kind: 'project-asset', projectAssetId: 'original' },
    filename: 'image.png',
    originalFilename: 'image.png',
    createdAt: 1,
    updatedAt: 1,
    size: 4,
    mimeType: 'image/png',
    width: 100,
    height: 100,
    duration: null,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: [],
  };
  childRows = [
    {
      id: 'borrowed-child',
      projectId: 'scenario',
      assetId: 'physical',
      galleryAssetId: media.id,
      borrowedMediaId: media.id,
      mimeType: 'image/png',
      width: 100,
      height: 100,
      createdAt: 1,
      size: 4,
    },
  ];
  reviewRows = [];
  mocks.initDB.mockResolvedValue({
    transaction: () => ({
      objectStore: (store: string) => ({
        getAll: async () => (store === 'video_workspaces' ? reviewRows : []),
      }),
      done: Promise.resolve(),
    }),
    get: async (_store: string, id: string) => (id === media.id ? media : undefined),
    getAll: async (store: string) => {
      if (store === 'media_library') return extraMedia ? [media, extraMedia] : [media];
      if (store === 'scenario_assets') return childRows;
      if (store === 'video_workspaces') return reviewRows;
      return [];
    },
  });
  video = createVideoProjectEntryWithMediaClip();
  video.project.assets[0]!.source = { kind: 'library-asset', mediaId: media.id };
  mocks.videos.mockResolvedValue([video]);
  mocks.scenarios.mockResolvedValue([
    createScenarioProjectEntry({
      existing: undefined,
      project: createGuideProject('Guide', 'scenario', 1),
      updatedAt: 1,
    }),
  ]);
});

it('returns no project use when the library identity no longer exists', async () => {
  expect(await listMediaAssetProjectUsage('missing')).toEqual([]);
});

it('marks a recording as required by the primary video project', async () => {
  media = {
    ...media,
    id: 'recording:recording-1',
    kind: 'recording',
    source: { kind: 'recording', recordingId: 'recording-1' },
  };
  video.project.baseRecordingId = 'recording-1';
  video.project.assets[0]!.source = { kind: 'recording', recordingId: 'recording-1' };
  mocks.videos.mockResolvedValue([video]);
  childRows = [];
  expect(await listMediaAssetProjectUsage(media.id)).toEqual([
    { id: video.id, kind: 'video', name: video.project.name, primary: true },
  ]);
});

it('finds a project-asset reference without scenario borrowing', async () => {
  childRows = [];
  video.project.assets[0]!.source = { kind: 'project-asset', projectAssetId: 'original' };
  mocks.videos.mockResolvedValue([video]);
  expect(await listMediaAssetProjectUsage(media.id)).toEqual([
    { id: video.id, kind: 'video', name: video.project.name, primary: false },
  ]);
});

it('finds the original scenario child for a stored library source', async () => {
  media = {
    ...media,
    id: 'scenario-asset:borrowed-child',
    source: { kind: 'stored-asset', assetId: 'physical' },
  };
  childRows = [{ ...(childRows[0] as object), borrowedMediaId: undefined }];
  mocks.videos.mockResolvedValue([]);
  expect(await listMediaAssetProjectUsage(media.id)).toEqual([
    { id: 'scenario', kind: 'scenario', name: 'Guide', primary: false },
  ]);
});

function reviewWorkspace(aggregateId: string): VideoWorkspace {
  return {
    aggregateId,
    formatVersion: 1,
    sourceAssetId: 'review-source',
    source: { duration: 2, width: 640, height: 360, size: 4, mimeType: 'video/webm' },
    revision: 1,
    cursor: 0,
    history: [],
    advanced: createQuickEditAdvancedState(),
    createdAt: 1,
    updatedAt: 1,
  };
}

it('does not treat the media own quick-edit workspace as an external consumer', async () => {
  childRows = [];
  mocks.videos.mockResolvedValue([]);
  reviewRows = [reviewWorkspace(media.id)];
  expect(await listMediaAssetProjectUsage(media.id)).toEqual([]);
});

it('reports a quick-edit audio consumer without marking it primary', async () => {
  childRows = [];
  mocks.videos.mockResolvedValue([]);
  const review = reviewWorkspace('recording:other');
  review.advanced.audio.music.push({
    id: 'music',
    assetId: media.id,
    timelineStart: 0,
    sourceOffset: 0,
    duration: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  });
  reviewRows = [review];
  expect(await listMediaAssetProjectUsage(media.id)).toEqual([
    { id: review.aggregateId, kind: 'review', name: media.filename, primary: false },
  ]);
});

it('reports video and borrowed scenario consumers of one library source', async () => {
  const usage = await listMediaAssetProjectUsage('project-asset:original');
  expect(usage).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'video', primary: false }),
      { id: 'scenario', kind: 'scenario', name: 'Guide', primary: false },
    ])
  );
  expect(usage).toHaveLength(2);
});

it('loads the full graph once for a batch instead of once per selected file', async () => {
  extraMedia = {
    ...media,
    id: 'second',
    source: { kind: 'project-asset', projectAssetId: 'second' },
  };
  const getAll = vi.fn(async (store: string) => {
    if (store === 'media_library') return [media, extraMedia];
    if (store === 'scenario_assets') return childRows;
    if (store === 'video_workspaces') return reviewRows;
    return [];
  });
  mocks.initDB.mockResolvedValue({
    get: async (_store: string, id: string) => (id === media.id ? media : extraMedia),
    getAll,
    transaction: () => ({
      objectStore: (store: string) => ({ getAll: () => getAll(store) }),
      done: Promise.resolve(),
    }),
  });
  const previous = await Promise.all([media.id, extraMedia.id].map(listMediaAssetProjectUsage));
  expect(mocks.videos).toHaveBeenCalledTimes(2);
  expect(getAll).toHaveBeenCalledTimes(10);
  mocks.videos.mockClear();
  mocks.scenarios.mockClear();
  getAll.mockClear();
  const batch = await listMediaAssetProjectUsageBatch([
    media.id,
    extraMedia.id,
    media.id,
    'missing',
  ]);
  expect(batch).toEqual(
    new Map([
      [media.id, previous[0]],
      [extraMedia.id, previous[1]],
      ['missing', []],
    ])
  );
  expect(mocks.videos).toHaveBeenCalledOnce();
  expect(mocks.scenarios).toHaveBeenCalledOnce();
  expect(getAll).toHaveBeenCalledTimes(5);
});

it('reads each deletion preparation freshly without trusting an advisory index', async () => {
  const first = await listMediaAssetProjectUsageBatch([media.id]);
  expect(first.get(media.id)?.length).toBeGreaterThan(0);
  mocks.videos.mockResolvedValue([]);
  mocks.scenarios.mockResolvedValue([]);
  expect(await listMediaAssetProjectUsageBatch([media.id])).toEqual(new Map([[media.id, []]]));
});

it('does no storage work for an empty deletion selection and propagates failed authoritative reads', async () => {
  expect(await listMediaAssetProjectUsageBatch([])).toEqual(new Map());
  expect(mocks.initDB).not.toHaveBeenCalled();
  mocks.videos.mockRejectedValueOnce(new Error('database unavailable'));
  await expect(listMediaAssetProjectUsageBatch([media.id])).rejects.toThrow('database unavailable');
});

it('includes a private scenario import in the permanent deletion warning', async () => {
  childRows = [
    { ...(childRows[0] as object), borrowedMediaId: undefined, assetId: 'private-copy' },
  ];
  mocks.videos.mockResolvedValue([]);
  expect(await listMediaAssetProjectUsage(media.id)).toEqual([
    { id: 'scenario', kind: 'scenario', name: 'Guide', primary: false },
  ]);
});

it('keeps independent scenario imports outside the deletion warning', async () => {
  childRows = [
    {
      ...(childRows[0] as object),
      borrowedMediaId: undefined,
      galleryAssetId: 'another-library',
      assetId: 'private-copy',
    },
  ];
  mocks.videos.mockResolvedValue([]);
  expect(await listMediaAssetProjectUsage(media.id)).toEqual([]);
});

it('shows a frozen video representation as a consumer of its inserted Library identity', async () => {
  childRows = [];
  media.source = { kind: 'screenshot' };
  video.project.assets[0]!.source = {
    kind: 'project-asset',
    projectAssetId: 'private-copy',
    originMediaId: media.id,
  };
  expect(await listMediaAssetProjectUsage(media.id)).toEqual([
    { id: video.id, kind: 'video', name: video.project.name, primary: false },
  ]);
});

it('reads inspector relationships through indexes without any global document list or recovery', async () => {
  const getAll = vi.fn(async () => {
    throw new Error('full scan forbidden');
  });
  mocks.videos.mockRejectedValueOnce(new Error('global video list forbidden'));
  mocks.scenarios.mockRejectedValueOnce(new Error('scenario recovery forbidden'));
  mocks.initDB.mockResolvedValue({
    get: async (_store: string, id: string) => (id === media.id ? media : undefined),
    getAll,
    transaction: () => ({
      objectStore: () => ({
        count: async () => 0,
        index: () => ({ count: async () => 0, getAll: async () => [] }),
      }),
      done: Promise.resolve(),
    }),
    getAllFromIndex: async () => [],
  });
  await expect(listPreviewMediaAssetProjectUsage(media.id)).resolves.toEqual([]);
  expect(getAll).not.toHaveBeenCalled();
  expect(mocks.videos).not.toHaveBeenCalled();
  expect(mocks.scenarios).not.toHaveBeenCalled();
});

it('cleans up advisory event, focus and visibility subscriptions when the inspector unmounts', async () => {
  const windowEvents = new EventTarget();
  const documentEvents = Object.assign(new EventTarget(), { visibilityState: 'hidden' });
  vi.stubGlobal('window', windowEvents);
  vi.stubGlobal('document', documentEvents);
  const unsubscribe = vi.fn();
  mocks.events.mockReturnValueOnce(unsubscribe);
  const { subscribeToPreviewProjectUsageInvalidation } = await import('./usage');
  const listener = vi.fn();
  try {
    const dispose = subscribeToPreviewProjectUsageInvalidation(listener);
    const event = mocks.events.mock.calls.at(-1)![0];
    event({ type: 'unrelated' });
    documentEvents.dispatchEvent(new Event('visibilitychange'));
    expect(listener).not.toHaveBeenCalled();
    event({ type: 'library-changed' });
    windowEvents.dispatchEvent(new Event('focus'));
    documentEvents.visibilityState = 'visible';
    documentEvents.dispatchEvent(new Event('visibilitychange'));
    expect(listener).toHaveBeenCalledTimes(3);
    dispose();
    windowEvents.dispatchEvent(new Event('focus'));
    documentEvents.dispatchEvent(new Event('visibilitychange'));
    expect(listener).toHaveBeenCalledTimes(3);
    expect(unsubscribe).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});
