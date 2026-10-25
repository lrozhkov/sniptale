import { createQuickEditSpotlight } from '../../../features/video/project/scene/focus-appearance';
import { createLibraryLifecycle } from '../library-lifecycle/contracts';
import { reviewAdvancedContentBaseline } from '../../../features/video/review/document';

import { createQuickEditZoomRegion } from '../../../features/video/review/advanced/zoom';
import { beforeEach, expect, it, vi } from 'vitest';
import { betaV1Fixture } from '../infrastructure/indexed-db/fixtures/beta-v1';
import {
  createReviewWorkspaceStoreFixture,
  replaceLegacyWorkspaceFixture,
} from './store.test-support';
import type { ReviewAnnotation, ReviewOperation } from '../../../features/video/review/types';
import { inspectVideoWorkspace, parseVideoWorkspace } from './parser';

const harness = vi.hoisted(() => ({
  database: vi.fn(),
  failure: false,
  writes: Promise.resolve<unknown>(undefined),
}));
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
  runWithIndexedDbMutation: (operation: (db: unknown) => Promise<unknown>) => {
    // Model IndexedDB's serialization of overlapping readwrite transactions.
    const result = harness.writes.then(async () => operation(await harness.database()));
    harness.writes = result.catch(() => undefined);
    return result;
  },
}));

import {
  commitVideoWorkspace,
  createVideoWorkspaceProject,
  moveVideoWorkspaceHistory,
  openVideoWorkspace,
  readVideoWorkspace,
  saveVideoWorkspaceAdvanced,
  saveVideoWorkspaceDraft,
  saveVideoWorkspaceSnapshot,
} from './store';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { deleteVideoWorkspaceProject } from './project-commands';

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
  harness.writes = Promise.resolve();
  const fixture = createReviewWorkspaceStoreFixture(() => harness.failure);
  rows = fixture.rows;
  harness.database.mockResolvedValue(fixture.database);
});

it('preserves lane membership and locks through durable history and retry', async () => {
  const opened = await openVideoWorkspace(id, source);
  const before = reviewAdvancedContentBaseline(opened.workspace.advanced);
  const disabled = { ...before, actionsEnabled: false };
  const saved = await saveVideoWorkspaceSnapshot({
    aggregateId: id,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    expectedRevision: opened.workspace.revision,
    expectedDraftRevision: null,
    workspace: {
      ...opened.workspace,
      advanced: {
        ...opened.workspace.advanced,
        ui: { ...opened.workspace.advanced.ui, lockedTracks: { actions: true } },
      },
      history: [
        { id: 'off', at: 1, target: 'advancedContent', before, after: disabled },
        { id: 'on', at: 2, target: 'advancedContent', before: disabled, after: before },
      ],
      cursor: 2,
    },
    draft: null,
  });
  const request = {
    aggregateId: id,
    expectedSourceAssetId: saved.workspace.sourceAssetId,
    expectedRevision: saved.workspace.revision,
    direction: 'undo' as const,
  };
  harness.failure = true;
  await expect(moveVideoWorkspaceHistory(request)).rejects.toThrow();
  expect(await readVideoWorkspace(id)).toEqual(saved);
  harness.failure = false;
  const undone = await moveVideoWorkspaceHistory(request);
  expect(undone.workspace.advanced.ui.tracks.actions).toBe(true);
  const redone = await moveVideoWorkspaceHistory({
    ...request,
    expectedRevision: undone.workspace.revision,
    direction: 'redo',
  });
  expect(redone.workspace.advanced.ui.tracks.actions).toBe(true);
  const start = await moveVideoWorkspaceHistory({
    ...request,
    expectedRevision: redone.workspace.revision,
    direction: 'start',
  });
  expect(start.workspace.cursor).toBe(0);
  expect(start.workspace.advanced.ui.tracks.actions).toBe(true);
  expect(start.workspace.advanced.ui.lockedTracks?.actions).toBe(true);
  expect((await openVideoWorkspace(id, source)).workspace).toEqual(start.workspace);
});

it('reopens exactly one durable history and rejects missing, malformed or changed media', async () => {
  const opened = await openVideoWorkspace(id, source);
  expect(opened.workspace.revision).toBe(1);
  expect(opened.workspace.advanced.background.zoomBehavior).toBe('window');
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
  replaceLegacyWorkspaceFixture(rows, id, { broken: true });
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

it('retains 50 transitions with full current content and strict redo branching', async () => {
  let snapshot = await openVideoWorkspace(id, source);
  for (let index = 0; index < 110; index++) {
    snapshot = await commitVideoWorkspace({
      aggregateId: id,
      expectedSourceAssetId: 'beta-v1-recording-asset',
      expectedRevision: snapshot.workspace.revision,
      operation: { ...operation, id: `op${index}`, after: { ...annotation, id: `a${index}` } },
    });
  }
  expect((await readVideoWorkspace(id))?.workspace.history).toHaveLength(50);
  expect(snapshot.workspace.baseline?.annotations).toHaveLength(60);
  expect(inspectVideoWorkspace(snapshot.workspace).document?.annotations).toHaveLength(110);
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
  expect(snapshot.workspace.history).toHaveLength(50);
  expect(inspectVideoWorkspace(snapshot.workspace).document?.annotations).toHaveLength(110);
  expect(
    inspectVideoWorkspace(snapshot.workspace).document?.annotations.some(
      (item) => item.id === 'a109'
    )
  ).toBe(false);
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
  await openVideoWorkspace(id, source);
  const retained = structuredClone(rows.get('video_workspaces')!.get(id));
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
  expect(rows.get('video_workspaces')!.get(id)).toEqual(retained);
});

it('rejects a stale tab after restore even when imported history has the same numeric revision', async () => {
  const opened = await openVideoWorkspace(id, source);
  const before = reviewAdvancedContentBaseline(opened.workspace.advanced);
  const restoredCanvas = {
    width: 360,
    height: 360,
    crop: { x: 0.1, y: 0, width: 0.5625, height: 1 },
  };
  rows.get('recordings')!.set('beta-v1-recording', {
    ...betaV1Fixture.records.recordings[0],
    assetId: 'restored-local',
  });
  replaceLegacyWorkspaceFixture(rows, id, {
    ...opened.workspace,
    sourceAssetId: 'restored-local',
    advanced: {
      ...opened.workspace.advanced,
      canvas: restoredCanvas,
      ui: {
        ...opened.workspace.advanced.ui,
        workspaceColors: { dark: '#123456ff' },
        lockedTracks: { source: true },
        tracks: { ...opened.workspace.advanced.ui.tracks, originalAudio: false },
      },
    },
  });
  await expect(
    commitVideoWorkspace({
      aggregateId: id,
      expectedRevision: 1,
      expectedSourceAssetId: 'beta-v1-recording-asset',
      operation: {
        id: 'stale-crop',
        at: 1,
        target: 'advancedContent',
        before,
        after: {
          ...before,
          canvas: { ...restoredCanvas, crop: { ...restoredCanvas.crop, x: 0.3 } },
        },
      },
    })
  ).rejects.toMatchObject({ code: 'conflict' });
  await expect(
    saveVideoWorkspaceAdvanced({
      aggregateId: id,
      expectedRevision: 1,
      expectedSourceAssetId: 'beta-v1-recording-asset',
      advanced: opened.workspace.advanced,
    })
  ).rejects.toMatchObject({ code: 'conflict' });
  expect((await readVideoWorkspace(id))?.workspace.advanced.ui.workspaceColors).toEqual({
    dark: '#123456ff',
  });
  expect((await readVideoWorkspace(id))?.workspace.history).toEqual([]);
  expect((await readVideoWorkspace(id))?.workspace.advanced.canvas).toEqual(restoredCanvas);
});

it('refuses to create a session for a replaced file loaded before opening the editor', async () => {
  await expect(openVideoWorkspace(id, source, 'previous-file')).rejects.toMatchObject({
    code: 'changed-source',
  });
  expect(await readVideoWorkspace(id)).toBeNull();
});

it('commits cut focus preservation atomically and restores source geometry through undo and reload', async () => {
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
  const { replayReviewHistory } = await import('../../../features/video/review/document');
  const derive = (workspace: typeof saved.workspace) =>
    replayReviewHistory(
      workspace.history,
      workspace.cursor,
      workspace.source,
      reviewAdvancedContentBaseline(workspace.advanced)
    ).advancedContent.zoom.regions;
  expect(derive(committed.workspace)).toMatchObject([
    { ...first, sourceAnchor: { start: 0, end: 1 } },
    { ...removed, start: 2, end: 3, sourceAnchor: { start: 3, end: 5 } },
    { ...last, start: 7, end: 9, sourceAnchor: { start: 9, end: 11 } },
  ]);
  expect((await openVideoWorkspace(id, source)).workspace).toEqual(committed.workspace);
  const undone = await moveVideoWorkspaceHistory({
    ...args,
    expectedRevision: committed.workspace.revision,
    direction: 'undo',
  });
  expect(derive(undone.workspace)).toMatchObject([first, removed, last]);
  const redone = await moveVideoWorkspaceHistory({
    ...args,
    expectedRevision: undone.workspace.revision,
    direction: 'redo',
  });
  expect(derive(redone.workspace)).toEqual(derive(committed.workspace));
});

it('atomically resumes a buffer and rejects a second tab at the old workspace revision', async () => {
  const { saveVideoWorkspaceSnapshot } = await import('./store');
  const opened = await openVideoWorkspace(id, source);
  const args = {
    aggregateId: id,
    expectedRevision: 1,
    expectedDraftRevision: null,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    workspace: { ...opened.workspace, history: [operation], cursor: 1 },
    draft: null,
  };
  const saved = await saveVideoWorkspaceSnapshot(args);
  expect(saved.workspace.history).toEqual([operation]);
  expect(saved.workspace.revision).toBe(2);
  await expect(saveVideoWorkspaceSnapshot(args)).rejects.toMatchObject({ code: 'conflict' });
  expect(await readVideoWorkspace(id)).toEqual(saved);
});

it('rejects a competing draft-only writer without replacing its text', async () => {
  const { saveVideoWorkspaceSnapshot } = await import('./store');
  const opened = await openVideoWorkspace(id, source);
  const draft = await saveVideoWorkspaceDraft({
    aggregateId: id,
    expectedRevision: 1,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    expectedDraftRevision: null,
    annotation,
    before: null,
  });
  await expect(
    saveVideoWorkspaceSnapshot({
      aggregateId: id,
      expectedRevision: 1,
      expectedSourceAssetId: opened.workspace.sourceAssetId,
      expectedDraftRevision: null,
      workspace: opened.workspace,
      draft: null,
    })
  ).rejects.toMatchObject({ code: 'conflict' });
  expect(await readVideoWorkspace(id)).toEqual(draft);
});

it('rejects malformed buffered snapshots and rolls back storage failures', async () => {
  const { saveVideoWorkspaceSnapshot } = await import('./store');
  const opened = await openVideoWorkspace(id, source);
  const args = {
    aggregateId: id,
    expectedRevision: 1,
    expectedDraftRevision: null,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    workspace: opened.workspace,
    draft: null,
  };
  await expect(saveVideoWorkspaceSnapshot({ ...args, workspace: {} })).rejects.toMatchObject({
    code: 'invalid',
  });
  await expect(saveVideoWorkspaceSnapshot({ ...args, draft: {} })).rejects.toMatchObject({
    code: 'invalid',
  });
  harness.failure = true;
  await expect(saveVideoWorkspaceSnapshot(args)).rejects.toThrow('No space');
  expect(await readVideoWorkspace(id)).toEqual(opened);
});

it('preserves a focus drag under Cut through undo, redo and reopen', async () => {
  const opened = await openVideoWorkspace(id, source);
  const before = reviewAdvancedContentBaseline(opened.workspace.advanced);
  const authored = {
    ...createQuickEditZoomRegion({ id: 'focus', at: 0, duration: 2 }),
    sourceAnchor: { start: 0, end: 2 },
    spotlight: createQuickEditSpotlight(),
  };
  before.zoom = { enabled: true, regions: [authored] };
  const saved = await saveVideoWorkspaceAdvanced({
    aggregateId: id,
    expectedRevision: opened.workspace.revision,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    advanced: { ...opened.workspace.advanced, zoom: before.zoom },
  });
  const cut = await commitVideoWorkspace({
    aggregateId: id,
    expectedRevision: saved.workspace.revision,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    operation: {
      id: 'cut',
      at: 1,
      target: 'edit',
      before: null,
      after: { id: 'cut', kind: 'cut', start: 3, end: 7, requestedStart: 3, requestedEnd: 7 },
    },
  });
  const { replayReviewHistory } = await import('../../../features/video/review/document');
  const current = replayReviewHistory(
    cut.workspace.history,
    cut.workspace.cursor,
    cut.workspace.source,
    reviewAdvancedContentBaseline(cut.workspace.advanced)
  ).advancedContent;
  const moved = {
    ...current,
    zoom: { enabled: true, regions: [{ ...authored, sourceAnchor: { start: 4, end: 6 } }] },
  };
  const committed = await commitVideoWorkspace({
    aggregateId: id,
    expectedRevision: cut.workspace.revision,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    operation: { id: 'drag', at: 2, target: 'advancedContent', before: current, after: moved },
  });
  const derive = (workspace: typeof opened.workspace) =>
    replayReviewHistory(
      workspace.history,
      workspace.cursor,
      workspace.source,
      reviewAdvancedContentBaseline(workspace.advanced)
    ).advancedContent.zoom.regions[0];
  expect(derive(committed.workspace)).toMatchObject({
    start: 0,
    end: 2,
    sourceAnchor: { start: 4, end: 6 },
  });
  const historyArgs = { aggregateId: id, expectedSourceAssetId: opened.workspace.sourceAssetId };
  const undone = await moveVideoWorkspaceHistory({
    ...historyArgs,
    expectedRevision: committed.workspace.revision,
    direction: 'undo',
  });
  expect(derive(undone.workspace)?.sourceAnchor).toEqual({ start: 0, end: 2 });
  const redone = await moveVideoWorkspaceHistory({
    ...historyArgs,
    expectedRevision: undone.workspace.revision,
    direction: 'redo',
  });
  expect(derive(redone.workspace)).toEqual(derive(committed.workspace));
  expect(derive((await openVideoWorkspace(id, source)).workspace)).toEqual(
    derive(committed.workspace)
  );
});

it('recovers legacy header history read-only, then commits and reopens normalized undo/redo', async () => {
  const opened = await openVideoWorkspace(id, source);
  const content = reviewAdvancedContentBaseline(opened.workspace.advanced);
  const legacyHeader = { kind: 'browser', title: 'Old browser', url: 'https://example.test' };
  const legacy = {
    ...opened.workspace,
    advanced: { ...opened.workspace.advanced, windowHeader: legacyHeader },
    cursor: 1,
    history: [
      {
        id: 'old-header',
        at: 1,
        target: 'advancedContent',
        before: content,
        after: { ...content, windowHeader: legacyHeader },
      },
    ],
  };
  replaceLegacyWorkspaceFixture(rows, id, structuredClone(legacy));
  const recovered = await readVideoWorkspace(id);
  expect(recovered?.workspace.history).toEqual([]);
  expect(recovered?.workspace.cursor).toBe(0);
  expect(recovered?.workspace.advanced.windowHeader).toBeUndefined();
  expect(rows.get('video_workspaces')!.get(id)).toEqual(legacy);
  expect(await openVideoWorkspace(id, source)).toEqual(recovered);
  expect(rows.get('video_workspaces')!.get(id)).toEqual(legacy);
  const committed = await commitVideoWorkspace({
    aggregateId: id,
    expectedRevision: opened.workspace.revision,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    operation,
  });
  expect(committed.workspace.history).toEqual([operation]);
  const undone = await moveVideoWorkspaceHistory({
    aggregateId: id,
    expectedRevision: committed.workspace.revision,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    direction: 'undo',
  });
  expect(undone.workspace.cursor).toBe(0);
  expect((await readVideoWorkspace(id))?.workspace.history).toEqual([operation]);
});

it('authors new presentation defaults once and never installs them on legacy reopen', async () => {
  const opened = await openVideoWorkspace(id, source);
  expect(opened.workspace.advanced.presentation).toMatchObject({
    fadeIn: { enabled: true, duration: 0.4 },
    fadeOut: { enabled: true, duration: 0.4 },
    audioFade: false,
    intro: { mode: 'none' },
    outro: { mode: 'none' },
  });
  expect(await openVideoWorkspace(id, source)).toEqual(opened);
  const { presentation: _presentation, ...legacyAdvanced } = opened.workspace.advanced;
  replaceLegacyWorkspaceFixture(rows, id, {
    ...opened.workspace,
    advanced: { ...legacyAdvanced, schemaVersion: 5 },
  });
  expect((await openVideoWorkspace(id, source)).workspace.advanced.presentation).toBeUndefined();
});

it.each(['create', 'reopen'] as const)(
  'retains the primary quick-edit source and recording atomically on %s',
  async (mode) => {
    if (mode === 'reopen') await openVideoWorkspace(id, source);
    const media = betaV1Fixture.records.media_library[0]!;
    const recording = betaV1Fixture.records.recordings[0]!;
    rows
      .get('media_library')!
      .set(id, { ...media, lifecycle: createLibraryLifecycle('temporary', 1) });
    rows
      .get('recordings')!
      .set(recording.id, { ...recording, lifecycle: createLibraryLifecycle('temporary', 1) });
    const snapshot = await openVideoWorkspace(id, source);
    expect(snapshot.workspace.history).toEqual([]);
    expect(rows.get('media_library')!.get(id)).toMatchObject({
      lifecycle: { storageClass: 'library' },
    });
    expect(rows.get('recordings')!.get(recording.id)).toMatchObject({
      assetId: recording.assetId,
      lifecycle: { storageClass: 'library' },
    });
  }
);

it('rolls back primary promotion when initial workspace publication fails', async () => {
  const media = betaV1Fixture.records.media_library[0]!;
  const recording = betaV1Fixture.records.recordings[0]!;
  rows
    .get('media_library')!
    .set(id, { ...media, lifecycle: createLibraryLifecycle('temporary', 1) });
  rows
    .get('recordings')!
    .set(recording.id, { ...recording, lifecycle: createLibraryLifecycle('temporary', 1) });
  const before = structuredClone(rows);
  harness.failure = true;
  await expect(openVideoWorkspace(id, source)).rejects.toThrow();
  expect(rows).toEqual(before);
});

it.each([1, 2] as const)(
  'keeps read-only legacy format %s and materializes one permanent project on explicit reopen',
  async (formatVersion) => {
    const opened = await openVideoWorkspace(id, source);
    const { project: _project, ...legacy } = opened.workspace;
    replaceLegacyWorkspaceFixture(rows, id, {
      ...legacy,
      formatVersion,
      ...(formatVersion === 2
        ? {
            baseline: {
              annotations: [],
              edits: [],
              canvasComments: [],
              advancedContent: reviewAdvancedContentBaseline(legacy.advanced),
            },
          }
        : {}),
    });
    const before = structuredClone(rows);
    expect((await readVideoWorkspace(id))?.workspace.project).toBeUndefined();
    expect(rows).toEqual(before);
    const reopened = await openVideoWorkspace(id, source);
    expect(reopened.workspace).toMatchObject({
      formatVersion: formatVersion === 2 ? 4 : 3,
      revision: legacy.revision + 1,
      history: legacy.history,
      sourceAssetId: legacy.sourceAssetId,
      project: { name: 'beta-v1.webm', lifecycle: { storageClass: 'library' } },
    });
    expect(await openVideoWorkspace(id, source)).toEqual(reopened);
  }
);

it('refuses a new quick-edit project on a trashed source without implicit restore or promotion', async () => {
  const media = betaV1Fixture.records.media_library[0]!;
  rows
    .get('media_library')!
    .set(id, { ...media, lifecycle: { ...createLibraryLifecycle('temporary', 1), trashedAt: 3 } });
  const before = structuredClone(rows);
  await expect(openVideoWorkspace(id, source)).rejects.toMatchObject({ code: 'missing-media' });
  expect(rows).toEqual(before);
});

it('materializes legacy metadata and consumes recovery in one workspace revision', async () => {
  const opened = await openVideoWorkspace(id, source);
  await saveVideoWorkspaceDraft({
    aggregateId: id,
    expectedRevision: 1,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    expectedDraftRevision: null,
    annotation,
    before: null,
  });
  const { project: _project, ...legacy } = opened.workspace;
  replaceLegacyWorkspaceFixture(rows, id, { ...legacy, formatVersion: 1 });
  const result = await saveVideoWorkspaceDraft({
    aggregateId: id,
    expectedRevision: 1,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    expectedDraftRevision: 1,
    annotation: null,
    before: null,
  });
  expect(result.draft).toBeNull();
  expect(result.workspace).toMatchObject({
    revision: 2,
    formatVersion: 3,
    project: { lifecycle: { storageClass: 'library' } },
  });
});

it('preserves authoritative project name and Trash when a buffered content snapshot contains different metadata', async () => {
  const opened = await openVideoWorkspace(id, source);
  const project = {
    name: 'Retained name',
    lifecycle: { storageClass: 'library' as const, savedAt: 1, updatedAt: 2, trashedAt: 3 },
  };
  replaceLegacyWorkspaceFixture(rows, id, { ...opened.workspace, project });
  const snapshot = await saveVideoWorkspaceSnapshot({
    aggregateId: id,
    expectedRevision: 1,
    expectedDraftRevision: null,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    workspace: {
      ...opened.workspace,
      project: {
        name: 'Buffer name',
        lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2 },
      },
    },
    draft: null,
  });
  expect(snapshot.workspace.project).toEqual(project);
  expect((await readVideoWorkspace(id))?.workspace.project).toEqual(project);
});

it.each(['legacy', 'metadata', 'rollback'] as const)(
  'retains external Library origins on explicit reopen (%s)',
  async (mode) => {
    let failPublication = false;
    const fixture = createReviewWorkspaceStoreFixture(
      (storeName) => failPublication && storeName === 'video_workspaces'
    );
    rows = fixture.rows;
    harness.database.mockResolvedValue(fixture.database);
    const opened = await openVideoWorkspace(id, source);
    const { project, ...legacy } = opened.workspace;
    const workspace = {
      ...legacy,
      ...(mode === 'metadata' ? { project } : { formatVersion: 1 }),
      advanced: {
        ...legacy.advanced,
        audio: {
          ...legacy.advanced.audio,
          music: [
            {
              id: 'music',
              assetId: 'project-asset:music',
              timelineStart: 0,
              sourceOffset: 0,
              duration: 1,
              volume: 1,
              muted: false,
              fadeIn: 0,
              fadeOut: 0,
            },
          ],
        },
      },
    };
    replaceLegacyWorkspaceFixture(rows, id, workspace);
    rows.get('project_assets')!.set('music', {
      id: 'music',
      assetId: 'music-bytes',
      originMediaId: 'origin',
      mimeType: 'audio/mpeg',
      size: 4,
      createdAt: 1,
    });
    rows.get('media_library')!.set('origin', {
      ...betaV1Fixture.records.media_library[0]!,
      id: 'origin',
      kind: 'audio',
      mimeType: 'audio/mpeg',
      source: { kind: 'stored-asset', assetId: 'origin-bytes' },
      size: 4,
      duration: 1,
      width: null,
      height: null,
      lifecycle: { ...createLibraryLifecycle('temporary', 1), trashedAt: 3 },
    });
    expect((await readVideoWorkspace(id))?.workspace.advanced.audio.music).toHaveLength(1);
    const before = structuredClone(rows);
    failPublication = mode === 'rollback';
    if (failPublication) {
      await expect(openVideoWorkspace(id, source)).rejects.toThrow();
      expect(rows).toEqual(before);
    } else {
      const reopened = await openVideoWorkspace(id, source);
      expect(reopened.workspace.advanced.audio.music).toEqual(workspace.advanced.audio.music);
      expect(rows.get('media_library')!.get('origin')).toMatchObject({
        lifecycle: { storageClass: 'library', trashedAt: 3 },
      });
      expect(await openVideoWorkspace(id, source)).toEqual(reopened);
    }
  }
);

it('preserves crop history across stale writers, quota refusal, retry, undo and reopen', async () => {
  const opened = await openVideoWorkspace(id, source);
  const before = reviewAdvancedContentBaseline(opened.workspace.advanced);
  const canvas = { width: 360, height: 360, crop: { x: 0.2, y: 0, width: 0.5625, height: 1 } };
  const args = {
    aggregateId: id,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    expectedRevision: opened.workspace.revision,
    operation: {
      id: 'crop',
      at: 1,
      target: 'advancedContent' as const,
      before,
      after: { ...before, canvas },
    },
  };
  harness.failure = true;
  await expect(commitVideoWorkspace(args)).rejects.toMatchObject({ name: 'QuotaExceededError' });
  expect(await readVideoWorkspace(id)).toEqual(opened);
  harness.failure = false;
  const saved = await commitVideoWorkspace(args);
  await expect(commitVideoWorkspace(args)).rejects.toMatchObject({ code: 'conflict' });
  const reopened = await openVideoWorkspace(id, source);
  expect(reopened.workspace.history).toHaveLength(1);
  expect(reopened.workspace.history[0]).toMatchObject({ after: { canvas } });
  const undone = await moveVideoWorkspaceHistory({
    aggregateId: id,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    expectedRevision: saved.workspace.revision,
    direction: 'undo',
  });
  expect(undone.workspace.cursor).toBe(0);
  const redone = await moveVideoWorkspaceHistory({
    aggregateId: id,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    expectedRevision: undone.workspace.revision,
    direction: 'redo',
  });
  expect(redone.workspace.history).toEqual(saved.workspace.history);
});

it('preserves workspace colors against a parallel stale UI writer and through reopen', async () => {
  const opened = await openVideoWorkspace(id, source);
  const advanced = {
    ...opened.workspace.advanced,
    ui: {
      ...opened.workspace.advanced.ui,
      workspaceColors: { light: '#abcdefff', dark: '#123456ff' },
      lockedTracks: { source: true, music: true },
      tracks: { ...opened.workspace.advanced.ui.tracks, originalAudio: false, music: true },
    },
  };
  const request = {
    aggregateId: id,
    expectedRevision: opened.workspace.revision,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    advanced,
  };
  await saveVideoWorkspaceAdvanced(request);
  await expect(
    saveVideoWorkspaceAdvanced({ ...request, advanced: opened.workspace.advanced })
  ).rejects.toMatchObject({ code: 'conflict' });
  const reopened = await openVideoWorkspace(id, source);
  expect(reopened.workspace.advanced.ui).toEqual(advanced.ui);
  expect(reopened.workspace.history).toEqual([]);
});

it('starts a new default while preserving complete quick-project history and recovery', async () => {
  let previous = await openVideoWorkspace(id, source);
  previous = await commitVideoWorkspace({
    aggregateId: id,
    expectedRevision: previous.workspace.revision,
    expectedSourceAssetId: previous.workspace.sourceAssetId,
    operation,
  });
  previous = await moveVideoWorkspaceHistory({
    aggregateId: id,
    expectedRevision: previous.workspace.revision,
    expectedSourceAssetId: previous.workspace.sourceAssetId,
    direction: 'undo',
  });
  previous = await saveVideoWorkspaceDraft({
    aggregateId: id,
    expectedRevision: previous.workspace.revision,
    expectedSourceAssetId: previous.workspace.sourceAssetId,
    annotation,
    before: null,
    expectedDraftRevision: null,
  });
  const archiveId = 'recording:quick-project:archive';
  const next = await createVideoWorkspaceProject({
    aggregateId: id,
    expectedRevision: previous.workspace.revision,
    expectedSourceAssetId: previous.workspace.sourceAssetId,
    archiveId,
  });
  expect(next.workspace).toMatchObject({
    aggregateId: id,
    revision: previous.workspace.revision + 1,
    history: [],
    cursor: 0,
  });
  expect(next.workspace.createdAt).toBeGreaterThan(previous.workspace.createdAt);
  expect(next.draft).toBeNull();
  const archived = await readVideoWorkspace(archiveId);
  expect(archived).toEqual({
    workspace: { ...previous.workspace, aggregateId: archiveId, sourceMediaId: id },
    draft: { ...previous.draft, aggregateId: archiveId },
  });
  expect(await openVideoWorkspace(id, source)).toEqual(next);
  expect(await openVideoWorkspace(archiveId, source)).toEqual(archived);
  await expect(
    commitVideoWorkspace({
      aggregateId: id,
      expectedRevision: previous.workspace.revision,
      expectedSourceAssetId: previous.workspace.sourceAssetId,
      operation,
    })
  ).rejects.toMatchObject({ code: 'conflict' });
});

it('acknowledges New retry without resetting subsequent edits or changing another source', async () => {
  const otherId = 'recording:other-video';
  rows
    .get('media_library')!
    .set(otherId, { ...betaV1Fixture.records.media_library[0], id: otherId });
  const other = await openVideoWorkspace(otherId, source);
  const previous = await openVideoWorkspace(id, source);
  const args = {
    aggregateId: id,
    expectedRevision: previous.workspace.revision,
    expectedSourceAssetId: previous.workspace.sourceAssetId,
    archiveId: 'recording:quick-project:retry',
  };
  const next = await createVideoWorkspaceProject(args);
  const edited = await commitVideoWorkspace({
    aggregateId: id,
    expectedRevision: next.workspace.revision,
    expectedSourceAssetId: next.workspace.sourceAssetId,
    operation,
  });
  expect(await createVideoWorkspaceProject(args)).toEqual(edited);
  expect(await readVideoWorkspace(otherId)).toEqual(other);
  await expect(
    createVideoWorkspaceProject({ ...args, archiveId: 'recording:quick-project:competing' })
  ).rejects.toMatchObject({ code: 'conflict' });
  expect(await readVideoWorkspace('recording:quick-project:competing')).toBeNull();
});

it('rolls back New failure and allows the same command to retry', async () => {
  const previous = await openVideoWorkspace(id, source);
  const before = structuredClone(rows);
  const args = {
    aggregateId: id,
    expectedRevision: previous.workspace.revision,
    expectedSourceAssetId: previous.workspace.sourceAssetId,
    archiveId: 'recording:quick-project:failed',
  };
  harness.failure = true;
  await expect(createVideoWorkspaceProject(args)).rejects.toThrow();
  expect(rows).toEqual(before);
  harness.failure = false;
  const next = await createVideoWorkspaceProject(args);
  expect(next.workspace.revision).toBe(previous.workspace.revision + 1);
  expect((await readVideoWorkspace(args.archiveId))?.workspace.history).toEqual(
    previous.workspace.history
  );
});

it('creates New from an archived project without replacing that project', async () => {
  const initial = await openVideoWorkspace(id, source);
  await createVideoWorkspaceProject({
    aggregateId: id,
    expectedRevision: initial.workspace.revision,
    expectedSourceAssetId: initial.workspace.sourceAssetId,
    archiveId: 'recording:quick-project:first',
  });
  const first = await readVideoWorkspace('recording:quick-project:first');
  if (!first) throw new Error('Missing archived project');
  const next = await createVideoWorkspaceProject({
    aggregateId: first.workspace.aggregateId,
    expectedRevision: first.workspace.revision,
    expectedSourceAssetId: first.workspace.sourceAssetId,
    archiveId: 'recording:quick-project:second',
  });
  expect(next.workspace.aggregateId).toBe(id);
  expect(await readVideoWorkspace('recording:quick-project:first')).toEqual(first);
  expect(
    (await readVideoWorkspace('recording:quick-project:second'))?.workspace.sourceMediaId
  ).toBe(id);
});

it('admits only one of two parallel New commands from the same project revision', async () => {
  const opened = await openVideoWorkspace(id, source);
  const args = {
    aggregateId: id,
    expectedRevision: opened.workspace.revision,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
  };
  const results = await Promise.allSettled([
    createVideoWorkspaceProject({ ...args, archiveId: 'recording:quick-project:parallel-a' }),
    createVideoWorkspaceProject({ ...args, archiveId: 'recording:quick-project:parallel-b' }),
  ]);
  expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
  expect(results[1]).toMatchObject({ reason: { code: 'conflict' } });
  expect(await readVideoWorkspace('recording:quick-project:parallel-a')).not.toBeNull();
  expect(await readVideoWorkspace('recording:quick-project:parallel-b')).toBeNull();
  expect((await readVideoWorkspace(id))?.workspace.revision).toBe(opened.workspace.revision + 1);
});

it('rolls back an archive already written when the new default write fails', async () => {
  let armed = false;
  let heads = 0;
  const fixture = createReviewWorkspaceStoreFixture(
    (store) => armed && store === 'video_workspaces' && ++heads === 2
  );
  harness.database.mockResolvedValue(fixture.database);
  const opened = await openVideoWorkspace(id, source);
  const before = structuredClone(fixture.rows);
  armed = true;
  await expect(
    createVideoWorkspaceProject({
      aggregateId: id,
      expectedRevision: opened.workspace.revision,
      expectedSourceAssetId: opened.workspace.sourceAssetId,
      archiveId: 'recording:quick-project:partial',
    })
  ).rejects.toThrow();
  expect(fixture.rows).toEqual(before);
});

it('retains the archived quick project source after the new default project is purged', async () => {
  const opened = await openVideoWorkspace(id, source);
  const next = await createVideoWorkspaceProject({
    aggregateId: id,
    expectedRevision: opened.workspace.revision,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    archiveId: 'recording:quick-project:retained',
  });
  await deleteVideoWorkspaceProject(id, next.workspace.revision);
  expect(await readVideoWorkspace(id)).toBeNull();
  expect(
    (await readVideoWorkspace('recording:quick-project:retained'))?.workspace.sourceAssetId
  ).toBe(opened.workspace.sourceAssetId);
  expect(
    (await openVideoWorkspace('recording:quick-project:retained', source)).workspace.aggregateId
  ).toBe('recording:quick-project:retained');
});
