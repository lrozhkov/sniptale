import { createLibraryLifecycle } from '../library-lifecycle/contracts';
import { reviewAdvancedContentBaseline } from '../../../features/video/review/document';
import { createQuickEditSpotlight } from '../../../features/video/review/advanced/focus';
import { createQuickEditZoomRegion } from '../../../features/video/review/advanced/zoom';
import { beforeEach, expect, it, vi } from 'vitest';
import { betaV1Fixture } from '../infrastructure/indexed-db/fixtures/beta-v1';
import {
  createReviewWorkspaceStoreFixture,
  replaceLegacyWorkspaceFixture,
} from './store.test-support';
import type { ReviewAnnotation, ReviewOperation } from '../../../features/video/review/types';
import { inspectVideoWorkspace, parseVideoWorkspace } from './parser';

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
  moveVideoWorkspaceHistory,
  openVideoWorkspace,
  readVideoWorkspace,
  saveVideoWorkspaceAdvanced,
  saveVideoWorkspaceDraft,
} from './store';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';

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
  rows.get('recordings')!.set('beta-v1-recording', {
    ...betaV1Fixture.records.recordings[0],
    assetId: 'restored-local',
  });
  replaceLegacyWorkspaceFixture(rows, id, { ...opened.workspace, sourceAssetId: 'restored-local' });
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

it.fails.each(['create', 'reopen'] as const)(
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
