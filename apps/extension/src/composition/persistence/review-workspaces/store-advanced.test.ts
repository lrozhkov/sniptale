import { reviewAdvancedContentBaseline } from '../../../features/video/review/document';
import { createQuickEditSpotlight } from '../../../features/video/review/advanced/focus';
import { createQuickEditZoomRegion } from '../../../features/video/review/advanced/zoom';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  createReviewWorkspaceStoreFixture,
  replaceLegacyWorkspaceFixture,
} from './store.test-support';
import type { ReviewAnnotation, ReviewOperation } from '../../../features/video/review/types';
import { parseVideoWorkspace } from './parser';

const harness = vi.hoisted(() => ({ database: vi.fn(), failure: false }));
vi.mock('../infrastructure/indexed-db/core', () => ({
  initDB: harness.database,
  MEDIA_LIBRARY_STORE: 'media_library',
  VIDEO_WORKSPACES_STORE: 'video_workspaces',
  VIDEO_WORKSPACE_HISTORY_STORE: 'video_workspace_history',
  VIDEO_WORKSPACE_DRAFTS_STORE: 'video_workspace_drafts',
}));
vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  listReadyJournals: vi.fn(async () => []),
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(await harness.database()),
}));

import {
  commitVideoWorkspace,
  openVideoWorkspace,
  readVideoWorkspace,
  saveVideoWorkspaceAdvanced,
} from './store';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { QUICK_EDIT_ADVANCED_SCHEMA_VERSION } from '../../../features/video/review/advanced/types';

const id = 'recording:beta-v1-recording';
const source = { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 };
const annotation: ReviewAnnotation = {
  id: 'a',
  text: 'Before',
  anchor: { kind: 'point', time: 2 },
};
const operation: ReviewOperation = {
  id: 'op1',
  at: 1,
  target: 'annotation',
  before: null,
  after: annotation,
};
let rows: Map<string, Map<string, unknown>>;

beforeEach(() => {
  harness.failure = false;
  const fixture = createReviewWorkspaceStoreFixture(() => harness.failure);
  rows = fixture.rows;
  harness.database.mockResolvedValue(fixture.database);
});

it.each(['basic', 'advanced'] as const)(
  'retains a new project choice until %s is accepted and rejects a stale choice',
  async (mode) => {
    const initial = await openVideoWorkspace(id, source);
    expect(initial.workspace.advanced.ui.modeSelectionPending).toBe(true);
    expect((await openVideoWorkspace(id, source)).workspace.advanced.ui.modeSelectionPending).toBe(
      true
    );
    const advanced = structuredClone(initial.workspace.advanced);
    advanced.ui.mode = mode;
    advanced.ui.modeSelectionPending = false;
    const request = {
      aggregateId: id,
      expectedSourceAssetId: 'beta-v1-recording-asset',
      expectedRevision: initial.workspace.revision,
      advanced,
    };
    await saveVideoWorkspaceAdvanced(request);
    await expect(
      saveVideoWorkspaceAdvanced({ ...request, advanced: initial.workspace.advanced })
    ).rejects.toMatchObject({ code: 'conflict' });
    const reopened = await openVideoWorkspace(id, source);
    expect(reopened.workspace.advanced.ui).toMatchObject({ mode, modeSelectionPending: false });
    expect(reopened.workspace.history).toEqual([]);
  }
);

it('does not request an initial mode choice for an existing project without the flag', async () => {
  const initial = await openVideoWorkspace(id, source);
  delete initial.workspace.advanced.ui.modeSelectionPending;
  await saveVideoWorkspaceAdvanced({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: initial.workspace.revision,
    advanced: initial.workspace.advanced,
  });
  expect(
    (await openVideoWorkspace(id, source)).workspace.advanced.ui.modeSelectionPending
  ).toBeUndefined();
});

it('opens legacy workspaces with advanced defaults and persists explicit replacement', async () => {
  const opened = await openVideoWorkspace(id, source);
  expect(parseVideoWorkspace({ ...opened.workspace, advanced: undefined })?.advanced).toEqual(
    createQuickEditAdvancedState()
  );
  const advanced = {
    ...createQuickEditAdvancedState(),
    ui: {
      mode: 'advanced',
      tracks: { actions: true, zoom: true, audio: true },
      overlaysVisible: true,
    },
  };
  const saved = await saveVideoWorkspaceAdvanced({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: opened.workspace.revision,
    advanced,
  });
  expect(saved.workspace.advanced).toEqual(advanced);
  const reopened = await openVideoWorkspace(id, source);
  expect(reopened.workspace.advanced).toEqual(advanced);
});

it('commits advanced content as a fixed-point history payload and reopens its baseline', async () => {
  const opened = await openVideoWorkspace(id, source);
  const before = reviewAdvancedContentBaseline(opened.workspace.advanced);
  const after = {
    ...before,
    zoom: {
      enabled: true,
      regions: [
        {
          ...createQuickEditZoomRegion({ id: 'focus', at: 0 }),
          spotlight: createQuickEditSpotlight(),
        },
      ],
    },
    canvas: { width: 1080, height: 1920 },
    audio: {
      ...before.audio,
      original: { muted: true, volume: 0.5 },
      laneVolumes: { voiceover: 0.8, music: 0.4 },
    },
  };
  const committed = await commitVideoWorkspace({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: opened.workspace.revision,
    operation: {
      id: 'advanced-1',
      at: 2,
      target: 'advancedContent',
      before,
      after,
    },
  });
  expect(committed.workspace.history[0]).toMatchObject({
    target: 'advancedContent',
    before: { schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION },
    after: { schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION },
  });
  expect((await readVideoWorkspace(id))?.workspace).toEqual(committed.workspace);
  expect(parseVideoWorkspace(committed.workspace)).toEqual(committed.workspace);
  expect(committed.workspace.history[0]?.after).toEqual(after);
});

it('migrates a v1 advanced payload on load and keeps the workspace writable (R03)', async () => {
  replaceLegacyWorkspaceFixture(rows, id, {
    aggregateId: id,
    sourceAssetId: 'beta-v1-recording-asset',
    formatVersion: 1,
    source,
    revision: 1,
    cursor: 2,
    history: [
      {
        id: 'edit-cut-1',
        at: 1,
        target: 'edit',
        before: null,
        after: { id: 'cut-1', start: 0, end: 2, requestedStart: 0, requestedEnd: 2, kind: 'cut' },
      },
      {
        id: 'edit-speed-1',
        at: 2,
        target: 'edit',
        before: null,
        after: {
          id: 'speed-1',
          start: 2,
          end: 6,
          requestedStart: 2,
          requestedEnd: 6,
          kind: 'speed',
          rate: 2,
          audio: 'speed',
        },
      },
    ],
    createdAt: 1,
    updatedAt: 1,
    advanced: {
      schemaVersion: 1,
      ui: {
        mode: 'advanced',
        tracks: { actions: true, zoom: true, audio: true },
        overlaysVisible: true,
      },
      zoom: {
        enabled: true,
        regions: [
          {
            id: 'z2',
            start: 0.5,
            end: 1.5,
            transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
            enter: { type: 'none', duration: 0 },
            exit: { type: 'none', duration: 0 },
          },
          {
            id: 'z1',
            start: 8,
            end: 10,
            transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
            enter: { type: 'ease-in-out', duration: 0.3 },
            exit: { type: 'ease-in-out', duration: 0.3 },
          },
        ],
      },
      background: { enabled: false },
      audio: { original: { muted: false, volume: 1 }, voiceover: [], music: [] },
    },
  });
  const opened = await openVideoWorkspace(id, source);
  expect(opened.workspace.advanced.schemaVersion).toBe(QUICK_EDIT_ADVANCED_SCHEMA_VERSION);
  expect(opened.workspace.advanced.zoom.regions[0]).toMatchObject({
    start: 0.5,
    end: 1.5,
    dormant: true,
  });
  expect(opened.workspace.advanced.zoom.regions[1]).toMatchObject({
    start: 4,
    end: 6,
    dormant: false,
  });
  // Every write re-validates the migrated record: dormant source coords stay exempt.
  const saved = await saveVideoWorkspaceAdvanced({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: opened.workspace.revision,
    advanced: opened.workspace.advanced,
  });
  expect(saved.workspace.advanced.zoom.regions).toHaveLength(2);
  const committed = await commitVideoWorkspace({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: saved.workspace.revision,
    operation,
  });
  expect(committed.workspace.history).toHaveLength(3);
});

it('rejects stale or malformed advanced saves without touching the record', async () => {
  const opened = await openVideoWorkspace(id, source);
  const retained = structuredClone(rows.get('video_workspaces')!.get(id));
  await expect(
    saveVideoWorkspaceAdvanced({
      aggregateId: id,
      expectedSourceAssetId: 'beta-v1-recording-asset',
      expectedRevision: opened.workspace.revision + 1,
      advanced: createQuickEditAdvancedState(),
    })
  ).rejects.toMatchObject({ code: 'conflict' });
  await expect(
    saveVideoWorkspaceAdvanced({
      aggregateId: id,
      expectedSourceAssetId: 'wrong-asset',
      expectedRevision: opened.workspace.revision,
      advanced: createQuickEditAdvancedState(),
    })
  ).rejects.toMatchObject({ code: 'conflict' });
  await expect(
    saveVideoWorkspaceAdvanced({
      aggregateId: id,
      expectedSourceAssetId: 'beta-v1-recording-asset',
      expectedRevision: opened.workspace.revision,
      advanced: { broken: true },
    })
  ).rejects.toMatchObject({ code: 'invalid' });
  expect(rows.get('video_workspaces')!.get(id)).toEqual(retained);
});

it('advances the revision for advanced saves so history writers detect the change', async () => {
  const opened = await openVideoWorkspace(id, source);
  const saved = await saveVideoWorkspaceAdvanced({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: opened.workspace.revision,
    advanced: createQuickEditAdvancedState(),
  });
  expect(saved.workspace.revision).toBe(opened.workspace.revision + 1);
  expect(saved.workspace.history).toEqual([]);
  expect(saved.workspace.cursor).toBe(0);
  await expect(
    commitVideoWorkspace({
      aggregateId: id,
      expectedSourceAssetId: 'beta-v1-recording-asset',
      expectedRevision: opened.workspace.revision,
      operation,
    })
  ).rejects.toMatchObject({ code: 'conflict' });
});

it('keeps schema version constant in stored advanced state', async () => {
  const opened = await openVideoWorkspace(id, source);
  const saved = await saveVideoWorkspaceAdvanced({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: opened.workspace.revision,
    advanced: createQuickEditAdvancedState(),
  });
  expect(saved.workspace.advanced.schemaVersion).toBe(QUICK_EDIT_ADVANCED_SCHEMA_VERSION);
});
