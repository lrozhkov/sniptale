import { workspaceStorageHead, workspaceStorageRows } from '../review-workspaces/storage-format';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  createVideoProjectEntryWithMediaClip,
  createMediaLibraryEntry,
  createProjectAssetEntry,
} from '../projects/index.test-support';
import { createGuideProject } from '../../../features/scenario/project/public';
import { createScenarioProjectEntry } from '../scenario/projects/entry';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import {
  withReviewWorkspaceUsage,
  withVideoProjectUsage,
  usageReferenceKey,
} from './usage-index-keys';
import { readIndexedProjectUsage } from './usage-index';

const mocks = vi.hoisted(() => ({ initDB: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.initDB,
}));
const media = createMediaLibraryEntry({ id: 'media', source: { kind: 'screenshot' } });
let rows: Record<string, unknown[]>;
const getAll = vi.fn(() => {
  throw new Error('Global enumeration forbidden');
});
const getAllFromIndex = vi.fn(async (store: string, index: string, key: string) =>
  (rows[store] ?? [])
    .filter(isRecord)
    .filter((row) => (Array.isArray(row[index]) ? row[index].includes(key) : row[index] === key))
);
const countFromIndex = vi.fn(async () => 0);
beforeEach(() => {
  vi.clearAllMocks();
  rows = { media_library: [media] };
  countFromIndex.mockResolvedValue(0);
  mocks.initDB.mockResolvedValue({
    get: async (store: string, id: string) =>
      rows[store]?.filter(isRecord).find((row) => (row['id'] ?? row['aggregateId']) === id),
    getAll,
    getAllFromIndex,
    transaction: () => ({
      objectStore: (store: string) => ({
        count: async () => 0,
        index: (index: string) => ({
          count: countFromIndex,
          getAll: (key: string) => getAllFromIndex(store, index, key),
        }),
      }),
      done: Promise.resolve(),
    }),
  });
});
it('reports pending coverage instead of false empty relationships', async () => {
  countFromIndex.mockResolvedValueOnce(1);
  await expect(readIndexedProjectUsage(media.id)).rejects.toThrow('not ready');
  expect(getAllFromIndex).not.toHaveBeenCalled();
});
it.each([
  { kind: 'library-asset' as const, mediaId: media.id },
  { kind: 'project-asset' as const, projectAssetId: 'private', originMediaId: media.id },
  { kind: 'project-asset' as const, projectAssetId: 'private' },
  { kind: 'scenario-asset' as const, scenarioAssetId: 'child' },
])('finds montage use by $kind insertion identity without global scans', async (source) => {
  const video = createVideoProjectEntryWithMediaClip();
  video.project.assets[0]!.source = source;
  rows['video_projects'] = [withVideoProjectUsage(video)];
  rows['project_assets'] = [createProjectAssetEntry({ id: 'private', originMediaId: media.id })];
  rows['scenario_assets'] = [
    {
      id: 'child',
      projectId: 'guide',
      assetId: 'bytes',
      galleryAssetId: media.id,
      createdAt: 1,
      size: 4,
      mimeType: 'image/png',
      width: 10,
      height: 10,
    },
  ];
  rows['scenario_projects'] = [
    createScenarioProjectEntry({
      existing: undefined,
      project: createGuideProject('Guide', 'guide', 1),
      updatedAt: 1,
    }),
  ];
  expect(await readIndexedProjectUsage(media.id)).toEqual([
    { id: video.id, kind: 'video', name: video.project.name, primary: false },
    { id: 'guide', kind: 'scenario', name: 'Guide', primary: false },
  ]);
  expect(getAll).not.toHaveBeenCalled();
});
it('finds required recordings without clips and drops old keys when a project changes', async () => {
  rows['media_library'] = [{ ...media, source: { kind: 'recording', recordingId: 'recording' } }];
  const video = createVideoProjectEntryWithMediaClip({ baseRecordingId: 'recording' });
  video.project.assets = [];
  rows['video_projects'] = [withVideoProjectUsage(video)];
  expect(await readIndexedProjectUsage(media.id)).toEqual([
    { id: video.id, kind: 'video', name: video.project.name, primary: true },
  ]);
  video.project.baseRecordingId = null;
  rows['video_projects'] = [
    withVideoProjectUsage({
      ...video,
      usageReferenceKeys: [usageReferenceKey('recording', 'recording')],
    }),
  ];
  expect(await readIndexedProjectUsage(media.id)).toEqual([]);
});
it('finds review auxiliary audio through private provenance and excludes its own workspace', async () => {
  rows['project_assets'] = [createProjectAssetEntry({ id: 'private', originMediaId: media.id })];
  const advanced = createQuickEditAdvancedState();
  advanced.audio.music.push({
    id: 'music',
    assetId: 'project-asset:private',
    timelineStart: 0,
    sourceOffset: 0,
    duration: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  });
  const workspace = {
    aggregateId: 'other',
    formatVersion: 1,
    sourceAssetId: 'source',
    source: { duration: 2, width: 640, height: 360, size: 4, mimeType: 'video/webm' },
    revision: 1,
    cursor: 0,
    history: [],
    advanced,
    createdAt: 1,
    updatedAt: 1,
  };
  const physical = [workspace, { ...workspace, aggregateId: media.id }].map((value) => {
    const admitted = parseVideoWorkspace(value);
    if (!admitted) throw new Error('Invalid indexed review fixture');
    return admitted;
  });
  rows['video_workspaces'] = physical.map((value) =>
    workspaceStorageHead(value, withReviewWorkspaceUsage(value).usageReferenceKeys)
  );
  rows['video_workspace_history'] = physical.flatMap(workspaceStorageRows);
  expect(await readIndexedProjectUsage(media.id)).toEqual([
    { id: 'other', kind: 'review', name: media.filename, primary: false },
  ]);
});
it('does not equate independent identities sharing file metadata or bytes', async () => {
  const video = createVideoProjectEntryWithMediaClip();
  video.project.assets[0]!.source = { kind: 'library-asset', mediaId: 'independent' };
  rows['video_projects'] = [withVideoProjectUsage(video)];
  expect(await readIndexedProjectUsage(media.id)).toEqual([]);
});
