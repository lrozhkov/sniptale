// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { EDITOR_AUTOSAVE_POLICY } from '../../../features/autosave/policy';
import {
  captureEditorHistoryCheckpoint,
  prepareEditorHistoryCheckpoint,
  createEditorSnapshotHistory,
  deferEditorSnapshotHistory,
  flushDeferredEditorHistory,
  pushEditorSnapshotHistory,
  readCurrentEditorSnapshot,
  restoreEditorHistoryCheckpoint,
} from '../../controller/history';
import {
  activate,
  createDocument,
  createWorkspaceCommitResult,
  commitWorkspaceMock,
  getWorkspaceMock,
} from './autosave.test-support';
import { createEditorSessionAutosaveService } from './index';

const base = createDocument('data:image/png;base64,QUJD');

it('retries one acquired native save with the exact same input instead of a new publication', async () => {
  const autosave = createEditorSessionAutosaveService();
  activate(autosave);
  commitWorkspaceMock.mockRejectedValueOnce(new Error('Lost acknowledgement'));
  autosave.scheduleAutosave(base);
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  expect(commitWorkspaceMock).toHaveBeenCalledOnce();
  const first = commitWorkspaceMock.mock.calls[0]![0];
  await autosave.flushAutosave(() => base);
  expect(commitWorkspaceMock).toHaveBeenCalledTimes(2);
  expect(commitWorkspaceMock.mock.calls[1]![0]).toBe(first);
  expect(autosave.getDurableRevision()).toBe(1);
  expect(autosave.hasUnsavedChanges()).toBe(false);
  autosave.dispose();
});

it.each([false, true])(
  'settles an unfinished save before capturing a newer buffer, toggled-off=%s',
  async (toggleOff) => {
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    const next = { ...base, displayName: 'Newer buffer' };
    commitWorkspaceMock.mockRejectedValueOnce(new Error('Lost acknowledgement'));
    autosave.scheduleAutosave(base);
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
    if (toggleOff) autosave.setEnabled(false);
    autosave.scheduleAutosave(next);
    if (toggleOff) {
      await vi.advanceTimersByTimeAsync(60_000);
      expect(commitWorkspaceMock).toHaveBeenCalledOnce();
      autosave.setEnabled(true, () => next);
    }
    await autosave.flushAutosave(() => next);
    expect(commitWorkspaceMock.mock.calls.map(([input]) => input.document)).toEqual([
      base,
      base,
      next,
    ]);
    expect(commitWorkspaceMock.mock.calls.map(([input]) => input.expectedRevision)).toEqual([
      0, 0, 1,
    ]);
    expect(autosave.getDurableRevision()).toBe(2);
    expect(autosave.hasUnsavedChanges()).toBe(false);
    autosave.dispose();
  }
);

it('does not resume a failed native publication after the editor changes its context', async () => {
  const autosave = createEditorSessionAutosaveService();
  activate(autosave);
  commitWorkspaceMock.mockRejectedValueOnce(new Error('Lost acknowledgement'));
  autosave.scheduleAutosave(base);
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  autosave.activate({
    aggregateId: 'new-root',
    durableRevision: 7,
    sourceGeneration: 'new-lifetime',
    renderPresentation: null,
    sourceTitle: null,
    sourceUrl: null,
  });
  autosave.scheduleAutosave(base);
  await autosave.flushAutosave(() => base);
  expect(commitWorkspaceMock).toHaveBeenCalledTimes(2);
  expect(commitWorkspaceMock.mock.calls[1]![0]).toMatchObject({
    aggregateId: 'new-root',
    expectedRevision: 7,
    expectedGeneration: 'new-lifetime',
  });
  autosave.dispose();
});

it('keeps a newer durable revision when an older acknowledgement arrives', async () => {
  const autosave = createEditorSessionAutosaveService();
  activate(autosave);
  const acknowledgement = Promise.withResolvers<ReturnType<typeof createWorkspaceCommitResult>>();
  commitWorkspaceMock.mockImplementationOnce(() => acknowledgement.promise);
  autosave.scheduleAutosave(base);
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  autosave.updateContext({ durableRevision: 7 });
  acknowledgement.resolve(createWorkspaceCommitResult(1));
  await vi.advanceTimersByTimeAsync(0);
  expect(autosave.getDurableRevision()).toBe(7);
  expect(autosave.hasUnsavedChanges()).toBe(true);
  await autosave.saveNow(() => ({ ...base, displayName: 'Latest accepted document' }));
  expect(commitWorkspaceMock.mock.calls[1]![0].expectedRevision).toBe(7);
  expect(autosave.getDurableRevision()).toBe(8);
  autosave.dispose();
});

it('continues the newer buffer when its own first-creation ACK crosses a metadata context update', async () => {
  const autosave = createEditorSessionAutosaveService();
  activate(autosave);
  commitWorkspaceMock.mockRejectedValueOnce(new Error('Lost acknowledgement'));
  autosave.scheduleAutosave(base);
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  const acknowledged = Promise.withResolvers<ReturnType<typeof createWorkspaceCommitResult>>();
  commitWorkspaceMock.mockImplementationOnce(() => acknowledged.promise);
  const next = { ...base, displayName: 'Newer buffer' };
  autosave.scheduleAutosave(next);
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  expect(commitWorkspaceMock).toHaveBeenCalledTimes(2);
  autosave.updateContext({ sourceTitle: 'Updated metadata' });
  acknowledged.resolve({ ...createWorkspaceCommitResult(1), sourceGeneration: 'born' });
  await vi.advanceTimersByTimeAsync(0);
  expect(commitWorkspaceMock).toHaveBeenCalledTimes(3);
  expect(commitWorkspaceMock.mock.calls[2]![0]).toMatchObject({
    document: next,
    expectedRevision: 1,
    expectedGeneration: 'born',
  });
  expect(autosave.hasUnsavedChanges()).toBe(false);
  autosave.dispose();
});

it('keeps the accepted history cursor while a later canvas transition is still unpublished', async () => {
  const history = createEditorSnapshotHistory(base);
  const next = { ...base, displayName: 'Accepted' };
  pushEditorSnapshotHistory({ history, muted: false, exportDocument: () => next });
  const autosave = createEditorSessionAutosaveService({
    prepareHistory: () => prepareEditorHistoryCheckpoint(history),
  });
  activate(autosave);
  autosave.scheduleAutosave(next);
  // Undo moves its cursor before the asynchronous canvas application publishes its document.
  history.seek(0);
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  expect(commitWorkspaceMock).not.toHaveBeenCalled();
  autosave.scheduleAutosave(base);
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  expect(commitWorkspaceMock).toHaveBeenCalledOnce();
  const saved = commitWorkspaceMock.mock.calls[0]![0];
  expect(readCurrentEditorSnapshot(restoreEditorHistoryCheckpoint(saved.history))).toEqual(
    saved.document
  );
  autosave.dispose();
});

it('leaves a document queued while history is pending and saves only the ready pair', async () => {
  const history = createEditorSnapshotHistory(base);
  const next = { ...base, displayName: 'Ready' };
  pushEditorSnapshotHistory({ history, muted: false, exportDocument: () => next });
  let ready = false;
  const capture = vi.fn(() => () => (ready ? captureEditorHistoryCheckpoint(history) : null));
  const autosave = createEditorSessionAutosaveService({ prepareHistory: capture });
  activate(autosave);
  autosave.scheduleAutosave(next);
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  expect(commitWorkspaceMock).not.toHaveBeenCalled();
  expect(autosave.hasUnsavedChanges()).toBe(true);
  expect(capture).toHaveBeenCalledWith(next, 'background');
  ready = true;
  autosave.scheduleAutosave(next);
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  expect(commitWorkspaceMock).toHaveBeenCalledOnce();
  const input = commitWorkspaceMock.mock.calls[0]![0];
  expect(input.document).toBe(next);
  expect(readCurrentEditorSnapshot(restoreEditorHistoryCheckpoint(input.history))).toEqual(next);
  expect(autosave.hasUnsavedChanges()).toBe(false);
  autosave.dispose();
});

it('does not capture history or write while autosave is disabled', async () => {
  const capture = vi.fn(() => prepareEditorHistoryCheckpoint(createEditorSnapshotHistory(base)));
  const autosave = createEditorSessionAutosaveService({ prepareHistory: capture });
  activate(autosave);
  autosave.setEnabled(false);
  autosave.scheduleAutosave(base);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(capture).not.toHaveBeenCalled();
  expect(commitWorkspaceMock).not.toHaveBeenCalled();
  expect(autosave.hasUnsavedChanges()).toBe(true);
  autosave.dispose();
});

it('keeps an acquired history capture stable and reuses its assets for the newer document', async () => {
  const history = createEditorSnapshotHistory(base);
  const first = { ...base, displayName: 'First' };
  pushEditorSnapshotHistory({ history, muted: false, exportDocument: () => first });
  const autosave = createEditorSessionAutosaveService({
    prepareHistory: () => prepareEditorHistoryCheckpoint(history),
  });
  activate(autosave);
  const resources = new Map([
    [
      'immutable-value',
      {
        assetId: 'immutable-ref',
        createdAt: 1,
        mimeType: 'application/json',
        size: 2,
        sha256: null,
        location: { kind: 'opfs' as const, objectKey: 'objects/immutable-ref' },
      },
    ],
  ]);
  let release: () => void = () => undefined;
  commitWorkspaceMock.mockImplementationOnce(async (input) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return {
      ...createWorkspaceCommitResult(input.expectedRevision + 1, input),
      historyAssetsByValue: resources,
    };
  });
  autosave.scheduleAutosave(first);
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  const acquired = commitWorkspaceMock.mock.calls[0]![0].history;
  const second = { ...base, displayName: 'Second' };
  pushEditorSnapshotHistory({ history, muted: false, exportDocument: () => second });
  autosave.scheduleAutosave(second);
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  expect(commitWorkspaceMock).toHaveBeenCalledOnce();
  release();
  await vi.advanceTimersByTimeAsync(0);
  expect(commitWorkspaceMock).toHaveBeenCalledTimes(2);
  expect(readCurrentEditorSnapshot(restoreEditorHistoryCheckpoint(acquired))).toEqual(first);
  const latest = commitWorkspaceMock.mock.calls[1]![0];
  expect(readCurrentEditorSnapshot(restoreEditorHistoryCheckpoint(latest.history))).toEqual(second);
  expect(latest.reusableHistoryAssetsByValue).toBe(resources);
  expect(readCurrentEditorSnapshot(history)).toEqual(second);
  autosave.dispose();
});

it('captures an explicit prospective edit without changing live history on failed persistence', async () => {
  const history = createEditorSnapshotHistory(base);
  const before = captureEditorHistoryCheckpoint(history);
  const autosave = createEditorSessionAutosaveService({
    prepareHistory: (document, mode) =>
      prepareEditorHistoryCheckpoint(history, mode === 'explicit' ? document : undefined),
  });
  activate(autosave);
  commitWorkspaceMock.mockRejectedValueOnce(new Error('Storage unavailable'));
  const renamed = { ...base, displayName: 'Renamed' };
  await expect(autosave.saveNow(() => renamed)).rejects.toThrow('Storage unavailable');
  expect(captureEditorHistoryCheckpoint(history)).toEqual(before);
  const saved = restoreEditorHistoryCheckpoint(commitWorkspaceMock.mock.calls[0]![0].history);
  expect(readCurrentEditorSnapshot(saved)).toEqual(renamed);
  autosave.dispose();
});

it('joins explicit history flush notifications without scheduling a duplicate save', async () => {
  const history = createEditorSnapshotHistory(base);
  const next = { ...base, displayName: 'Accepted pending' };
  const autosave = createEditorSessionAutosaveService({
    prepareHistory: (document, mode) => {
      if (mode === 'explicit') flushDeferredEditorHistory(history);
      return prepareEditorHistoryCheckpoint(history, mode === 'explicit' ? document : undefined);
    },
  });
  activate(autosave);
  deferEditorSnapshotHistory(history, {
    document: next,
    isCurrent: () => true,
    onCommitted: () => autosave.scheduleAutosave(next),
    onFailure: vi.fn(),
  });
  autosave.scheduleAutosave(next);
  await autosave.saveNow(() => next);
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay * 2);
  expect(commitWorkspaceMock).toHaveBeenCalledOnce();
  expect(
    readCurrentEditorSnapshot(
      restoreEditorHistoryCheckpoint(commitWorkspaceMock.mock.calls[0]![0].history)
    )
  ).toEqual(next);
  autosave.dispose();
});

it('adopts restored history resource references for the next native publication', async () => {
  const history = createEditorSnapshotHistory(base);
  const refs = new Map();
  getWorkspaceMock.mockResolvedValueOnce({
    aggregateId: 'image-1',
    document: base,
    revision: 3,
    sourceGeneration: 'restored',
    sourceTitle: null,
    sourceUrl: null,
    createdAt: 1,
    updatedAt: 1,
    history: captureEditorHistoryCheckpoint(history),
    historyAssetsByValue: refs,
  });
  const autosave = createEditorSessionAutosaveService({
    prepareHistory: () => prepareEditorHistoryCheckpoint(history),
  });
  activate(autosave);
  await autosave.restoreDraft('image-1');
  await autosave.saveNow(() => base);
  expect(commitWorkspaceMock).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedRevision: 3,
      expectedGeneration: 'restored',
      reusableHistoryAssetsByValue: refs,
    })
  );
  autosave.dispose();
});
