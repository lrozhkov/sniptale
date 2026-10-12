// @vitest-environment jsdom
import { EDITOR_AUTOSAVE_POLICY } from '../../../features/autosave/policy';
import { describe, expect, it, vi } from 'vitest';
import {
  activate,
  createDocument,
  commitPresentationMock,
  commitWorkspaceMock,
} from './autosave.test-support';

describe('image autosave ordered snapshot barriers', () => {
  it.each(['saveNow', 'persistSnapshot'] as const)(
    'joins an accepted %s that supersedes its pending autosave barrier',
    async (command) => {
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
      autosave.scheduleAutosave(createDocument('first'));
      await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
      let latest = createDocument('pending');
      autosave.scheduleAutosave(latest);
      let outcome: unknown = 'pending';
      const flushed = autosave
        .flushAutosave(() => latest)
        .then(
          () => {
            outcome = 'saved';
          },
          (error: unknown) => {
            outcome = error;
          }
        );
      latest = createDocument('explicit latest');
      const explicit = autosave[command](() => latest);
      await vi.advanceTimersByTimeAsync(0);
      expect(outcome).toBe('pending');
      release();
      await Promise.all([explicit, flushed]);
      expect(outcome).toBe('saved');
      expect(
        commitWorkspaceMock.mock.calls.map(([input]) => input.document.sourceImageData)
      ).toEqual(['first', 'explicit latest']);
      expect(autosave.hasUnsavedChanges()).toBe(false);
      autosave.dispose();
    }
  );
  it.each(['success', 'new-edit', 'failure', 'pause', 'rebind', 'dispose'] as const)(
    'handles %s while a latest flush joins an acquired explicit snapshot',
    async (transition) => {
      const { createEditorSessionAutosaveService } = await import('./');
      const autosave = createEditorSessionAutosaveService();
      activate(autosave);
      const failure = new Error('explicit snapshot failed');
      let releaseFirst: () => void = () => undefined;
      let releaseExplicit: () => void = () => undefined;
      let rejectExplicit: (error: unknown) => void = () => undefined;
      commitWorkspaceMock
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              releaseFirst = () => resolve({ revision: 1, documentAssetsByRuntimeUrl: new Map() });
            })
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              releaseExplicit = () =>
                resolve({ revision: 2, documentAssetsByRuntimeUrl: new Map() });
              rejectExplicit = reject;
            })
        );
      autosave.scheduleAutosave(createDocument('first'));
      await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
      let latest = createDocument('pending');
      autosave.scheduleAutosave(latest);
      const flushed = autosave
        .flushAutosave(() => latest)
        .then(
          () => null,
          (error: unknown) => error
        );
      latest = createDocument('explicit');
      const explicit = autosave
        .saveNow(() => latest)
        .then(
          () => null,
          (error: unknown) => error
        );
      releaseFirst();
      await vi.advanceTimersByTimeAsync(0);
      expect(commitWorkspaceMock).toHaveBeenCalledTimes(2);
      if (transition === 'new-edit') {
        latest = createDocument('after explicit');
        autosave.scheduleAutosave(latest);
      }
      if (transition === 'pause') autosave.setEnabled(false);
      if (transition === 'rebind')
        autosave.rebindAggregate({
          aggregateId: 'rebound',
          durableRevision: 7,
          renderPresentation: null,
          sourceTitle: null,
          sourceUrl: null,
        });
      if (transition === 'dispose') autosave.dispose();
      if (transition === 'failure') rejectExplicit(failure);
      else releaseExplicit();
      const result = await flushed;
      if (transition === 'rebind' || transition === 'dispose') {
        expect(result).toEqual(
          expect.objectContaining({ message: 'Editor document changed while waiting to save.' })
        );
      } else if (transition === 'failure') {
        expect(result).toBe(failure);
        expect(autosave.hasUnsavedChanges()).toBe(true);
      } else expect(result).toBeNull();
      const explicitResult = await explicit;
      if (transition === 'rebind' || transition === 'dispose')
        expect(explicitResult).toEqual(
          expect.objectContaining({
            message: 'Editor document changed while waiting to save.',
          })
        );
      else expect(explicitResult).toBe(transition === 'failure' ? failure : null);
      expect(commitWorkspaceMock).toHaveBeenCalledTimes(transition === 'new-edit' ? 3 : 2);
      if (transition === 'new-edit')
        expect(commitWorkspaceMock).toHaveBeenLastCalledWith(
          expect.objectContaining({ document: latest, expectedRevision: 2 })
        );
      if (transition === 'rebind') expect(autosave.getDurableRevision()).toBe(7);
      autosave.dispose();
    }
  );
});

describe('image autosave latest flush', () => {
  it('refuses an old close barrier when the same aggregate starts another document load', async () => {
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
    autosave.scheduleAutosave(createDocument('acquired'));
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
    const document = vi.fn(() => createDocument('old close'));
    const closing = autosave.flushAutosave(document).then(
      () => null,
      (error: unknown) => error
    );
    const hydration = autosave.beginHydration(() => true);
    hydration.finish(true);
    release();
    expect(await closing).toEqual(
      expect.objectContaining({
        message: 'Editor document changed while waiting to save.',
      })
    );
    expect(document).not.toHaveBeenCalled();
    expect(autosave.getDurableRevision()).toBe(1);
    expect(commitWorkspaceMock).toHaveBeenCalledOnce();
    autosave.dispose();
  });
  it('does not capture or write a clean document on repeated lifecycle flushes', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    const document = vi.fn(() => createDocument('clean'));
    await Promise.all([autosave.flushAutosave(document), autosave.flushAutosave(document)]);
    expect(document).not.toHaveBeenCalled();
    expect(commitWorkspaceMock).not.toHaveBeenCalled();
    autosave.dispose();
  });

  it('joins an active write without manufacturing another document capture', async () => {
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
    autosave.scheduleAutosave(createDocument('accepted'));
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
    const document = vi.fn(() => createDocument('duplicate'));
    const flushed = Promise.all([
      autosave.flushAutosave(document),
      autosave.flushAutosave(document),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(document).not.toHaveBeenCalled();
    release();
    await flushed;
    expect(commitWorkspaceMock).toHaveBeenCalledOnce();
    expect(autosave.hasUnsavedChanges()).toBe(false);
    autosave.dispose();
  });

  it.each([
    { releasedBeforeResume: false, retry: false },
    { releasedBeforeResume: true, retry: false },
    { releasedBeforeResume: false, retry: true },
    { releasedBeforeResume: true, retry: true },
  ])(
    'keeps an active latest flush through a newer gesture ($releasedBeforeResume, retry: $retry)',
    async ({ releasedBeforeResume, retry }) => {
      const { createEditorSessionAutosaveService } = await import('./');
      const autosave = createEditorSessionAutosaveService();
      activate(autosave);
      if (retry) {
        commitWorkspaceMock.mockRejectedValueOnce(new Error('previous transient failure'));
        autosave.scheduleAutosave(createDocument('previous failure'));
        await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
        commitWorkspaceMock.mockClear();
      }
      let release: () => void = () => undefined;
      commitWorkspaceMock.mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { revision: 1, documentAssetsByRuntimeUrl: new Map() };
      });
      autosave.scheduleAutosave(createDocument('first'));
      await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
      autosave.scheduleAutosave(createDocument('before gesture'));
      let outcome: unknown = 'pending';
      const flushed = autosave
        .flushAutosave(() => createDocument('final gesture'))
        .then(
          () => {
            outcome = 'saved';
          },
          (error: unknown) => {
            outcome = error;
          }
        );
      autosave.setInteractionActive(true);
      if (releasedBeforeResume) {
        autosave.scheduleAutosave(createDocument('final gesture'));
        autosave.setInteractionActive(false);
      }
      release();
      await vi.advanceTimersByTimeAsync(0);
      if (!releasedBeforeResume) {
        expect(outcome).toBe('pending');
        expect(commitWorkspaceMock).toHaveBeenCalledTimes(2);
        autosave.scheduleAutosave(createDocument('final gesture'));
        autosave.setInteractionActive(false);
      }
      await flushed;
      expect(outcome).toBe('saved');
      expect(commitWorkspaceMock).toHaveBeenCalledTimes(releasedBeforeResume ? 2 : 3);
      expect(commitWorkspaceMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          document: createDocument('final gesture'),
          expectedRevision: releasedBeforeResume ? 1 : 2,
        })
      );
      expect(autosave.hasUnsavedChanges()).toBe(false);
      autosave.dispose();
    }
  );

  it.each(['pause', 'dispose', 'rebind', 'failure'] as const)(
    'preserves %s handling after a gesture cancels the active flush barrier',
    async (transition) => {
      const { createEditorSessionAutosaveService } = await import('./');
      const autosave = createEditorSessionAutosaveService();
      activate(autosave);
      const failure = new Error('storage unavailable during gesture');
      let release: () => void = () => undefined;
      let reject: (error: unknown) => void = () => undefined;
      commitWorkspaceMock.mockImplementationOnce(
        () =>
          new Promise((resolve, fail) => {
            release = () => resolve({ revision: 1, documentAssetsByRuntimeUrl: new Map() });
            reject = fail;
          })
      );
      autosave.scheduleAutosave(createDocument('first'));
      await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
      autosave.scheduleAutosave(createDocument('newest'));
      const flushed = autosave
        .flushAutosave(() => createDocument('final'))
        .then(
          () => null,
          (error: unknown) => error
        );
      autosave.setInteractionActive(true);
      if (transition === 'pause') autosave.setEnabled(false);
      if (transition === 'dispose') autosave.dispose();
      if (transition === 'rebind')
        autosave.rebindAggregate({
          aggregateId: 'other-image',
          durableRevision: 5,
          renderPresentation: null,
          sourceTitle: null,
          sourceUrl: null,
        });
      if (transition === 'failure') {
        reject(failure);
        await vi.advanceTimersByTimeAsync(0);
        autosave.setInteractionActive(false);
      } else release();
      const result = await flushed;
      if (transition === 'pause') expect(result).toBeNull();
      else if (transition === 'failure') expect(result).toBe(failure);
      else
        expect(result).toEqual(
          expect.objectContaining({ message: 'Editor document changed while waiting to save.' })
        );
      expect(commitWorkspaceMock).toHaveBeenCalledOnce();
      autosave.dispose();
    }
  );
});

describe('image autosave mode', () => {
  it('shows an earlier soft failure while retaining the newer draft for explicit retry', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const { useEditorStore } = await import('../../state/useEditorStore');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    const failure = new Error('storage temporarily unavailable');
    let reject: (error: unknown) => void = () => undefined;
    commitWorkspaceMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        })
    );
    autosave.scheduleAutosave(createDocument('first'));
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
    autosave.scheduleAutosave(createDocument('newest'));
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
    reject(failure);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(commitWorkspaceMock).toHaveBeenCalledOnce();
    expect(autosave.getLastWriteError()).toBe(failure);
    expect(autosave.hasUnsavedChanges()).toBe(true);
    expect(useEditorStore.getState().saveState).toBe('error');
    expect(useEditorStore.getState().saveErrorMessage).not.toBeNull();
    await autosave.flushAutosave(() => createDocument('fallback'));
    expect(commitWorkspaceMock).toHaveBeenCalledTimes(2);
    expect(commitWorkspaceMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ document: createDocument('newest'), expectedRevision: 0 })
    );
    expect(autosave.hasUnsavedChanges()).toBe(false);
    expect(useEditorStore.getState().saveState).toBe('saved');
    expect(useEditorStore.getState().saveErrorMessage).toBeNull();
    autosave.dispose();
  });

  it('retains each accepted explicit snapshot and reads the admitted CAS after a metadata update', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    let release: () => void = () => undefined;
    commitWorkspaceMock.mockImplementationOnce(async (input) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { revision: input.expectedRevision + 1, documentAssetsByRuntimeUrl: new Map() };
    });
    const first = autosave.saveNow(() => createDocument('first explicit'));
    const second = autosave.saveNow(() => createDocument('second explicit'));
    const third = autosave.saveNow(() => createDocument('third explicit'));
    autosave.updateContext({ sourceTitle: 'new metadata' });
    autosave.setEnabled(false);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(commitWorkspaceMock).toHaveBeenCalledOnce();
    release();
    await Promise.all([first, second, third]);
    expect(commitWorkspaceMock.mock.calls.map(([input]) => input.expectedRevision)).toEqual([
      0, 1, 2,
    ]);
    expect(commitWorkspaceMock.mock.calls.map(([input]) => input.document.sourceImageData)).toEqual(
      ['first explicit', 'second explicit', 'third explicit']
    );
    expect(commitWorkspaceMock.mock.calls[1]?.[0].sourceTitle).toBe('new metadata');
    expect(autosave.getDurableRevision()).toBe(3);
    expect(autosave.hasUnsavedChanges()).toBe(false);
    autosave.dispose();
  });

  it('keeps the newer idle deadline and dirty buffer after an older acknowledgement', async () => {
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
    autosave.scheduleAutosave(createDocument('first'));
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
    autosave.scheduleAutosave(createDocument('newest'));
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay / 2);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(autosave.hasUnsavedChanges()).toBe(true);
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay / 2 - 1);
    expect(commitWorkspaceMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(commitWorkspaceMock).toHaveBeenCalledTimes(2);
    expect(commitWorkspaceMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ document: createDocument('newest'), expectedRevision: 1 })
    );
    expect(autosave.hasUnsavedChanges()).toBe(false);
    autosave.dispose();
  });

  it('stops automatic stale-source retries until the owner rebinds the aggregate', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const { StaleImageWorkspaceError } =
      await import('../../../composition/persistence/image-aggregates');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    const conflict = new StaleImageWorkspaceError('image-1');
    commitWorkspaceMock.mockRejectedValueOnce(conflict);
    autosave.scheduleAutosave(createDocument('conflicted'));
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
    expect(autosave.getLastWriteError()).toBe(conflict);
    expect(autosave.hasUnsavedChanges()).toBe(true);
    autosave.scheduleAutosave(createDocument('newer conflict'));
    autosave.setEnabled(false);
    autosave.setEnabled(true, () => createDocument('still conflicted'));
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(autosave.flushAutosave(() => createDocument('retry'))).rejects.toBe(conflict);
    expect(commitWorkspaceMock).toHaveBeenCalledOnce();
    autosave.rebindAggregate({
      aggregateId: 'recovered-image',
      durableRevision: 7,
      renderPresentation: null,
      sourceTitle: null,
      sourceUrl: null,
    });
    autosave.scheduleAutosave(createDocument('recovered'));
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
    expect(commitWorkspaceMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ aggregateId: 'recovered-image', expectedRevision: 7 })
    );
    expect(autosave.getLastWriteError()).toBeNull();
    expect(autosave.hasUnsavedChanges()).toBe(false);
    autosave.dispose();
  });

  it('ignores a late hard failure across A/B/A without stopping the recovered context', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const { StaleImageWorkspaceError } =
      await import('../../../composition/persistence/image-aggregates');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    let reject: (error: unknown) => void = () => undefined;
    commitWorkspaceMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        })
    );
    autosave.scheduleAutosave(createDocument('old A'));
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
    autosave.activate({
      aggregateId: 'image-B',
      durableRevision: 3,
      renderPresentation: null,
      sourceTitle: null,
      sourceUrl: null,
    });
    activate(autosave);
    autosave.updateContext({ durableRevision: 9 });
    autosave.scheduleAutosave(createDocument('new A'));
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
    reject(new StaleImageWorkspaceError('image-1'));
    await vi.advanceTimersByTimeAsync(0);
    expect(commitWorkspaceMock).toHaveBeenCalledTimes(2);
    expect(commitWorkspaceMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ document: createDocument('new A'), expectedRevision: 9 })
    );
    expect(autosave.getLastWriteError()).toBeNull();
    expect(autosave.getDurableRevision()).toBe(10);
    autosave.dispose();
  });

  it('retries the buffered document explicitly after a soft failure without a timer loop', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    const failure = new Error('temporarily unavailable');
    commitWorkspaceMock.mockRejectedValueOnce(failure);
    autosave.scheduleAutosave(createDocument('buffered'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(commitWorkspaceMock).toHaveBeenCalledOnce();
    expect(autosave.getLastWriteError()).toBe(failure);
    await autosave.flushAutosave(() => createDocument('fallback'));
    expect(commitWorkspaceMock).toHaveBeenCalledTimes(2);
    expect(commitWorkspaceMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ document: createDocument('buffered') })
    );
    expect(autosave.hasUnsavedChanges()).toBe(false);
    autosave.dispose();
  });

  it('skips automatic writes while off and saves the latest document when reenabled', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    autosave.scheduleAutosave(createDocument('queued'));
    autosave.setEnabled(false);
    expect(autosave.isEnabled()).toBe(false);
    autosave.scheduleAutosave(createDocument('edited-while-off'));
    expect(autosave.hasUnsavedChanges()).toBe(true);
    const document = vi.fn(() => createDocument('latest'));
    await autosave.flushAutosave(document);
    await autosave.persistSnapshot(document);
    await vi.advanceTimersByTimeAsync(500);
    expect(commitWorkspaceMock).not.toHaveBeenCalled();
    expect(document).not.toHaveBeenCalled();

    autosave.setEnabled(true, document);
    await vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay);
    expect(document).toHaveBeenCalledOnce();
    expect(commitWorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({ document: expect.objectContaining({ sourceImageData: 'latest' }) })
    );
    expect(autosave.getDurableRevision()).toBe(1);
    expect(autosave.hasUnsavedChanges()).toBe(false);
  });

  it('allows an explicit save while autosave is off and resets the mode for a new document', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    autosave.setEnabled(false);
    await autosave.saveNow(() => createDocument('explicit'));
    expect(commitWorkspaceMock).toHaveBeenCalledOnce();
    expect(autosave.hasUnsavedChanges()).toBe(false);
    expect(autosave.isEnabled()).toBe(false);
    autosave.activate({
      aggregateId: 'image-2',
      durableRevision: 0,
      renderPresentation: null,
      sourceTitle: null,
      sourceUrl: null,
    });
    expect(autosave.isEnabled()).toBe(true);
  });
});

it('saves admitted snapshots during continuous input while deferring preview work', async () => {
  const { createEditorSessionAutosaveService } = await import('./');
  const autosave = createEditorSessionAutosaveService();
  const renderPresentation = vi.fn(async () => 'data:image/png;base64,cHJldmlldw==');
  autosave.activate({
    aggregateId: 'image-1',
    durableRevision: 0,
    renderPresentation,
    sourceTitle: null,
    sourceUrl: null,
  });
  autosave.setInteractionActive(true);
  for (let elapsed = 0; elapsed < EDITOR_AUTOSAVE_POLICY.maxWait; elapsed += 500) {
    autosave.scheduleAutosave(createDocument(`input-${elapsed}`));
    await vi.advanceTimersByTimeAsync(500);
    if (elapsed + 500 < EDITOR_AUTOSAVE_POLICY.maxWait)
      expect(commitWorkspaceMock).not.toHaveBeenCalled();
  }
  expect(commitWorkspaceMock).toHaveBeenCalledOnce();
  expect(commitWorkspaceMock).toHaveBeenCalledWith(
    expect.objectContaining({
      document: createDocument('input-4500'),
    })
  );
  expect(renderPresentation).not.toHaveBeenCalled();
  autosave.setInteractionActive(false);
  expect(commitWorkspaceMock).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(3_000);
  expect(renderPresentation).toHaveBeenCalledOnce();
  autosave.dispose();
});

it('cancels an in-flight preview when input resumes and never publishes its late result', async () => {
  const { createEditorSessionAutosaveService } = await import('./');
  const autosave = createEditorSessionAutosaveService();
  let finishRender: (value: string) => void = () => undefined;
  const renderPresentation = vi.fn(
    (_signal?: AbortSignal) =>
      new Promise<string>((resolve) => {
        finishRender = resolve;
      })
  );
  autosave.activate({
    aggregateId: 'image-1',
    durableRevision: 0,
    renderPresentation,
    sourceTitle: null,
    sourceUrl: null,
  });
  await autosave.saveNow(() => createDocument('saved'));
  await vi.advanceTimersByTimeAsync(3_000);
  const signal = renderPresentation.mock.calls[0]?.[0];
  autosave.setInteractionActive(true);
  expect(signal?.aborted).toBe(true);
  finishRender('data:image/png;base64,cHJldmlldw==');
  await vi.advanceTimersByTimeAsync(0);
  expect(commitPresentationMock).not.toHaveBeenCalled();
  autosave.dispose();
});

it('automatically recovers a temporary preview failure without marking the saved document failed', async () => {
  const { createEditorSessionAutosaveService } = await import('./');
  const { useEditorStore } = await import('../../state/useEditorStore');
  const autosave = createEditorSessionAutosaveService();
  const renderPresentation = vi
    .fn()
    .mockRejectedValueOnce(new Error('temporary renderer unavailable'))
    .mockResolvedValue('data:image/png;base64,cHJldmlldw==');
  autosave.activate({
    aggregateId: 'image-1',
    durableRevision: 0,
    renderPresentation,
    sourceTitle: null,
    sourceUrl: null,
  });
  await autosave.saveNow(() => createDocument('saved document'));
  await vi.advanceTimersByTimeAsync(3_000);
  expect(renderPresentation).toHaveBeenCalledOnce();
  expect(useEditorStore.getState().saveState).toBe('saved');
  expect(useEditorStore.getState().saveErrorMessage).toBeNull();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(renderPresentation).toHaveBeenCalledTimes(2);
  expect(commitPresentationMock).toHaveBeenCalledOnce();
  expect(commitWorkspaceMock).toHaveBeenCalledOnce();
  autosave.dispose();
});

it('recovers a restored preview without marking its saved document failed', async () => {
  const { createEditorSessionAutosaveService } = await import('./');
  const { useEditorStore } = await import('../../state/useEditorStore');
  const autosave = createEditorSessionAutosaveService();
  const renderPresentation = vi
    .fn()
    .mockRejectedValueOnce(new Error('temporary restore preview failure'))
    .mockResolvedValue('data:image/png;base64,cHJldmlldw==');
  autosave.activate({
    aggregateId: 'restored',
    durableRevision: 4,
    sourceTitle: null,
    sourceUrl: null,
    renderPresentation,
  });
  useEditorStore.getState().setSaveState('saved');
  autosave.schedulePresentation();
  await vi.advanceTimersByTimeAsync(3_000);
  expect(useEditorStore.getState().saveState).toBe('saved');
  expect(useEditorStore.getState().saveErrorMessage).toBeNull();
  await vi.advanceTimersByTimeAsync(6_000);
  expect(commitPresentationMock).toHaveBeenCalledWith(
    expect.objectContaining({ expectedWorkspaceRevision: 4 })
  );
  expect(commitWorkspaceMock).not.toHaveBeenCalled();
  autosave.dispose();
});
