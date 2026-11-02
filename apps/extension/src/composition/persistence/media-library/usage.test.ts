import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
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
let snapshotCount = 0;
const globalReads = vi.fn();

beforeEach(() => {
  mocks.initDB.mockReset();
  mocks.videos.mockReset();
  mocks.scenarios.mockReset();
  extraMedia = null;
  snapshotCount = 0;
  globalReads.mockClear();
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
  mocks.initDB.mockImplementation(async () => {
    const fixture = createReviewWorkspaceStoreFixture(() => false);
    for (const rows of fixture.rows.values()) rows.clear();
    const mediaRows = extraMedia ? [media, extraMedia] : [media];
    for (const row of mediaRows) fixture.rows.get('media_library')!.set(row.id, row);
    for (const row of await mocks.videos()) fixture.rows.get('video_projects')!.set(row.id, row);
    for (const row of await mocks.scenarios())
      fixture.rows.get('scenario_projects')!.set(row.id, row);
    for (const row of childRows)
      if (typeof row === 'object' && row !== null && 'id' in row && typeof row.id === 'string')
        fixture.rows.get('scenario_assets')!.set(row.id, row);
    for (const row of reviewRows)
      if (
        typeof row === 'object' &&
        row !== null &&
        'aggregateId' in row &&
        typeof row.aggregateId === 'string'
      )
        fixture.rows.get('video_workspaces')!.set(row.aggregateId, row);
    const transaction = fixture.database.transaction.bind(fixture.database);
    return {
      transaction: (stores: string[], mode: string) => {
        snapshotCount++;
        const tx = transaction(stores, mode);
        const objectStore = tx.objectStore.bind(tx);
        tx.objectStore = (name: string) => {
          const source = objectStore(name);
          source.getAll = async () => {
            globalReads(name);
            throw new Error('Global warning scan forbidden');
          };
          return source;
        };
        return tx;
      },
    };
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

it('reports the media own quick-edit workspace as a primary consumer', async () => {
  childRows = [];
  mocks.videos.mockResolvedValue([]);
  reviewRows = [reviewWorkspace(media.id)];
  expect(await listMediaAssetProjectUsage(media.id)).toEqual([
    { id: media.id, kind: 'review', name: media.filename, primary: true },
  ]);
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

it('uses one selected-source snapshot for a batch without reading unrelated documents', async () => {
  extraMedia = {
    ...media,
    id: 'second',
    source: { kind: 'project-asset', projectAssetId: 'second' },
  };
  const previous = await Promise.all([media.id, extraMedia.id].map(listMediaAssetProjectUsage));
  expect(snapshotCount).toBe(2);
  snapshotCount = 0;
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
  expect(snapshotCount).toBe(1);
  expect(globalReads).not.toHaveBeenCalled();
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

it('includes the saved quick-edit workspace as its recording primary project', async () => {
  media = {
    ...media,
    id: 'recording:primary',
    kind: 'recording',
    source: { kind: 'recording', recordingId: 'primary' },
    filename: 'primary.webm',
    mimeType: 'video/webm',
    width: 640,
    height: 360,
    duration: 2,
  };
  childRows = [];
  mocks.videos.mockResolvedValue([]);
  mocks.scenarios.mockResolvedValue([]);
  reviewRows = [reviewWorkspace(media.id)];
  expect(await listMediaAssetProjectUsage(media.id)).toEqual([
    { id: media.id, kind: 'review', name: media.filename, primary: true },
  ]);
});
