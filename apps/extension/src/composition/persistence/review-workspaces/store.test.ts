import { createQuickEditSpotlight } from '../../../features/video/review/advanced/focus';
import { createQuickEditZoomRegion } from '../../../features/video/review/advanced/zoom';
import { beforeEach, expect, it, vi } from 'vitest';
import { betaV1Fixture } from '../infrastructure/indexed-db/fixtures/beta-v1';
import type { ReviewAnnotation, ReviewOperation } from '../../../features/video/review/types';
import { parseVideoWorkspace } from './parser';

const harness = vi.hoisted(() => ({ database: vi.fn(), failure: false }));
vi.mock('../infrastructure/indexed-db/core', () => ({
  initDB: harness.database,
  MEDIA_LIBRARY_STORE: 'media_library',
  VIDEO_WORKSPACES_STORE: 'video_workspaces',
  VIDEO_WORKSPACE_DRAFTS_STORE: 'video_workspace_drafts',
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(await harness.database()),
}));

import {
  commitVideoWorkspace,
  moveVideoWorkspaceHistory,
  openVideoWorkspace,
  readVideoWorkspace,
  saveVideoWorkspaceAdvanced,
  saveVideoWorkspaceDraft,
} from './store';
import {
  createQuickEditAdvancedContent,
  createQuickEditAdvancedState,
} from '../../../features/video/review/advanced/defaults';
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
  rows = new Map([
    ['media_library', new Map([[id, betaV1Fixture.records.media_library[0]]])],
    ['recordings', new Map([['beta-v1-recording', betaV1Fixture.records.recordings[0]]])],
    ['project_assets', new Map()],
    ['project_exports', new Map()],
    ['video_workspaces', new Map()],
    ['video_workspace_drafts', new Map()],
  ]);
  harness.database.mockResolvedValue({
    transaction: (_stores: string[], mode: string) => {
      const pending = structuredClone(rows);
      let aborted = false;
      return {
        abort() {
          aborted = true;
        },
        objectStore(name: string) {
          const store = pending.get(name)!;
          return {
            get: async (key: string) => structuredClone(store.get(key)),
            put: async (value: { aggregateId: string }) => {
              if (harness.failure) throw new DOMException('No space', 'QuotaExceededError');
              store.set(value.aggregateId, structuredClone(value));
            },
            delete: async (key: string) => {
              store.delete(key);
            },
          };
        },
        get done() {
          if (aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
          if (mode === 'readwrite') rows = pending;
          return Promise.resolve();
        },
      };
    },
  });
});

it('reopens exactly one durable history and rejects missing, malformed or changed media', async () => {
  const opened = await openVideoWorkspace(id, source);
  expect(opened.workspace.revision).toBe(1);
  expect(await openVideoWorkspace(id, source)).toEqual(opened);
  await expect(openVideoWorkspace(id, { ...source, duration: 14 })).rejects.toMatchObject({
    code: 'changed-source',
  });
  await expect(openVideoWorkspace('missing', source)).rejects.toMatchObject({
    code: 'missing-media',
  });
  await expect(openVideoWorkspace(id, { ...source, duration: Infinity })).rejects.toMatchObject({
    code: 'invalid',
  });
  rows.get('video_workspaces')!.set(id, { broken: true });
  await expect(readVideoWorkspace(id)).rejects.toMatchObject({ code: 'invalid' });
  await expect(openVideoWorkspace(id, source)).rejects.toMatchObject({ code: 'invalid' });
  expect(rows.get('video_workspaces')!.get(id)).toEqual({ broken: true });
});

it('recovers text separately and commits/consumes it in a single revisioned transaction', async () => {
  await openVideoWorkspace(id, source);
  const draft = await saveVideoWorkspaceDraft({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: 1,
    expectedDraftRevision: null,
    annotation,
    before: null,
  });
  expect(draft.workspace.history).toEqual([]);
  expect(draft.workspace.revision).toBe(1);
  expect((await readVideoWorkspace(id))?.draft?.annotation.text).toBe('Before');
  const committed = await commitVideoWorkspace({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: 1,
    operation,
    consumeDraftRevision: 1,
  });
  expect(committed.workspace.history).toEqual([operation]);
  expect(committed.draft).toBeNull();
  const undone = await moveVideoWorkspaceHistory({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: 2,
    direction: 'undo',
  });
  expect(undone.workspace.cursor).toBe(0);
  expect(undone.workspace.history).toEqual([operation]);
  const reopened = await openVideoWorkspace(id, source);
  expect(reopened.workspace).toEqual(undone.workspace);
  const redone = await moveVideoWorkspaceHistory({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: 3,
    direction: 'redo',
  });
  expect(redone.workspace.cursor).toBe(1);
});

it('rejects stale saves and preserves the old field and history after quota failure', async () => {
  await openVideoWorkspace(id, source);
  await saveVideoWorkspaceDraft({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: 1,
    expectedDraftRevision: null,
    annotation,
    before: null,
  });
  await expect(
    saveVideoWorkspaceDraft({
      aggregateId: id,
      expectedSourceAssetId: 'beta-v1-recording-asset',
      expectedRevision: 1,
      expectedDraftRevision: null,
      annotation: { ...annotation, text: 'Stale' },
      before: null,
    })
  ).rejects.toMatchObject({ code: 'conflict' });
  await expect(
    commitVideoWorkspace({
      aggregateId: id,
      expectedSourceAssetId: 'beta-v1-recording-asset',
      expectedRevision: 1,
      operation: { ...operation, after: { ...annotation, text: 'Different' } },
      consumeDraftRevision: 1,
    })
  ).rejects.toMatchObject({ code: 'conflict' });
  harness.failure = true;
  await expect(
    commitVideoWorkspace({
      aggregateId: id,
      expectedSourceAssetId: 'beta-v1-recording-asset',
      expectedRevision: 1,
      operation,
      consumeDraftRevision: 1,
    })
  ).rejects.toMatchObject({ name: 'QuotaExceededError' });
  const restored = await readVideoWorkspace(id);
  expect(restored?.workspace.history).toEqual([]);
  expect(restored?.draft?.annotation.text).toBe('Before');
  harness.failure = false;
  await commitVideoWorkspace({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: 1,
    operation,
    consumeDraftRevision: 1,
  });
  await expect(
    commitVideoWorkspace({
      aggregateId: id,
      expectedSourceAssetId: 'beta-v1-recording-asset',
      expectedRevision: 1,
      operation,
    })
  ).rejects.toMatchObject({ code: 'conflict' });
});

it('does not let an old field writer overwrite a new draft after discard', async () => {
  await openVideoWorkspace(id, source);
  await saveVideoWorkspaceDraft({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: 1,
    expectedDraftRevision: null,
    annotation,
    before: null,
  });
  const discarded = await saveVideoWorkspaceDraft({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: 1,
    expectedDraftRevision: 1,
    annotation: null,
    before: null,
  });
  expect(discarded.workspace.history).toEqual([]);
  await saveVideoWorkspaceDraft({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: 2,
    expectedDraftRevision: null,
    annotation: { ...annotation, text: 'New field' },
    before: null,
  });
  await expect(
    saveVideoWorkspaceDraft({
      aggregateId: id,
      expectedSourceAssetId: 'beta-v1-recording-asset',
      expectedRevision: 1,
      expectedDraftRevision: 1,
      annotation,
      before: null,
    })
  ).rejects.toMatchObject({ code: 'conflict' });
});

it('retains more than 100 operations, with persistent undo cursor and strict redo branching', async () => {
  let snapshot = await openVideoWorkspace(id, source);
  for (let index = 0; index < 110; index++) {
    snapshot = await commitVideoWorkspace({
      aggregateId: id,
      expectedSourceAssetId: 'beta-v1-recording-asset',
      expectedRevision: snapshot.workspace.revision,
      operation: { ...operation, id: `op${index}`, after: { ...annotation, id: `a${index}` } },
    });
  }
  expect((await readVideoWorkspace(id))?.workspace.history).toHaveLength(110);
  snapshot = await moveVideoWorkspaceHistory({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: snapshot.workspace.revision,
    direction: 'undo',
  });
  snapshot = await commitVideoWorkspace({
    aggregateId: id,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    expectedRevision: snapshot.workspace.revision,
    operation: { ...operation, id: 'branch', after: { ...annotation, id: 'branch' } },
  });
  expect(snapshot.workspace.history.at(-1)?.id).toBe('branch');
  expect(snapshot.workspace.history).toHaveLength(110);
  expect(
    await moveVideoWorkspaceHistory({
      aggregateId: id,
      expectedSourceAssetId: 'beta-v1-recording-asset',
      expectedRevision: snapshot.workspace.revision,
      direction: 'redo',
    })
  ).toEqual(snapshot);
});

it('validates duplicate operations and the entire redo suffix before accepting stored history', async () => {
  const { workspace } = await openVideoWorkspace(id, source);
  expect(
    parseVideoWorkspace({ ...workspace, history: [operation, operation], cursor: 0 })
  ).toBeNull();
  expect(
    parseVideoWorkspace({
      ...workspace,
      history: [{ ...operation, before: annotation, after: null }],
      cursor: 0,
    })
  ).toBeNull();
  expect(parseVideoWorkspace({ ...workspace, revision: Infinity })).toBeNull();
  expect(parseVideoWorkspace({ ...workspace, cursor: 1 })).toBeNull();
  rows.get('video_workspace_drafts')!.set(id, { aggregateId: 'wrong' });
  await expect(readVideoWorkspace(id)).rejects.toMatchObject({ code: 'invalid' });
});

it('refuses edits against replaced original bytes without deleting the old session', async () => {
  const opened = await openVideoWorkspace(id, source);
  rows
    .get('recordings')!
    .set('beta-v1-recording', { ...betaV1Fixture.records.recordings[0], assetId: 'replacement' });
  await expect(openVideoWorkspace(id, source)).rejects.toMatchObject({ code: 'changed-source' });
  await expect(
    commitVideoWorkspace({
      aggregateId: id,
      expectedSourceAssetId: 'beta-v1-recording-asset',
      expectedRevision: 1,
      operation,
    })
  ).rejects.toMatchObject({ code: 'changed-source' });
  expect(rows.get('video_workspaces')!.get(id)).toEqual(opened.workspace);
});

it('rejects a stale tab after restore even when imported history has the same numeric revision', async () => {
  const opened = await openVideoWorkspace(id, source);
  rows.get('recordings')!.set('beta-v1-recording', {
    ...betaV1Fixture.records.recordings[0],
    assetId: 'restored-local',
  });
  rows.get('video_workspaces')!.set(id, { ...opened.workspace, sourceAssetId: 'restored-local' });
  await expect(
    commitVideoWorkspace({
      aggregateId: id,
      expectedRevision: 1,
      expectedSourceAssetId: 'beta-v1-recording-asset',
      operation,
    })
  ).rejects.toMatchObject({ code: 'conflict' });
  expect((await readVideoWorkspace(id))?.workspace.history).toEqual([]);
});

it('refuses to create a session for a replaced file loaded before opening the editor', async () => {
  await expect(openVideoWorkspace(id, source, 'previous-file')).rejects.toMatchObject({
    code: 'changed-source',
  });
  expect(await readVideoWorkspace(id)).toBeNull();
});

it('opens legacy workspaces with advanced defaults and persists explicit replacement', async () => {
  const opened = await openVideoWorkspace(id, source);
  expect(opened.workspace.advanced).toEqual(createQuickEditAdvancedState());
  expect(parseVideoWorkspace({ ...opened.workspace, advanced: undefined })).toEqual(
    opened.workspace
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
  const before = createQuickEditAdvancedContent();
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
  rows.get('video_workspaces')!.set(id, {
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
  expect(opened.workspace.advanced.schemaVersion).toBe(2);
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
  expect(rows.get('video_workspaces')!.get(id)).toEqual(opened.workspace);
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

it('commits cut focus cleanup atomically and restores source anchors through undo and reload', async () => {
  const opened = await openVideoWorkspace(id, source);
  const advanced = createQuickEditAdvancedState();
  const first = {
    ...createQuickEditZoomRegion({ id: 'first', at: 0, duration: 1 }),
    linkTo: 'removed',
  };
  const removed = { ...createQuickEditZoomRegion({ id: 'removed', at: 3 }), linkTo: 'last' };
  const last = createQuickEditZoomRegion({ id: 'last', at: 9 });
  advanced.zoom.regions = [first, removed, last];
  const saved = await saveVideoWorkspaceAdvanced({
    aggregateId: id,
    expectedRevision: opened.workspace.revision,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    advanced,
  });
  const args = {
    aggregateId: id,
    expectedRevision: saved.workspace.revision,
    expectedSourceAssetId: 'beta-v1-recording-asset',
    operation: {
      id: 'cut-focus',
      at: 10,
      target: 'edit',
      before: null,
      after: { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
    },
  };
  harness.failure = true;
  await expect(commitVideoWorkspace(args)).rejects.toBeDefined();
  expect((await readVideoWorkspace(id))?.workspace).toEqual(saved.workspace);
  harness.failure = false;
  const committed = await commitVideoWorkspace(args);
  const { replayReviewHistory, reviewAdvancedContentBaseline } =
    await import('../../../features/video/review/document');
  const derive = (workspace: typeof saved.workspace) =>
    replayReviewHistory(
      workspace.history,
      workspace.cursor,
      workspace.source,
      reviewAdvancedContentBaseline(workspace.advanced)
    ).advancedContent.zoom.regions;
  expect(derive(committed.workspace)).toEqual([
    createQuickEditZoomRegion({ id: 'first', at: 0, duration: 1 }),
    { ...last, start: 7, end: 9 },
  ]);
  expect((await openVideoWorkspace(id, source)).workspace).toEqual(committed.workspace);
  const undone = await moveVideoWorkspaceHistory({
    ...args,
    expectedRevision: committed.workspace.revision,
    direction: 'undo',
  });
  expect(derive(undone.workspace)).toEqual([first, removed, last]);
  const redone = await moveVideoWorkspaceHistory({
    ...args,
    expectedRevision: undone.workspace.revision,
    direction: 'redo',
  });
  expect(derive(redone.workspace)).toEqual(derive(committed.workspace));
});
