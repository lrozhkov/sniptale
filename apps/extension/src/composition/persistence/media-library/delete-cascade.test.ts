import { beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectEntryWithMediaClip } from '../projects/index.test-support';
import type { MediaLibraryEntry } from './contracts';
import {
  createGuideImageBlock,
  createGuideProject,
  createGuideStep,
} from '../../../features/scenario/project/public';
import { createScenarioProjectEntry } from '../scenario/projects/entry';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';

const harness = vi.hoisted(() => ({
  db: vi.fn(),
  complete: vi.fn(async () => undefined),
}));

vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: harness.db,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(await harness.db()),
}));
vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  completePhysicalDeleteOperation: harness.complete,
}));
vi.mock('../scenario/resource-sessions', () => ({
  tryScenarioResourceCleanup: async (_id: string, operation: () => Promise<unknown>) => operation(),
}));

import {
  deleteMediaAssetWithProjectCascade,
  StaleMediaAssetDeletePreviewError,
} from './delete-cascade';

const mediaId = 'project-asset:project-asset-1';
const physicalId = 'physical-1';

function mediaEntry(): MediaLibraryEntry {
  return {
    id: mediaId,
    kind: 'video',
    source: { kind: 'project-asset', projectAssetId: 'project-asset-1' },
    filename: 'clip.webm',
    originalFilename: 'clip.webm',
    createdAt: 1,
    updatedAt: 1,
    size: 5,
    mimeType: 'video/webm',
    width: 100,
    height: 100,
    duration: 2,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: [],
  };
}

function keyOf(store: string, value: Record<string, unknown>): string {
  if (store === 'asset_owners')
    return JSON.stringify([value['ownerKind'], value['ownerId'], value['role']]);
  if (store === 'video_workspaces' || store === 'video_workspace_drafts')
    return String(value['aggregateId']);
  if (store === 'asset_operations') return String(value['operationId']);
  return String(value['id'] ?? value['assetId']);
}

let rows: Map<string, Map<string, unknown>>;

beforeEach(() => {
  vi.clearAllMocks();
  const project = createVideoProjectEntryWithMediaClip();
  rows = new Map<string, Map<string, unknown>>([
    ['media_library', new Map([[mediaId, mediaEntry()]])],
    ['video_projects', new Map([[project.id, project]])],
    [
      'project_assets',
      new Map([
        [
          'project-asset-1',
          {
            id: 'project-asset-1',
            assetId: physicalId,
            mimeType: 'video/webm',
            createdAt: 1,
            size: 5,
          },
        ],
      ]),
    ],
    [
      'asset_refs',
      new Map([
        [
          physicalId,
          {
            assetId: physicalId,
            size: 5,
            mimeType: 'video/webm',
            createdAt: 1,
            storagePath: 'object',
          },
        ],
      ]),
    ],
    [
      'asset_owners',
      new Map([
        [
          JSON.stringify(['project-asset', 'project-asset-1', 'body']),
          {
            assetId: physicalId,
            ownerId: 'project-asset-1',
            ownerKind: 'project-asset',
            role: 'body',
          },
        ],
      ]),
    ],
  ]);
  harness.db.mockResolvedValue({
    transaction() {
      const pending = structuredClone(rows);
      let aborted = false;
      return {
        abort() {
          aborted = true;
        },
        objectStore(name: string) {
          const store = pending.get(name) ?? new Map<string, unknown>();
          pending.set(name, store);
          return {
            get: async (key: unknown) =>
              store.get(Array.isArray(key) ? JSON.stringify(key) : String(key)),
            getAll: async () => [...store.values()],
            put: async (value: Record<string, unknown>) => {
              store.set(keyOf(name, value), value);
            },
            delete: async (key: unknown) => {
              store.delete(Array.isArray(key) ? JSON.stringify(key) : String(key));
            },
            index: () => ({
              count: async (assetId: string) =>
                [...store.values()].filter(
                  (value) => (value as { assetId?: string }).assetId === assetId
                ).length,
            }),
          };
        },
        get done() {
          if (aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
          rows = pending;
          return Promise.resolve();
        },
      };
    },
  });
});

it('atomically removes placements, library metadata and the last physical owner', async () => {
  const project = [...rows.get('video_projects')!.values()][0] as ReturnType<
    typeof createVideoProjectEntryWithMediaClip
  >;
  await deleteMediaAssetWithProjectCascade(mediaId, [
    { id: project.id, kind: 'video', name: project.project.name, primary: false },
  ]);
  const saved = rows.get('video_projects')!.get(project.id) as typeof project;
  expect(saved.project.assets).toEqual([]);
  expect(saved.project.clips).toEqual([]);
  expect(saved.workspaceRevision).toBe(1);
  expect(rows.get('media_library')?.has(mediaId)).toBe(false);
  expect(rows.get('project_assets')?.has('project-asset-1')).toBe(false);
  expect(rows.get('asset_refs')?.has(physicalId)).toBe(false);
  expect(harness.complete).toHaveBeenCalledTimes(1);
});

it('rolls back when a new project use was not in the user warning', async () => {
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toBeInstanceOf(
    StaleMediaAssetDeletePreviewError
  );
  expect(rows.get('media_library')?.has(mediaId)).toBe(true);
  expect(rows.get('video_projects')!.size).toBe(1);
  expect(harness.complete).not.toHaveBeenCalled();
});

it('deletes an unreferenced library source and its final physical object', async () => {
  rows.get('video_projects')!.clear();
  await deleteMediaAssetWithProjectCascade(mediaId, []);
  expect(rows.get('media_library')?.has(mediaId)).toBe(false);
  expect(rows.get('asset_refs')?.has(physicalId)).toBe(false);
  expect(harness.complete).toHaveBeenCalledTimes(1);
});

it('keeps shared physical bytes when another owner remains', async () => {
  rows.get('video_projects')!.clear();
  rows.get('asset_owners')!.set(JSON.stringify(['scenario-asset', 'other', 'body']), {
    assetId: physicalId,
    ownerId: 'other',
    ownerKind: 'scenario-asset',
    role: 'body',
  });
  await deleteMediaAssetWithProjectCascade(mediaId, []);
  expect(rows.get('media_library')?.has(mediaId)).toBe(false);
  expect(rows.get('asset_refs')?.has(physicalId)).toBe(true);
  expect(rows.get('asset_operations')?.size ?? 0).toBe(0);
  expect(harness.complete).not.toHaveBeenCalled();
});

it('keeps the committed deletion intent when physical cleanup must retry', async () => {
  rows.get('video_projects')!.clear();
  harness.complete.mockRejectedValueOnce(new Error('OPFS unavailable'));
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toThrow('OPFS unavailable');
  expect(rows.get('media_library')?.has(mediaId)).toBe(false);
  expect(rows.get('asset_operations')?.size).toBe(1);
});

it('refuses to delete a recording required as a video primary source', async () => {
  const project = [...rows.get('video_projects')!.values()][0] as ReturnType<
    typeof createVideoProjectEntryWithMediaClip
  >;
  project.project.baseRecordingId = 'recording-1';
  rows.get('video_projects')!.set(project.id, project);
  rows.get('media_library')!.set(mediaId, {
    ...mediaEntry(),
    source: { kind: 'recording', recordingId: 'recording-1' },
  });
  await expect(
    deleteMediaAssetWithProjectCascade(mediaId, [
      { id: project.id, kind: 'video', name: project.project.name, primary: true },
    ])
  ).rejects.toThrow('primary source');
  expect(rows.get('media_library')?.has(mediaId)).toBe(true);
  expect(harness.complete).not.toHaveBeenCalled();
});

it('fails closed on an invalid project row without deleting the file', async () => {
  rows.get('video_projects')!.set('invalid', { id: 'invalid' });
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toMatchObject({
    reason: 'invalid-graph',
  });
  expect(rows.get('media_library')?.has(mediaId)).toBe(true);
  expect(harness.complete).not.toHaveBeenCalled();
});

it('removes an auxiliary quick-edit audio reference and retains its workspace', async () => {
  const advanced = createQuickEditAdvancedState();
  advanced.audio.music.push({
    id: 'music',
    assetId: mediaId,
    timelineStart: 0,
    sourceOffset: 0,
    duration: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  });
  rows.set(
    'video_workspaces',
    new Map([
      [
        'recording:other',
        {
          aggregateId: 'recording:other',
          formatVersion: 1,
          sourceAssetId: 'primary-physical',
          source: { duration: 2, width: 640, height: 360, size: 4, mimeType: 'video/webm' },
          revision: 1,
          cursor: 0,
          history: [],
          advanced,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    ])
  );
  const project = [...rows.get('video_projects')!.values()][0] as ReturnType<
    typeof createVideoProjectEntryWithMediaClip
  >;
  await deleteMediaAssetWithProjectCascade(mediaId, [
    { id: project.id, kind: 'video', name: project.project.name, primary: false },
    { id: 'recording:other', kind: 'review', name: 'clip.webm', primary: false },
  ]);
  const review = rows.get('video_workspaces')!.get('recording:other') as {
    advanced: { audio: { music: unknown[] } };
    revision: number;
  };
  expect(review.advanced.audio.music).toEqual([]);
  expect(review.revision).toBe(2);
});

it('removes scenario image placement and historical child while keeping the scenario', async () => {
  const childId = 'scenario-child-1';
  const scenarioId = 'scenario-1';
  const project = createGuideProject('Guide', scenarioId, 1);
  const step = createGuideStep('Step', 'step-1');
  step.blocks.push(
    createGuideImageBlock({
      id: 'block-1',
      assetId: childId,
      width: 100,
      height: 100,
      source: { kind: 'import', filename: 'image.png' },
    })
  );
  project.items.push(step);
  const entry = createScenarioProjectEntry({ existing: undefined, project, updatedAt: 1 });
  const scenarioMediaId = `scenario-asset:${childId}`;
  rows = new Map<string, Map<string, unknown>>([
    [
      'media_library',
      new Map([
        [
          scenarioMediaId,
          {
            ...mediaEntry(),
            id: scenarioMediaId,
            kind: 'image',
            mimeType: 'image/png',
            source: { kind: 'stored-asset', assetId: physicalId },
          },
        ],
      ]),
    ],
    ['scenario_projects', new Map([[scenarioId, entry]])],
    [
      'scenario_assets',
      new Map([
        [
          childId,
          {
            id: childId,
            projectId: scenarioId,
            assetId: physicalId,
            galleryAssetId: null,
            mimeType: 'image/png',
            width: 100,
            height: 100,
            createdAt: 1,
            size: 5,
          },
        ],
      ]),
    ],
    [
      'asset_owners',
      new Map([
        [
          JSON.stringify(['scenario-asset', childId, 'body']),
          {
            assetId: physicalId,
            ownerId: childId,
            ownerKind: 'scenario-asset',
            role: 'body',
          },
        ],
        [
          JSON.stringify(['media-library', scenarioMediaId, 'source']),
          {
            assetId: physicalId,
            ownerId: scenarioMediaId,
            ownerKind: 'media-library',
            role: 'source',
          },
        ],
      ]),
    ],
    [
      'asset_refs',
      new Map([
        [
          physicalId,
          {
            assetId: physicalId,
            size: 5,
            mimeType: 'image/png',
            createdAt: 1,
            storagePath: 'object',
          },
        ],
      ]),
    ],
  ]);

  await deleteMediaAssetWithProjectCascade(scenarioMediaId, [
    { id: scenarioId, kind: 'scenario', name: 'Guide', primary: false },
  ]);
  const saved = rows.get('scenario_projects')!.get(scenarioId) as typeof entry;
  expect(saved.project.items[0]).toMatchObject({ blocks: [{ kind: 'image-slot' }] });
  expect(rows.get('scenario_assets')?.has(childId)).toBe(false);
  expect(rows.get('media_library')?.has(scenarioMediaId)).toBe(false);
  expect(rows.get('asset_refs')?.has(physicalId)).toBe(false);
});

it('deletes the media own quick-edit workspace together with its root', async () => {
  rows.get('video_projects')!.clear();
  rows.set(
    'video_workspaces',
    new Map([
      [
        mediaId,
        {
          aggregateId: mediaId,
          formatVersion: 1,
          sourceAssetId: physicalId,
          source: { duration: 2, width: 100, height: 100, size: 5, mimeType: 'video/webm' },
          revision: 1,
          cursor: 0,
          history: [],
          advanced: createQuickEditAdvancedState(),
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    ])
  );
  await deleteMediaAssetWithProjectCascade(mediaId, []);
  expect(rows.get('media_library')?.has(mediaId)).toBe(false);
  expect(rows.get('video_workspaces')?.has(mediaId)).toBe(false);
});

it('ignores unrelated invalid scenario metadata with a known disjoint project identity', async () => {
  rows.get('video_projects')!.clear();
  rows.set('scenario_projects', new Map([['other', { id: 'other', invalid: true }]]));
  await deleteMediaAssetWithProjectCascade(mediaId, []);
  expect(rows.get('media_library')?.has(mediaId)).toBe(false);
  expect(rows.get('scenario_projects')?.has('other')).toBe(true);
});

it('ignores invalid metadata on a scenario child with disjoint dependency locators', async () => {
  rows.get('video_projects')!.clear();
  rows.set(
    'scenario_assets',
    new Map([
      ['other', { id: 'other', assetId: 'other-physical', borrowedMediaId: 'other-library' }],
    ])
  );
  await deleteMediaAssetWithProjectCascade(mediaId, []);
  expect(rows.get('scenario_assets')?.has('other')).toBe(true);
});

it('deletes its own invalid quick-edit sidecar without validating it as an external dependency', async () => {
  rows.get('video_projects')!.clear();
  rows.set('video_workspaces', new Map([[mediaId, { aggregateId: mediaId, invalid: true }]]));
  await deleteMediaAssetWithProjectCascade(mediaId, []);
  expect(rows.get('video_workspaces')?.has(mediaId)).toBe(false);
});

it('does not validate unrelated quick-edit rows for a stored image source', async () => {
  rows.get('video_projects')!.clear();
  rows.set('video_workspaces', new Map([['other', { aggregateId: 'other', invalid: true }]]));
  const media = {
    ...mediaEntry(),
    kind: 'image',
    source: { kind: 'stored-asset', assetId: physicalId },
  };
  rows.get('media_library')!.set(mediaId, media);
  await deleteMediaAssetWithProjectCascade(mediaId, []);
  expect(rows.get('video_workspaces')?.has('other')).toBe(true);
});

it('ignores unrelated video entry metadata only when its complete project document proves no use', async () => {
  const entry = createVideoProjectEntryWithMediaClip();
  entry.project.assets[0]!.source = { kind: 'project-asset', projectAssetId: 'other-source' };
  rows.get('video_projects')!.clear();
  rows.get('video_projects')!.set(entry.id, { ...entry, updatedAt: 'invalid' });
  await deleteMediaAssetWithProjectCascade(mediaId, []);
  expect(rows.get('video_projects')?.has(entry.id)).toBe(true);
});

it('refuses related invalid scenario children and retains every store', async () => {
  rows.get('video_projects')!.clear();
  rows.set(
    'scenario_assets',
    new Map([['related', { id: 'related', assetId: physicalId, borrowedMediaId: mediaId }]])
  );
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toMatchObject({
    reason: 'invalid-graph',
    graphDomain: 'scenario-asset',
  });
  expect(rows.get('media_library')?.has(mediaId)).toBe(true);
  expect(rows.get('asset_refs')?.has(physicalId)).toBe(true);
});

it('refuses ambiguous scenario dependency locators', async () => {
  rows.get('video_projects')!.clear();
  rows.set(
    'scenario_assets',
    new Map([['unknown', { id: 'unknown', assetId: physicalId, borrowedMediaId: 42 }]])
  );
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toMatchObject({
    reason: 'invalid-graph',
    graphDomain: 'scenario-asset',
  });
  expect(rows.get('media_library')?.has(mediaId)).toBe(true);
});

it('refuses invalid video metadata when the domain document references the selected media', async () => {
  const entry = createVideoProjectEntryWithMediaClip();
  rows.get('video_projects')!.set(entry.id, { ...entry, updatedAt: 'invalid' });
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toMatchObject({
    reason: 'invalid-graph',
    graphDomain: 'video-project',
  });
  expect(rows.get('media_library')?.has(mediaId)).toBe(true);
});

it('refuses a related invalid scenario root', async () => {
  rows.get('video_projects')!.clear();
  rows.set(
    'scenario_assets',
    new Map([
      [
        'child',
        {
          id: 'child',
          assetId: physicalId,
          projectId: 'related',
          galleryAssetId: mediaId,
          borrowedMediaId: mediaId,
          mimeType: 'image/png',
          width: 100,
          height: 100,
          size: 5,
          createdAt: 1,
        },
      ],
    ])
  );
  rows.set('scenario_projects', new Map([['related', { id: 'related', invalid: true }]]));
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toMatchObject({
    reason: 'invalid-graph',
    graphDomain: 'scenario-project',
  });
  expect(rows.get('scenario_assets')?.has('child')).toBe(true);
  expect(rows.get('media_library')?.has(mediaId)).toBe(true);
});

it('retains a stored image used by an invalid child with legacy empty borrowing', async () => {
  rows.get('video_projects')!.clear();
  rows
    .get('media_library')!
    .set(mediaId, { ...mediaEntry(), source: { kind: 'stored-asset', assetId: physicalId } });
  rows.set(
    'scenario_assets',
    new Map([['related', { id: 'related', assetId: physicalId, borrowedMediaId: '' }]])
  );
  await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toMatchObject({
    reason: 'invalid-graph',
    graphDomain: 'scenario-asset',
  });
  expect(rows.get('media_library')?.has(mediaId)).toBe(true);
});
