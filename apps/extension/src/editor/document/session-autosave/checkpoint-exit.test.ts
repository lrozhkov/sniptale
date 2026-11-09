// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { activate, commitWorkspaceMock, createDocument } from './autosave.test-support';
import type { SyncCheckpointReceipt } from '../../../composition/persistence/sync-capture/contracts';
import type { EditorSessionAutosaveService } from './';
import { EDITOR_AUTOSAVE_POLICY } from '../../../features/autosave/policy';

function receipt(): SyncCheckpointReceipt {
  return { rootKind: 'media', rootId: 'image-1', revision: crypto.randomUUID() };
}
async function service() {
  const { createEditorSessionAutosaveService } = await import('./');
  const autosave = createEditorSessionAutosaveService();
  activate(autosave);
  return autosave;
}
function prepare(autosave: EditorSessionAutosaveService) {
  if (!autosave.prepareCheckpointExit)
    throw new Error('Expected image checkpoint exit preparation.');
  return autosave.prepareCheckpointExit(() => createDocument('latest'));
}
function saveAck(token = receipt(), revision = 1) {
  return { revision, checkpointReceipt: token, documentAssetsByRuntimeUrl: new Map() };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('returns a current exit witness with the latest accepted native save receipt', async () => {
  const autosave = await service();
  const token = receipt();
  commitWorkspaceMock.mockResolvedValueOnce(saveAck(token));
  autosave.scheduleAutosave(createDocument('latest'));
  const witness = await prepare(autosave);
  expect(witness.receipt).toEqual(token);
  expect(witness.isCurrent()).toBe(true);
  expect(commitWorkspaceMock).toHaveBeenCalledOnce();
  autosave.dispose();
});

it('joins newer dirty work instead of exposing an older in-flight ACK receipt', async () => {
  const autosave = await service();
  const older = deferred<ReturnType<typeof saveAck>>();
  const latest = deferred<ReturnType<typeof saveAck>>();
  commitWorkspaceMock.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise);
  autosave.scheduleAutosave(createDocument('older'));
  await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
  autosave.scheduleAutosave(createDocument('latest'));
  let completed = false;
  const preparing = prepare(autosave).then((witness) => {
    completed = true;
    return witness;
  });
  older.resolve(saveAck(receipt(), 1));
  await vi.advanceTimersByTimeAsync(0);
  expect(completed).toBe(false);
  const token = receipt();
  latest.resolve(saveAck(token, 2));
  const witness = await preparing;
  expect(witness.receipt).toEqual(token);
  expect(witness.isCurrent()).toBe(true);
  autosave.dispose();
});

it.each(['dirty', 'interaction', 'new-save'] as const)(
  'invalidates an exit witness after %s during an async intent gap',
  async (change) => {
    const autosave = await service();
    commitWorkspaceMock.mockResolvedValueOnce(saveAck());
    await autosave.saveNow(() => createDocument('saved'));
    const witness = await prepare(autosave);
    expect(witness.isCurrent()).toBe(true);
    if (change === 'interaction') autosave.setInteractionActive(true);
    else {
      autosave.scheduleAutosave(createDocument('newer'));
      if (change === 'new-save') await autosave.flushAutosave(() => createDocument('newer'));
    }
    expect(witness.isCurrent()).toBe(false);
    autosave.dispose();
  }
);

it.each(['hydrate', 'rebind', 'discard', 'dispose'] as const)(
  'clears receipt and invalidates a witness after %s',
  async (change) => {
    const autosave = await service();
    commitWorkspaceMock.mockResolvedValueOnce(saveAck());
    await autosave.saveNow(() => createDocument('saved'));
    const witness = await prepare(autosave);
    if (change === 'hydrate') autosave.beginHydration(() => true).finish(true);
    if (change === 'rebind')
      autosave.rebindAggregate({
        aggregateId: 'image-1',
        durableRevision: 1,
        renderPresentation: null,
        sourceUrl: null,
        sourceTitle: null,
      });
    if (change === 'discard') await autosave.discardDraft();
    if (change === 'dispose') autosave.dispose();
    expect(witness.isCurrent()).toBe(false);
    expect((await prepare(autosave)).receipt).toBeNull();
    autosave.dispose();
  }
);

it('clears the old receipt when a new native ACK omits it for a no-profile or replay save', async () => {
  const autosave = await service();
  commitWorkspaceMock.mockResolvedValueOnce(saveAck());
  await autosave.saveNow(() => createDocument('first'));
  expect((await prepare(autosave)).receipt).not.toBeNull();
  await autosave.saveNow(() => createDocument('no receipt'));
  const latest = await prepare(autosave);
  expect(latest.receipt).toBeNull();
  expect(latest.isCurrent()).toBe(true);
  autosave.dispose();
});

it('rejects context replacement while preparing the local save barrier', async () => {
  const autosave = await service();
  const ack = deferred<ReturnType<typeof saveAck>>();
  commitWorkspaceMock.mockReturnValueOnce(ack.promise);
  autosave.scheduleAutosave(createDocument('older context'));
  const preparing = prepare(autosave);
  const refused = expect(preparing).rejects.toThrow('Editor document changed');
  await vi.advanceTimersByTimeAsync(0);
  activate(autosave);
  ack.resolve(saveAck());
  await refused;
  expect((await prepare(autosave)).receipt).toBeNull();
  autosave.dispose();
});

it('copies receipt values instead of exposing mutable save or page-state objects', async () => {
  const autosave = await service();
  const token = receipt();
  const expected = { ...token };
  commitWorkspaceMock.mockResolvedValueOnce(saveAck(token));
  await autosave.saveNow(() => createDocument('saved'));
  token.revision = crypto.randomUUID();
  const witness = await prepare(autosave);
  expect(witness.receipt).toEqual(expected);
  if (!witness.receipt) throw new Error('Expected receipt.');
  witness.receipt.revision = crypto.randomUUID();
  expect((await prepare(autosave)).receipt).toEqual(expected);
  autosave.dispose();
});

it('does not force-save a disabled unsaved buffer or return its prior receipt', async () => {
  const autosave = await service();
  commitWorkspaceMock.mockResolvedValueOnce(saveAck());
  await autosave.saveNow(() => createDocument('saved'));
  autosave.setEnabled(false);
  autosave.scheduleAutosave(createDocument('unsaved discard buffer'));
  const witness = await prepare(autosave);
  expect(witness.receipt).toBeNull();
  expect(witness.isCurrent()).toBe(false);
  expect(commitWorkspaceMock).toHaveBeenCalledOnce();
  autosave.dispose();
});

it('refuses an exit witness when its current native save fails', async () => {
  const autosave = await service();
  commitWorkspaceMock.mockRejectedValueOnce(new Error('Cannot save image'));
  autosave.scheduleAutosave(createDocument('unsaved'));
  await expect(prepare(autosave)).rejects.toThrow('Cannot save image');
  expect(autosave.hasUnsavedChanges()).toBe(true);
  autosave.dispose();
});
