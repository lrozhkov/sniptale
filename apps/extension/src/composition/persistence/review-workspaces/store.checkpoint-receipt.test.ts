import { beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from './store.test-support';
import { betaV1Fixture } from '../infrastructure/indexed-db/fixtures/beta-v1';
import { initDB } from '../infrastructure/indexed-db/core';
import type { VideoWorkspaceSnapshot } from './contracts';
import { parseSyncCaptureRecord } from '../sync-capture/guards';
import { captureVideoReviewInTransaction } from '../sync-capture/capture';
import { deferCheckpointInTransaction } from '../sync-capture/checkpoints';
import { parseCapturedReview } from '../sync-capture/review-snapshot';
import { inspectVideoWorkspace } from './parser';
import { editReviewTextFragment } from '../../../features/video/review/text-document';
import {
  createVideoWorkspaceProject,
  openVideoWorkspace,
  readVideoWorkspace,
  saveVideoWorkspaceAdvanced,
  saveVideoWorkspaceDraft,
  saveVideoWorkspaceSnapshot,
  saveVideoWorkspaceTyping,
  commitVideoWorkspace,
  commitVideoWorkspaceWithProjection,
  moveVideoWorkspaceHistory,
} from './store';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
type Gate = {
  entered: ReturnType<typeof deferred<void>>;
  finish: ReturnType<typeof deferred<void>>;
};
const io = vi.hoisted(() => ({
  database: vi.fn(),
  writes: Promise.resolve<unknown>(undefined),
  ack: undefined as Gate | undefined,
}));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: (operation: (db: unknown) => Promise<unknown>) => {
    const ack = io.ack;
    io.ack = undefined;
    const committed = io.writes.then(async () => operation(await io.database()));
    io.writes = committed.catch(() => undefined);
    return committed.then(async (result) => {
      if (ack) {
        ack.entered.resolve();
        await ack.finish.promise;
      }
      return result;
    });
  },
}));
vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  listReadyJournals: vi.fn(async () => []),
}));

const id = 'recording:beta-v1-recording';
const source = { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 };
const annotation = { id: 'note', text: 'Recovery text', anchor: { kind: 'point', time: 2 } };
let fixture: ReturnType<typeof createReviewWorkspaceStoreFixture>;
let failCapture = false;
let commitGate: Gate | undefined;
function gate(): Gate {
  return { entered: deferred<void>(), finish: deferred<void>() };
}
function identity(snapshot: VideoWorkspaceSnapshot) {
  return {
    aggregateId: snapshot.workspace.aggregateId,
    expectedRevision: snapshot.workspace.revision,
    expectedSourceAssetId: snapshot.workspace.sourceAssetId,
  };
}
function pending(rootId = id) {
  for (const raw of fixture.rows.get('sync_capture')!.values()) {
    const parsed = parseSyncCaptureRecord(raw);
    if (
      parsed?.kind === 'pending-checkpoint' &&
      parsed.rootKind === 'video-review' &&
      parsed.rootId === rootId
    )
      return parsed;
  }
  throw new Error('Expected native pending checkpoint.');
}
function assertReceipt(snapshot: VideoWorkspaceSnapshot) {
  expect(snapshot.checkpointReceipt).toEqual({
    rootKind: 'video-review',
    rootId: id,
    revision: pending().revision,
  });
  expect(snapshot.checkpointReceipt?.revision).toMatch(/^[0-9a-f-]{36}$/u);
}
function assertNoDurableReceipt() {
  for (const rows of fixture.rows.values())
    for (const value of rows.values())
      expect(JSON.stringify(value)).not.toMatch(
        /checkpointReceipt|archiveCheckpointReceipt|retainedEditorCheckpointReceipt/u
      );
}

beforeEach(() => {
  io.writes = Promise.resolve();
  io.ack = undefined;
  commitGate = undefined;
  failCapture = false;
  fixture = createReviewWorkspaceStoreFixture((name) => failCapture && name === 'sync_capture');
  for (const ref of betaV1Fixture.records.asset_refs)
    fixture.rows.get('asset_refs')!.set(ref.assetId, ref);
  for (const owner of betaV1Fixture.records.asset_owners)
    fixture.rows
      .get('asset_owners')!
      .set(JSON.stringify([owner.ownerKind, owner.ownerId, owner.role]), owner);
  const native = fixture.database;
  io.database.mockResolvedValue({
    ...native,
    transaction(stores: string[], mode: string) {
      const tx = native.transaction(stores, mode);
      const held = mode === 'readwrite' ? commitGate : undefined;
      if (held) commitGate = undefined;
      return {
        abort: () => tx.abort(),
        objectStore: tx.objectStore.bind(tx),
        get done() {
          if (!held) return tx.done;
          held.entered.resolve();
          return held.finish.promise.then(() => tx.done);
        },
      };
    },
  });
  fixture.rows.get('sync_capture')!.set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    enabled: true,
    createdAt: 1,
    connectionGeneration: 1,
    spaceId: 'receipt-space',
    checkpointIntervalMs: 300000,
  });
});

it('returns initial-open receipt only after the real native transaction commits', async () => {
  const held = gate();
  commitGate = held;
  let acknowledged = false;
  const saving = openVideoWorkspace(id, source).then((value) => {
    acknowledged = true;
    return value;
  });
  await held.entered.promise;
  expect(acknowledged).toBe(false);
  expect(fixture.rows.get('video_workspaces')!.has(id)).toBe(false);
  held.finish.resolve();
  const saved = await saving;
  assertReceipt(saved);
  expect(await readVideoWorkspace(id)).toEqual({ workspace: saved.workspace, draft: saved.draft });
  assertNoDurableReceipt();
});

it('issues distinct native receipts for advanced, recovery, whole-buffer and history writers', async () => {
  const opened = await openVideoWorkspace(id, source);
  assertReceipt(opened);
  const advanced = await saveVideoWorkspaceAdvanced({
    ...identity(opened),
    advanced: {
      ...opened.workspace.advanced,
      ui: { ...opened.workspace.advanced.ui, overlaysVisible: false },
    },
  });
  assertReceipt(advanced);
  const draft = await saveVideoWorkspaceDraft({
    ...identity(advanced),
    expectedDraftRevision: null,
    annotation,
    before: null,
  });
  assertReceipt(draft);
  const whole = await saveVideoWorkspaceSnapshot({
    ...identity(draft),
    expectedDraftRevision: draft.draft!.revision,
    workspace: draft.workspace,
    draft: draft.draft,
  });
  assertReceipt(whole);
  const committed = await commitVideoWorkspace({
    ...identity(whole),
    operation: { id: 'note-op', at: 1, target: 'annotation', before: null, after: annotation },
  });
  assertReceipt(committed);
  const undone = await moveVideoWorkspaceHistory({ ...identity(committed), direction: 'undo' });
  assertReceipt(undone);
  const cleared = await saveVideoWorkspaceDraft({
    ...identity(undone),
    expectedDraftRevision: undone.draft!.revision,
    annotation: null,
    before: null,
  });
  assertReceipt(cleared);
  expect(
    new Set(
      [opened, advanced, draft, whole, committed, undone, cleared].map(
        (value) => value.checkpointReceipt?.revision
      )
    ).size
  ).toBe(7);
  expect(await readVideoWorkspace(id)).not.toHaveProperty('checkpointReceipt');
  expect(parseCapturedReview(undone)).toEqual({ workspace: undone.workspace, draft: undone.draft });
  assertNoDurableReceipt();
});

it('retains the receipt through projection and snapshot commit wrappers', async () => {
  const opened = await openVideoWorkspace(id, source);
  const projected = await commitVideoWorkspaceWithProjection({
    ...identity(opened),
    operation: { id: 'projected', at: 1, target: 'annotation', before: null, after: annotation },
  });
  expect(projected.checkpointReceipt).toEqual({
    rootKind: 'video-review',
    rootId: id,
    revision: pending().revision,
  });
  expect(projected.snapshot).not.toHaveProperty('checkpointReceipt');
  const wrapped = await commitVideoWorkspace({
    ...identity(projected.snapshot),
    operation: {
      id: 'wrapped',
      at: 2,
      target: 'annotation',
      before: annotation,
      after: { ...annotation, text: 'Final' },
    },
  });
  assertReceipt(wrapped);
  expect(wrapped.checkpointReceipt).not.toEqual(projected.checkpointReceipt);
  assertNoDurableReceipt();
});

it('receipts real typing captures without adding acknowledgement metadata to history', async () => {
  const opened = await openVideoWorkspace(id, source);
  const prepared = await saveVideoWorkspaceAdvanced({
    ...identity(opened),
    advanced: {
      ...opened.workspace.advanced,
      text: {
        version: 1,
        fragments: [
          {
            id: 'phrase',
            start: 0,
            end: 3,
            text: '',
            originalText: '',
            revision: 0,
            timingRevision: 0,
            alignment: 'manual',
            timeDomain: 'result',
            showInVideo: false,
          },
        ],
      },
    },
  });
  const document = inspectVideoWorkspace(prepared.workspace).document;
  if (!document?.advancedContent.text) throw new Error('Missing native text fixture.');
  const edited = editReviewTextFragment(document.advancedContent.text, 'phrase', { text: 'Typed' });
  if (!edited.ok) throw new Error('Invalid fixture text edit.');
  const saved = await saveVideoWorkspaceTyping({
    ...identity(prepared),
    change: {
      actionId: crypto.randomUUID(),
      writeId: crypto.randomUUID(),
      target: { kind: 'text', fragmentId: 'phrase', field: 'text' },
      continuation: false,
      at: Date.now(),
      before: document.advancedContent,
      after: { ...document.advancedContent, text: edited.document },
    },
  });
  assertReceipt(saved);
  expect(saved.checkpointReceipt).not.toEqual(prepared.checkpointReceipt);
  assertNoDurableReceipt();
});

it('does not let an old save ACK replace the newer native pending identity', async () => {
  const opened = await openVideoWorkspace(id, source);
  const held = gate();
  io.ack = held;
  const oldSaving = saveVideoWorkspaceDraft({
    ...identity(opened),
    expectedDraftRevision: null,
    annotation,
    before: null,
  });
  await held.entered.promise;
  const oldRevision = pending().revision;
  const native = await readVideoWorkspace(id);
  if (!native?.draft) throw new Error('Missing committed draft.');
  const next = await saveVideoWorkspaceDraft({
    ...identity(native),
    expectedDraftRevision: native.draft.revision,
    annotation: { ...annotation, text: 'Newer' },
    before: null,
  });
  const latestRevision = pending().revision;
  held.finish.resolve();
  const old = await oldSaving;
  expect(old.checkpointReceipt?.revision).toBe(oldRevision);
  expect(next.checkpointReceipt?.revision).toBe(latestRevision);
  expect(oldRevision).not.toBe(latestRevision);
  expect(pending().revision).toBe(latestRevision);
});

it('rolls back native recovery and pending together and refuses stale CAS without a receipt', async () => {
  const opened = await openVideoWorkspace(id, source);
  const before = structuredClone(fixture.rows);
  failCapture = true;
  await expect(
    saveVideoWorkspaceDraft({
      ...identity(opened),
      expectedDraftRevision: null,
      annotation,
      before: null,
    })
  ).rejects.toThrow();
  expect(fixture.rows).toEqual(before);
  failCapture = false;
  await expect(
    saveVideoWorkspaceDraft({
      ...identity(opened),
      expectedRevision: opened.workspace.revision + 1,
      expectedDraftRevision: null,
      annotation,
      before: null,
    })
  ).rejects.toMatchObject({ code: 'conflict' });
  expect(fixture.rows).toEqual(before);
  const retry = await saveVideoWorkspaceDraft({
    ...identity(opened),
    expectedDraftRevision: null,
    annotation,
    before: null,
  });
  assertReceipt(retry);
});

it('does not borrow an earlier pending receipt when native state capture is a no-op', async () => {
  const opened = await openVideoWorkspace(id, source);
  const db = await initDB();
  const stores = [...fixture.rows.keys()];
  const tx = db.transaction(stores, 'readwrite');
  await captureVideoReviewInTransaction(tx, id, { checkpoint: 'freeze' });
  await deferCheckpointInTransaction(tx, { rootKind: 'video-review', rootId: id });
  await tx.done;
  const earlier = pending().revision;
  const unchanged = await moveVideoWorkspaceHistory({ ...identity(opened), direction: 'undo' });
  expect(unchanged).not.toHaveProperty('checkpointReceipt');
  expect(pending().revision).toBe(earlier);
  assertNoDurableReceipt();
});

it('omits receipts for local-only native saves and read APIs', async () => {
  fixture.rows.get('sync_capture')!.delete('profile');
  const opened = await openVideoWorkspace(id, source);
  expect(opened).not.toHaveProperty('checkpointReceipt');
  expect(await readVideoWorkspace(id)).not.toHaveProperty('checkpointReceipt');
});

it('returns no receipt and preserves native data when transaction completion refuses the save', async () => {
  const opened = await openVideoWorkspace(id, source);
  const before = structuredClone(fixture.rows);
  const held = gate();
  commitGate = held;
  const saving = saveVideoWorkspaceDraft({
    ...identity(opened),
    expectedDraftRevision: null,
    annotation,
    before: null,
  });
  const rejected = expect(saving).rejects.toThrow('Commit refused');
  await held.entered.promise;
  expect(fixture.rows).toEqual(before);
  held.finish.reject(new Error('Commit refused'));
  await rejected;
  expect(fixture.rows).toEqual(before);
});

function createProject(snapshot: VideoWorkspaceSnapshot, archiveId: string) {
  return createVideoWorkspaceProject({ ...identity(snapshot), archiveId });
}

it('leaves every pending UUID and native row stable on a completed New replay with newer work', async () => {
  const opened = await openVideoWorkspace(id, source);
  const archiveId = 'recording:quick-project:replay';
  const created = await createProject(opened, archiveId);
  const archive = await readVideoWorkspace(archiveId);
  if (!archive) throw new Error('Missing archive.');
  await saveVideoWorkspaceDraft({
    ...identity(archive),
    expectedDraftRevision: null,
    annotation,
    before: null,
  });
  const latest = await saveVideoWorkspaceAdvanced({
    ...identity(created),
    advanced: created.workspace.advanced,
  });
  const before = structuredClone(fixture.rows);
  const replay = await createProject(opened, archiveId);
  expect(replay.workspace).toEqual(latest.workspace);
  expect(replay).not.toHaveProperty('archiveCheckpointReceipt');
  expect(replay).not.toHaveProperty('retainedEditorCheckpointReceipt');
  expect(replay).not.toHaveProperty('checkpointReceipt');
  expect(fixture.rows).toEqual(before);
});

it('issues the fresh archive role after tx.done and never assigns the reset default as an exit role', async () => {
  const initial = await openVideoWorkspace(id, source);
  const opened = await saveVideoWorkspaceDraft({
    ...identity(initial),
    expectedDraftRevision: null,
    annotation,
    before: null,
  });
  const archiveId = 'recording:quick-project:fresh';
  const before = structuredClone(fixture.rows);
  const held = gate();
  commitGate = held;
  let acknowledged = false;
  const creating = createProject(opened, archiveId).then((value) => {
    acknowledged = true;
    return value;
  });
  await held.entered.promise;
  expect(acknowledged).toBe(false);
  expect(fixture.rows).toEqual(before);
  held.finish.resolve();
  const created = await creating;
  expect(created.archiveCheckpointReceipt).toEqual({
    rootKind: 'video-review',
    rootId: archiveId,
    revision: pending(archiveId).revision,
  });
  expect(created.retainedEditorCheckpointReceipt).toBeUndefined();
  expect(created.workspace.aggregateId).toBe(id);
  expect(created.archiveCheckpointReceipt?.rootId).not.toBe(id);
  expect((await readVideoWorkspace(archiveId))?.draft?.annotation).toEqual(annotation);
  assertNoDurableReceipt();
});

it('names archive B and retained editor A separately from reset default C and emits no replay selections', async () => {
  const opened = await openVideoWorkspace(id, source);
  const archiveA = 'recording:quick-project:editor-a';
  await createProject(opened, archiveA);
  const selected = await readVideoWorkspace(archiveA);
  if (!selected) throw new Error('Missing selected archive.');
  const editor = await saveVideoWorkspaceDraft({
    ...identity(selected),
    expectedDraftRevision: null,
    annotation,
    before: null,
  });
  const archiveB = 'recording:quick-project:archive-b';
  const created = await createProject(editor, archiveB);
  expect(created.workspace.aggregateId).toBe(id);
  expect(created.archiveCheckpointReceipt).toEqual({
    rootKind: 'video-review',
    rootId: archiveB,
    revision: pending(archiveB).revision,
  });
  expect(created.retainedEditorCheckpointReceipt).toEqual({
    rootKind: 'video-review',
    rootId: archiveA,
    revision: pending(archiveA).revision,
  });
  const newer = await saveVideoWorkspaceDraft({
    ...identity(editor),
    expectedDraftRevision: editor.draft!.revision,
    annotation: { ...annotation, text: 'Newer A' },
    before: null,
  });
  expect(newer.checkpointReceipt?.revision).toBe(pending(archiveA).revision);
  const beforeReplay = structuredClone(fixture.rows);
  const replay = await createProject(editor, archiveB);
  expect(replay).not.toHaveProperty('archiveCheckpointReceipt');
  expect(replay).not.toHaveProperty('retainedEditorCheckpointReceipt');
  expect(replay).not.toHaveProperty('checkpointReceipt');
  expect(fixture.rows).toEqual(beforeReplay);
  assertNoDurableReceipt();
});

it('rolls back both New identities and roles after commit refusal and retries the same command once', async () => {
  const opened = await openVideoWorkspace(id, source);
  const archiveId = 'recording:quick-project:retry';
  const before = structuredClone(fixture.rows);
  const held = gate();
  commitGate = held;
  const creating = createProject(opened, archiveId);
  const rejected = expect(creating).rejects.toThrow('Commit refused');
  await held.entered.promise;
  held.finish.reject(new Error('Commit refused'));
  await rejected;
  expect(fixture.rows).toEqual(before);
  const created = await createProject(opened, archiveId);
  expect(created.archiveCheckpointReceipt?.revision).toBe(pending(archiveId).revision);
  expect((await readVideoWorkspace(archiveId))?.workspace.sourceMediaId).toBe(id);
});

it(
  'preserves the original pending deadline without reissuing roles after a committed ' +
    'New response is lost',
  async () => {
    const opened = await openVideoWorkspace(id, source);
    const archiveId = 'recording:quick-project:lost';
    const held = gate();
    io.ack = held;
    const creating = createProject(opened, archiveId);
    const rejected = expect(creating).rejects.toThrow('Lost ACK');
    await held.entered.promise;
    const before = structuredClone(fixture.rows);
    held.finish.reject(new Error('Lost ACK'));
    await rejected;
    const replay = await createProject(opened, archiveId);
    expect(replay).not.toHaveProperty('archiveCheckpointReceipt');
    expect(replay).not.toHaveProperty('retainedEditorCheckpointReceipt');
    expect(replay).not.toHaveProperty('checkpointReceipt');
    expect(fixture.rows).toEqual(before);
  }
);

it('creates local-only projects without inventing exit roles or storing ACK metadata', async () => {
  fixture.rows.get('sync_capture')!.delete('profile');
  const opened = await openVideoWorkspace(id, source);
  const archiveId = 'recording:quick-project:local';
  const created = await createProject(opened, archiveId);
  expect(created).not.toHaveProperty('checkpointReceipt');
  expect(created).not.toHaveProperty('archiveCheckpointReceipt');
  expect(created).not.toHaveProperty('retainedEditorCheckpointReceipt');
  expect(await readVideoWorkspace(archiveId)).not.toBeNull();
  expect(fixture.rows.get('sync_capture')!.size).toBe(0);
  assertNoDurableReceipt();
});

it('keeps a delayed creation ACK bound to its committed archive token after a newer archive save', async () => {
  const opened = await openVideoWorkspace(id, source);
  const archiveId = 'recording:quick-project:delayed';
  const held = gate();
  io.ack = held;
  const creating = createProject(opened, archiveId);
  await held.entered.promise;
  const original = pending(archiveId).revision;
  const archive = await readVideoWorkspace(archiveId);
  if (!archive) throw new Error('Missing committed archive.');
  const newer = await saveVideoWorkspaceDraft({
    ...identity(archive),
    expectedDraftRevision: null,
    annotation,
    before: null,
  });
  expect(newer.checkpointReceipt?.revision).toBe(pending(archiveId).revision);
  expect(pending(archiveId).revision).not.toBe(original);
  held.finish.resolve();
  const acknowledged = await creating;
  expect(acknowledged.archiveCheckpointReceipt).toEqual({
    rootKind: 'video-review',
    rootId: archiveId,
    revision: original,
  });
  expect(acknowledged.archiveCheckpointReceipt).not.toEqual(newer.checkpointReceipt);
  assertNoDurableReceipt();
});
