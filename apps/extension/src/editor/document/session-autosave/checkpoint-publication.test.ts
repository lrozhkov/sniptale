// @vitest-environment jsdom
const wakeCheckpoints = vi.hoisted(() => vi.fn());
vi.mock('../../../platform/runtime-messaging/sync-product-client', () => ({
  createSyncProductClient: () => ({ wakeCheckpoints }),
}));
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { activate, commitWorkspaceMock, createDocument } from './autosave.test-support';
import { EDITOR_AUTOSAVE_POLICY } from '../../../features/autosave/policy';

const { acquire } = vi.hoisted(() => ({ acquire: vi.fn() }));
vi.mock('../../../composition/persistence/sync-capture/checkpoint-publication', () => ({
  acquireSyncCheckpointEdit: acquire,
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
let release = vi.fn(async (): Promise<void> => undefined);
beforeEach(() => {
  wakeCheckpoints.mockReset().mockResolvedValue({ kind: 'checkpoint-woken' });
  release = vi.fn(async (): Promise<void> => undefined);
  acquire.mockReset();
  acquire.mockResolvedValue({ release });
});
afterEach(() => vi.unstubAllGlobals());
async function session() {
  const { createEditorSessionAutosaveService } = await import('./');
  const autosave = createEditorSessionAutosaveService();
  activate(autosave);
  return autosave;
}
it('saves intermediate documents under a held interaction without releasing publication admission', async () => {
  const autosave = await session();
  autosave.setInteractionActive(true);
  for (const name of ['intermediate-one', 'intermediate-two']) {
    autosave.scheduleAutosave(createDocument(name));
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  }
  expect(wakeCheckpoints).not.toHaveBeenCalled();
  expect(commitWorkspaceMock).toHaveBeenCalledTimes(2);
  expect(acquire).toHaveBeenCalledOnce();
  expect(release).not.toHaveBeenCalled();
  autosave.setInteractionActive(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(release).toHaveBeenCalledOnce();
  expect(wakeCheckpoints).toHaveBeenCalledOnce();
  autosave.dispose();
});
it('waits for publication admission before native save without blocking interaction updates', async () => {
  const grant = deferred<{ release: typeof release }>();
  acquire.mockReturnValueOnce(grant.promise);
  const autosave = await session();
  autosave.setInteractionActive(true);
  autosave.scheduleAutosave(createDocument('intermediate'));
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  expect(commitWorkspaceMock).not.toHaveBeenCalled();
  autosave.scheduleAutosave(createDocument('newer'));
  expect(autosave.hasUnsavedChanges()).toBe(true);
  grant.resolve({ release });
  await vi.advanceTimersByTimeAsync(0);
  expect(commitWorkspaceMock).toHaveBeenCalledOnce();
  expect(release).not.toHaveBeenCalled();
  autosave.setInteractionActive(false);
  await autosave.flushAutosave(() => createDocument('newer'));
  await vi.advanceTimersByTimeAsync(0);
  expect(commitWorkspaceMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ document: createDocument('newer') })
  );
  expect(release).toHaveBeenCalledOnce();
  autosave.dispose();
});
it('keeps pointerup capture admission through document history commit and its latest ACK', async () => {
  const autosave = await session();
  autosave.setInteractionActive(true);
  autosave.scheduleAutosave(createDocument('intermediate'));
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  const ack = deferred<{ revision: number; documentAssetsByRuntimeUrl: Map<string, never> }>();
  commitWorkspaceMock.mockReturnValueOnce(ack.promise);
  const target = document.createElement('canvas');
  document.body.append(target);
  const order: string[] = [];
  const capture = () => {
    order.push('activity-capture');
    autosave.setInteractionActive(false);
  };
  const commitHistory = () => {
    order.push('document-history-commit');
    autosave.scheduleAutosave(createDocument('final'));
  };
  window.addEventListener('pointerup', capture, true);
  document.addEventListener('pointerup', commitHistory);
  try {
    target.dispatchEvent(new Event('pointerup', { bubbles: true }));
    expect(order).toEqual(['activity-capture', 'document-history-commit']);
    expect(release).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
    expect(commitWorkspaceMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ document: createDocument('final') })
    );
    expect(release).not.toHaveBeenCalled();
    ack.resolve({ revision: 2, documentAssetsByRuntimeUrl: new Map<string, never>() });
    await vi.advanceTimersByTimeAsync(0);
    expect(release).toHaveBeenCalledOnce();
    expect(autosave.getDurableRevision()).toBe(2);
  } finally {
    window.removeEventListener('pointerup', capture, true);
    document.removeEventListener('pointerup', commitHistory);
    target.remove();
    autosave.dispose();
  }
});
it('retains failed final save admission through explicit retry', async () => {
  const autosave = await session();
  autosave.setInteractionActive(true);
  autosave.scheduleAutosave(createDocument('intermediate'));
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  commitWorkspaceMock.mockRejectedValueOnce(new Error('Final write failed'));
  autosave.scheduleAutosave(createDocument('final'));
  autosave.setInteractionActive(false);
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  expect(autosave.getLastWriteError()).toBeInstanceOf(Error);
  expect(autosave.hasUnsavedChanges()).toBe(true);
  expect(release).not.toHaveBeenCalled();
  expect(wakeCheckpoints).not.toHaveBeenCalled();
  await autosave.saveNow(() => createDocument('final'));
  expect(autosave.getLastWriteError()).toBeNull();
  expect(release).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(0);
  expect(wakeCheckpoints).toHaveBeenCalledOnce();
  autosave.dispose();
});
it('reports failed acquisition without a native write and reacquires on explicit retry', async () => {
  acquire.mockRejectedValueOnce(new Error('Publication coordination unavailable'));
  const autosave = await session();
  autosave.setInteractionActive(true);
  autosave.scheduleAutosave(createDocument('final'));
  autosave.setInteractionActive(false);
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  expect(commitWorkspaceMock).not.toHaveBeenCalled();
  expect(autosave.hasUnsavedChanges()).toBe(true);
  expect(autosave.getLastWriteError()).toBeInstanceOf(Error);
  await autosave.saveNow(() => createDocument('final'));
  expect(acquire).toHaveBeenCalledTimes(2);
  expect(commitWorkspaceMock).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce();
  autosave.dispose();
});
it.each(['replace', 'dispose'] as const)(
  'releases a delayed grant after context %s without writing stale data',
  async (transition) => {
    const grant = deferred<{ release: typeof release }>();
    acquire.mockReturnValueOnce(grant.promise);
    const autosave = await session();
    autosave.setInteractionActive(true);
    autosave.scheduleAutosave(createDocument('stale'));
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
    if (transition === 'dispose') autosave.dispose();
    else
      autosave.activate({
        aggregateId: 'replacement',
        durableRevision: 5,
        renderPresentation: null,
        sourceTitle: null,
        sourceUrl: null,
      });
    grant.resolve({ release });
    await vi.advanceTimersByTimeAsync(0);
    expect(commitWorkspaceMock).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
    autosave.dispose();
  }
);
it('holds an acquired lease through an in-flight native write after disposal', async () => {
  const ack = deferred<{ revision: number; documentAssetsByRuntimeUrl: Map<string, never> }>();
  commitWorkspaceMock.mockReturnValueOnce(ack.promise);
  const autosave = await session();
  autosave.setInteractionActive(true);
  autosave.scheduleAutosave(createDocument('accepted'));
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  autosave.dispose();
  await vi.advanceTimersByTimeAsync(0);
  expect(release).not.toHaveBeenCalled();
  ack.resolve({ revision: 1, documentAssetsByRuntimeUrl: new Map<string, never>() });
  await vi.advanceTimersByTimeAsync(0);
  expect(release).toHaveBeenCalledOnce();
});
it('releases disabled interaction without native writes and keeps hydration closed', async () => {
  const autosave = await session();
  autosave.setEnabled(false);
  autosave.setInteractionActive(true);
  autosave.scheduleAutosave(createDocument('unsaved'));
  autosave.setInteractionActive(false);
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.maxWait);
  expect(commitWorkspaceMock).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledOnce();
  expect(autosave.hasUnsavedChanges()).toBe(true);
  autosave.setEnabled(true);
  const hydration = autosave.beginHydration(() => true);
  autosave.setInteractionActive(true);
  autosave.scheduleAutosave(createDocument('not admitted'));
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.maxWait);
  expect(commitWorkspaceMock).not.toHaveBeenCalled();
  hydration.finish(true);
  autosave.setInteractionActive(false);
  autosave.dispose();
});

it('releases an ended interaction paused before its first native save', async () => {
  const autosave = await session();
  autosave.setInteractionActive(true);
  autosave.scheduleAutosave(createDocument('not saved'));
  autosave.setInteractionActive(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(release).not.toHaveBeenCalled();
  autosave.setEnabled(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(release).toHaveBeenCalledOnce();
  expect(commitWorkspaceMock).not.toHaveBeenCalled();
  expect(autosave.hasUnsavedChanges()).toBe(true);
  autosave.dispose();
});

it('keeps a paused interaction with an intermediate native save protected until explicit final save', async () => {
  const autosave = await session();
  autosave.setInteractionActive(true);
  autosave.scheduleAutosave(createDocument('intermediate'));
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  autosave.setEnabled(false);
  autosave.scheduleAutosave(createDocument('final'));
  autosave.setInteractionActive(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(release).not.toHaveBeenCalled();
  await autosave.saveNow(() => createDocument('final'));
  expect(release).toHaveBeenCalledOnce();
  expect(commitWorkspaceMock).toHaveBeenCalledTimes(2);
  autosave.dispose();
});

it('releases an old context ACK without releasing its successor interaction', async () => {
  const firstRelease = vi.fn(async (): Promise<void> => undefined);
  acquire.mockResolvedValueOnce({ release: firstRelease });
  const ack = deferred<{ revision: number; documentAssetsByRuntimeUrl: Map<string, never> }>();
  commitWorkspaceMock.mockReturnValueOnce(ack.promise);
  const autosave = await session();
  autosave.setInteractionActive(true);
  autosave.scheduleAutosave(createDocument('first context'));
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  autosave.activate({
    aggregateId: 'replacement',
    durableRevision: 5,
    renderPresentation: null,
    sourceTitle: null,
    sourceUrl: null,
  });
  autosave.setInteractionActive(true);
  autosave.scheduleAutosave(createDocument('replacement context'));
  ack.resolve({ revision: 1, documentAssetsByRuntimeUrl: new Map<string, never>() });
  await vi.advanceTimersByTimeAsync(0);
  expect(firstRelease).toHaveBeenCalledOnce();
  expect(wakeCheckpoints).toHaveBeenCalledOnce();
  expect(release).not.toHaveBeenCalled();
  await autosave.saveNow(() => createDocument('replacement context'));
  expect(release).not.toHaveBeenCalled();
  autosave.setInteractionActive(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(release).toHaveBeenCalledOnce();
  expect(autosave.getDurableRevision()).toBe(6);
  expect(wakeCheckpoints).toHaveBeenCalledTimes(2);
  autosave.dispose();
});

it('does not release a successor gesture when the preceding completion task runs', async () => {
  const autosave = await session();
  autosave.setInteractionActive(true);
  autosave.setInteractionActive(false);
  autosave.setInteractionActive(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(release).not.toHaveBeenCalled();
  autosave.scheduleAutosave(createDocument('successor'));
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  expect(release).not.toHaveBeenCalled();
  autosave.setInteractionActive(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(release).toHaveBeenCalledOnce();
  autosave.dispose();
});

it('wakes only after the committed image protection release settles', async () => {
  const released = deferred<void>();
  release.mockImplementationOnce(() => released.promise);
  const autosave = await session();
  autosave.setInteractionActive(true);
  autosave.scheduleAutosave(createDocument('accepted'));
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  autosave.setInteractionActive(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(release).toHaveBeenCalledOnce();
  expect(wakeCheckpoints).not.toHaveBeenCalled();
  released.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(wakeCheckpoints).toHaveBeenCalledOnce();
  autosave.dispose();
  await vi.advanceTimersByTimeAsync(0);
  expect(wakeCheckpoints).toHaveBeenCalledOnce();
});

it('does not wake for an image interaction without a native save', async () => {
  const autosave = await session();
  autosave.setInteractionActive(true);
  autosave.setInteractionActive(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(release).toHaveBeenCalledOnce();
  expect(wakeCheckpoints).not.toHaveBeenCalled();
  autosave.dispose();
});

it('keeps an accepted image save successful after advisory wake rejection', async () => {
  wakeCheckpoints.mockRejectedValueOnce(new Error('Worker unavailable'));
  const autosave = await session();
  autosave.setInteractionActive(true);
  autosave.scheduleAutosave(createDocument('accepted'));
  autosave.setInteractionActive(false);
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  expect(wakeCheckpoints).toHaveBeenCalledOnce();
  expect(autosave.getLastWriteError()).toBeNull();
  expect(autosave.hasUnsavedChanges()).toBe(false);
  expect(release).toHaveBeenCalledOnce();
  autosave.dispose();
});
