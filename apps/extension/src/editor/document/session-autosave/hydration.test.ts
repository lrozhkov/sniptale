// @vitest-environment jsdom
import { EDITOR_AUTOSAVE_POLICY } from '../../../features/autosave/policy';
import { describe, expect, it, vi } from 'vitest';
import { activate, createDocument, commitWorkspaceMock } from './autosave.test-support';

describe('image document hydration ownership', () => {
  it('rejects a queued explicit capture across same-root hydration even after it finishes', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    let release: () => void = () => undefined;
    commitWorkspaceMock.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { revision: 1, documentAssetsByRuntimeUrl: new Map() };
    });
    const active = autosave
      .saveNow(() => createDocument('acquired'))
      .then(
        () => null,
        (error: unknown) => error
      );
    const queued = autosave
      .saveNow(() => createDocument('old queued'))
      .then(
        () => null,
        (error: unknown) => error
      );
    await vi.advanceTimersByTimeAsync(0);
    const hydration = autosave.beginHydration(() => true);
    hydration.finish(true);
    release();
    expect(await active).toEqual(
      expect.objectContaining({
        message: 'Editor document changed while waiting to save.',
      })
    );
    expect(await queued).toEqual(
      expect.objectContaining({
        message: 'Editor document changed while waiting to save.',
      })
    );
    expect(commitWorkspaceMock).toHaveBeenCalledOnce();
    expect(autosave.getDurableRevision()).toBe(1);
    await autosave.saveNow(() => createDocument('new current'));
    expect(commitWorkspaceMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedRevision: 1 })
    );
    autosave.dispose();
  });
  it('refuses unrelated explicit Save while the opening owner can save its initial document', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    const hydration = autosave.beginHydration(() => true);
    const old = vi.fn(() => createDocument('old canvas'));
    await expect(autosave.saveNow(old)).rejects.toThrow('still loading');
    expect(old).not.toHaveBeenCalled();
    await hydration.saveNow(() => createDocument('new document'));
    expect(commitWorkspaceMock).toHaveBeenCalledOnce();
    hydration.finish(true);
    await autosave.saveNow(() => createDocument('rename after load'));
    expect(commitWorkspaceMock).toHaveBeenCalledTimes(2);
    autosave.dispose();
  });
  it('keeps automatic writes closed throughout hydration without changing paused mode', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    autosave.setEnabled(false);
    const loading = autosave.beginHydration(() => true);
    autosave.rebindAggregate({
      aggregateId: 'loading',
      durableRevision: 0,
      renderPresentation: null,
      sourceTitle: null,
      sourceUrl: null,
    });
    autosave.setEnabled(true);
    const oldCanvas = vi.fn(() => createDocument('old canvas'));
    autosave.scheduleAutosave(oldCanvas());
    await autosave.persistSnapshot(oldCanvas);
    await autosave.flushAutosave(oldCanvas);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(commitWorkspaceMock).not.toHaveBeenCalled();
    oldCanvas.mockClear();
    autosave.setEnabled(false);
    loading.finish(true);
    expect(autosave.isEnabled()).toBe(false);
    await autosave.persistSnapshot(oldCanvas);
    expect(oldCanvas).not.toHaveBeenCalled();
    autosave.dispose();
  });

  it('does not let stale hydration completion unlock its replacement', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    let current = true;
    const first = autosave.beginHydration(() => current);
    const second = autosave.beginHydration(() => true);
    first.finish(true);
    autosave.scheduleAutosave(createDocument('old'));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(commitWorkspaceMock).not.toHaveBeenCalled();
    current = false;
    first.finish(true);
    second.finish(false);
    await autosave.flushAutosave(() => createDocument('failed load'));
    expect(commitWorkspaceMock).not.toHaveBeenCalled();
    const next = autosave.beginHydration(() => true);
    next.finish(true);
    autosave.scheduleAutosave(createDocument('new'));
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
    expect(commitWorkspaceMock).toHaveBeenCalledOnce();
    autosave.dispose();
  });
});
