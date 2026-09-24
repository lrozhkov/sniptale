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
}));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.initDB,
}));
vi.mock('../projects', async (original) => ({
  ...(await original<typeof import('../projects')>()),
  listVideoProjectEntries: mocks.videos,
}));
vi.mock('../scenario/projects', async (original) => ({
  ...(await original<typeof import('../scenario/projects')>()),
  listScenarioProjectEntries: mocks.scenarios,
}));

import { listMediaAssetProjectUsage } from './usage';

let media: MediaLibraryEntry;
let childRows: unknown[];
let reviewRows: unknown[];
let video = createVideoProjectEntryWithMediaClip();

beforeEach(() => {
  vi.clearAllMocks();
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
    get: async (_store: string, id: string) => (id === media.id ? media : undefined),
    getAll: async (store: string) => {
      if (store === 'media_library') return [media];
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

it('marks a quick-edit source as primary', async () => {
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
