// @vitest-environment jsdom

import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { StaleImageWorkspaceError } from '../../../composition/persistence/image-aggregates';
import type { EditorFloatingDocumentController } from './document-bar';
import {
  container,
  mocks,
  storeState,
  createController,
  createProps,
  renderDocumentBar,
  rerenderDocumentBar,
  createDeferred,
  getButton,
  unmountDocumentBar,
} from './document-bar.test-support';

it('renders a draft badge and compact autosave marker while routing quick actions', async () => {
  const controller = createController();
  renderDocumentBar(createProps({}, controller));

  expect(container?.textContent).toContain('Captured page');
  await act(async () => Promise.resolve());
  expect(container?.textContent).toContain(translate('editor.documentActions.draft'));
  expect(container?.textContent).not.toContain(translate('common.states.saved'));
  expect(container?.querySelector('[data-storage-class="temporary"]')?.className).toContain(
    'border'
  );
  expect(container?.querySelector('[data-state="saved"]')?.getAttribute('aria-label')).toBe(
    translate('common.states.saved')
  );
  expect(
    container?.querySelector('[data-ui="editor.floating.document-bar.file-menu-button"]')
  ).toBeNull();

  await act(async () => {
    getButton('editor.floating.document-bar.save-button').click();
    getButton('editor.floating.document-bar.save-as-button').click();
    getButton('editor.floating.document-bar.copy-button').click();
  });

  expect(controller.onSaveImage).toHaveBeenCalledOnce();
  expect(controller.onSaveImageAs).toHaveBeenCalledOnce();
  expect(controller.onCopyRenderedImage).toHaveBeenCalledOnce();
  expect(controller.onExportSession).not.toHaveBeenCalled();
  expect(getButton('editor.floating.document-bar.save-button').className).toContain(
    'max-[720px]:!hidden'
  );
  expect(
    getButton('editor.floating.document-bar.copy-button').getAttribute('data-copy-status')
  ).toBe('saved');
  expect(getButton('editor.floating.document-bar.save-to-folder-button')).not.toBeNull();
  expect(getButton('editor.floating.document-bar.close-file-button')).not.toBeNull();
});

it('keeps library state and promotion unavailable before a file is opened', async () => {
  mocks.getMediaLibraryEntry.mockResolvedValue({
    lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 },
  });
  renderDocumentBar(createProps({ hasImage: false }));
  await act(async () => Promise.resolve());

  expect(container?.textContent).not.toContain(translate('editor.documentActions.inLibrary'));
  expect(container?.textContent).not.toContain(translate('editor.documentActions.draft'));
  expect(
    container?.querySelector('[data-ui="editor.floating.document-bar.promote-button"]')
  ).toBeNull();
  expect(getButton('editor.floating.document-bar.close-file-button').disabled).toBe(true);
  expect(mocks.getMediaLibraryEntry).not.toHaveBeenCalled();
});

it('keeps the standalone quick-action order and opens the shared save dialog', async () => {
  storeState.value.pageTitle = 'capture.png';
  mocks.exportSettings.imageFormat = 'webp';
  const controller = createController();
  renderDocumentBar(createProps({}, controller));
  await act(async () => Promise.resolve());

  const actionIds = Array.from(container?.querySelectorAll('button') ?? []).map((button) =>
    button.getAttribute('data-ui')
  );
  expect(actionIds).toEqual([
    'editor.floating.document-bar.autosave-trigger',
    'editor.floating.document-bar.promote-button',
    'editor.floating.document-bar.save-button',
    'editor.floating.document-bar.save-as-button',
    'editor.floating.document-bar.copy-button',
    'editor.floating.document-bar.save-to-folder-button',
    'editor.floating.document-bar.close-file-button',
  ]);

  act(() => getButton('editor.floating.document-bar.save-to-folder-button').click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(container?.textContent).toContain('capture.png');
  expect(document.querySelector<HTMLInputElement>('#save-dialog-filename')?.value).toBe(
    'capture.webp'
  );
  expect(
    getButton('editor.floating.document-bar.save-to-folder-button').getAttribute('aria-expanded')
  ).toBe('true');
  act(() => getButton('editor.floating.document-bar.save-to-folder-button').click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(
    getButton('editor.floating.document-bar.save-to-folder-button').getAttribute('aria-expanded')
  ).toBe('false');
  act(() => getButton('editor.floating.document-bar.close-file-button').click());
  expect(
    document.querySelector('[data-ui="editor.floating.document-bar.close-confirm"]')
  ).not.toBeNull();
  await act(async () => {
    document.querySelector<HTMLButtonElement>('[data-confirm-action="true"]')?.click();
    await Promise.resolve();
  });
  expect(controller.onCloseDocument).not.toHaveBeenCalled();
  expect(mocks.autosaveDiscard).toHaveBeenCalledOnce();
});

it('omits save-to-folder when no enabled preset is available', async () => {
  renderDocumentBar(createProps({}, createController({ savePresets: [] })));
  await act(async () => Promise.resolve());

  expect(
    container?.querySelector('[data-ui="editor.floating.document-bar.save-to-folder-button"]')
  ).toBeNull();
  expect(getButton('editor.floating.document-bar.close-file-button')).not.toBeNull();
});

it('shows storage state separately and promotes a linked draft without changing its id', async () => {
  window.history.replaceState(null, '', '?assetId=asset-1');
  renderDocumentBar();
  await act(async () => Promise.resolve());

  expect(container?.textContent).toContain(translate('editor.documentActions.draft'));
  const promote = getButton('editor.floating.document-bar.promote-button');
  expect(promote.title).toBe(translate('editor.documentActions.saveToLibrary'));
  expect(promote.textContent).toBe('');
  expect(promote.getAttribute('aria-label')).toBe(
    translate('editor.documentActions.saveToLibrary')
  );
  expect(promote.previousElementSibling?.className).toContain('flex-col');
  await act(async () => promote.click());

  expect(mocks.promoteImageAggregate).toHaveBeenCalledWith('asset-1', 1);
  expect(container?.textContent).toContain(translate('editor.documentActions.inLibrary'));
  expect(container?.querySelector('[data-storage-class="library"]')).not.toBeNull();
  window.history.replaceState(null, '', '/');
});

it('keeps a failed promotion retryable and preserves the draft until success', async () => {
  mocks.commitImagePresentation.mockRejectedValueOnce(new Error('commit failed'));
  renderDocumentBar();
  await act(async () => Promise.resolve());

  await act(async () => getButton('editor.floating.document-bar.promote-button').click());

  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    translate('editor.documentActions.saveToLibraryError')
  );
  expect(container?.textContent).toContain(translate('editor.documentActions.draft'));
  expect(getButton('editor.floating.document-bar.promote-button').disabled).toBe(false);

  await act(async () => getButton('editor.floating.document-bar.promote-button').click());
  expect(mocks.promoteImageAggregate).toHaveBeenCalledWith('asset-1', 1);
  expect(container?.textContent).toContain(translate('editor.documentActions.inLibrary'));
});

it('prevents duplicate promotion while the durable commit is pending', async () => {
  const commit = createDeferred<void>();
  mocks.commitImagePresentation.mockImplementationOnce(() => commit.promise);
  renderDocumentBar();
  await act(async () => Promise.resolve());
  const promote = getButton('editor.floating.document-bar.promote-button');

  await act(async () => {
    promote.click();
    promote.click();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mocks.commitImagePresentation).toHaveBeenCalledOnce();
  expect(getButton('editor.floating.document-bar.promote-button').disabled).toBe(true);
  expect(getButton('editor.floating.document-bar.promote-button').getAttribute('aria-busy')).toBe(
    'true'
  );
  expect(getButton('editor.floating.document-bar.promote-button').title).toBe(
    translate('editor.documentActions.savingToLibrary')
  );
  expect(getButton('editor.floating.document-bar.promote-button').getAttribute('aria-label')).toBe(
    translate('editor.documentActions.savingToLibrary')
  );
  expect(getButton('editor.floating.document-bar.promote-button').textContent).toBe('');
  expect(container?.textContent).toContain(translate('editor.documentActions.draft'));
  await act(async () => commit.resolve());
});

it('shares the actual promotion result with duplicate cross-runtime callers', async () => {
  const commit = createDeferred<void>();
  mocks.commitImagePresentation.mockImplementationOnce(() => commit.promise);
  renderDocumentBar();
  await act(async () => Promise.resolve());
  const protocolPromote = mocks.connectAggregateEditorPresence.mock.calls[0]?.[0].promote;
  if (!protocolPromote) throw new Error('Expected aggregate presence promotion callback');

  await act(async () => {
    getButton('editor.floating.document-bar.promote-button').click();
    await Promise.resolve();
  });
  const protocolResult = protocolPromote();
  const rejected = expect(protocolResult).rejects.toThrow('commit failed');
  await act(async () => commit.reject(new Error('commit failed')));

  await rejected;
  expect(mocks.commitImagePresentation).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="alert"]')).not.toBeNull();
});

it('preserves operation identity and cleanup isolation across an A to B to A switch', async () => {
  const firstCommit = createDeferred<void>();
  const secondCommit = createDeferred<void>();
  mocks.commitImagePresentation
    .mockImplementationOnce(() => firstCommit.promise)
    .mockImplementationOnce(() => secondCommit.promise);
  renderDocumentBar();
  await act(async () => Promise.resolve());
  const firstAggregatePromote = mocks.connectAggregateEditorPresence.mock.calls[0]?.[0].promote;
  if (!firstAggregatePromote) throw new Error('Expected first aggregate promotion callback');
  const firstAggregateResult = firstAggregatePromote();
  await act(async () => Promise.resolve());

  storeState.value = { ...storeState.value, sessionId: 'asset-2' };
  mocks.getMediaLibraryEntry.mockResolvedValueOnce({
    lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 2 },
  });
  rerenderDocumentBar();
  await act(async () => Promise.resolve());
  const secondAggregatePromote = mocks.connectAggregateEditorPresence.mock.lastCall?.[0].promote;
  if (!secondAggregatePromote) throw new Error('Expected second aggregate promotion callback');
  const secondAggregateResult = secondAggregatePromote();
  await act(async () => Promise.resolve());
  expect(mocks.commitImagePresentation).toHaveBeenCalledTimes(2);
  expect(firstAggregatePromote()).toBe(firstAggregateResult);

  storeState.value = { ...storeState.value, sessionId: 'asset-1' };
  rerenderDocumentBar();
  await act(async () => Promise.resolve());
  const returnedAggregatePromote = mocks.connectAggregateEditorPresence.mock.lastCall?.[0].promote;
  if (!returnedAggregatePromote) throw new Error('Expected returned aggregate promotion callback');
  const duplicateFirstResult = returnedAggregatePromote();
  expect(duplicateFirstResult).toBe(firstAggregateResult);
  expect(mocks.commitImagePresentation).toHaveBeenCalledTimes(2);
  expect(getButton('editor.floating.document-bar.promote-button').disabled).toBe(true);

  await act(async () => secondCommit.resolve());
  await secondAggregateResult;
  expect(getButton('editor.floating.document-bar.promote-button').disabled).toBe(true);
  expect(returnedAggregatePromote()).toBe(firstAggregateResult);
  expect(mocks.commitImagePresentation).toHaveBeenCalledTimes(2);

  await act(async () => firstCommit.resolve());
  await Promise.all([firstAggregateResult, duplicateFirstResult]);
  expect(container?.textContent).toContain(translate('editor.documentActions.inLibrary'));
});

it('keeps stale-copy actions disabled while promotion owns the aggregate lock', async () => {
  const commit = createDeferred<void>();
  mocks.commitImagePresentation.mockImplementationOnce(() => commit.promise);
  mocks.autosaveLastWriteError = new StaleImageWorkspaceError('asset-1');
  renderDocumentBar();
  await act(async () => Promise.resolve());

  act(() => getButton('editor.floating.document-bar.promote-button').click());
  await act(async () => Promise.resolve());
  const saveCopy = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.textContent?.includes(translate('editor.documentActions.saveCopy'))
  );
  expect(saveCopy?.disabled).toBe(true);
  saveCopy?.click();
  expect(mocks.saveImageAggregateCopyFromDocument).not.toHaveBeenCalled();

  await act(async () => commit.resolve());
});

it('ignores stale storage reads after the active document changes', async () => {
  const staleRead = createDeferred<{
    lifecycle: { savedAt: null; storageClass: 'temporary'; updatedAt: number };
  }>();
  mocks.getMediaLibraryEntry.mockImplementationOnce(() => staleRead.promise);
  renderDocumentBar();

  storeState.value = { ...storeState.value, sessionId: 'asset-2' };
  mocks.getMediaLibraryEntry.mockResolvedValueOnce({
    lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 2 },
  });
  rerenderDocumentBar();
  await act(async () => Promise.resolve());
  await act(async () =>
    staleRead.resolve({
      lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1 },
    })
  );

  expect(container?.textContent).toContain(translate('editor.documentActions.inLibrary'));
  expect(
    container?.querySelector('[data-ui="editor.floating.document-bar.promote-button"]')
  ).toBeNull();
});

it('does not show the previous document library state while the next document loads', async () => {
  mocks.getMediaLibraryEntry.mockResolvedValueOnce({
    lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 },
  });
  renderDocumentBar();
  await act(async () => Promise.resolve());
  expect(container?.textContent).toContain(translate('editor.documentActions.inLibrary'));

  const nextRead = createDeferred<{
    lifecycle: { savedAt: null; storageClass: 'temporary'; updatedAt: number };
  }>();
  mocks.getMediaLibraryEntry.mockImplementationOnce(() => nextRead.promise);
  storeState.value = { ...storeState.value, sessionId: 'asset-2' };
  rerenderDocumentBar();
  expect(container?.textContent).not.toContain(translate('editor.documentActions.inLibrary'));
  expect(container?.querySelector('[data-storage-class="temporary"]')).not.toBeNull();

  await act(async () =>
    nextRead.resolve({
      lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 2 },
    })
  );
  expect(getButton('editor.floating.document-bar.promote-button')).not.toBeNull();
});

it('keeps promotion available when library metadata cannot be read', async () => {
  mocks.getMediaLibraryEntry.mockRejectedValueOnce(new Error('storage unavailable'));
  renderDocumentBar();
  await act(async () => Promise.resolve());

  expect(container?.textContent).toContain(translate('editor.documentActions.draft'));
  expect(getButton('editor.floating.document-bar.promote-button')).not.toBeNull();
});

it('removes the promotion action immediately for reduced motion', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true }))
  );
  renderDocumentBar();
  await act(async () => Promise.resolve());

  await act(async () => getButton('editor.floating.document-bar.promote-button').click());

  expect(
    container?.querySelector('[data-ui="editor.floating.document-bar.promote-button"]')
  ).toBeNull();
});

it('offers reload and an atomic copy when another tab made the workspace stale', async () => {
  mocks.autosaveLastWriteError = new StaleImageWorkspaceError('asset-1');
  storeState.value = {
    pageTitle: 'Captured page',
    saveErrorMessage: 'Workspace changed',
    saveState: 'error',
    sessionId: 'asset-1',
  };
  renderDocumentBar();

  expect(document.body.textContent).toContain(translate('editor.documentActions.reloadLatest'));
  const saveCopy = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.textContent?.includes(translate('editor.documentActions.saveCopy'))
  );
  await act(async () => saveCopy?.click());

  expect(mocks.saveImageAggregateCopyFromDocument).toHaveBeenCalledWith(
    expect.objectContaining({ sourceTitle: 'Captured page', targetAggregateId: expect.any(String) })
  );
  expect(mocks.autosaveRebindAggregate).toHaveBeenCalledWith(
    expect.objectContaining({ durableRevision: 1, sourceTitle: 'Captured page' })
  );
  expect(window.location.search).toContain('assetId=');
});

it('does not rebind a stale conflict copy after an A to B to A activation change', async () => {
  const copy = createDeferred<string>();
  mocks.autosaveLastWriteError = new StaleImageWorkspaceError('asset-1');
  mocks.saveImageAggregateCopyFromDocument.mockImplementationOnce(() => copy.promise);
  renderDocumentBar();
  const saveCopy = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.textContent?.includes(translate('editor.documentActions.saveCopy'))
  );
  await act(async () => {
    saveCopy?.click();
    await Promise.resolve();
    await Promise.resolve();
  });

  storeState.value = { ...storeState.value, sessionId: 'asset-2' };
  rerenderDocumentBar();
  await act(async () => Promise.resolve());
  storeState.value = { ...storeState.value, sessionId: 'asset-1' };
  rerenderDocumentBar();
  await act(async () => Promise.resolve());
  await act(async () => copy.resolve('image-copy'));

  expect(mocks.autosaveActivate).not.toHaveBeenCalled();
  expect(container?.textContent).toContain(translate('editor.documentActions.draft'));
});

it('removes the file menu from the floating document bar', () => {
  renderDocumentBar();
  expect(
    container?.querySelector('[data-ui="editor.floating.document-bar.file-menu-button"]')
  ).toBeNull();
  expect(container?.querySelector('[data-ui="editor.floating.document-bar.file-menu"]')).toBeNull();
});

it('keeps document-required quick actions disabled for an empty editor', () => {
  storeState.value = {
    pageTitle: '',
    saveErrorMessage: null,
    saveState: 'idle',
    sessionId: null,
  };

  renderDocumentBar(createProps({ hasImage: false }));

  expect(getButton('editor.floating.document-bar.save-button').disabled).toBe(true);
  expect(getButton('editor.floating.document-bar.save-as-button').disabled).toBe(true);
  expect(
    container?.querySelector('[data-ui="editor.floating.document-bar.copy-button"]')
  ).toBeNull();
  expect(getButton('editor.floating.document-bar.close-file-button').disabled).toBe(true);
  expect(container?.textContent).toContain(translate('editor.page.title'));
});

it('hides the copy quick action when clipboard copy is unavailable', () => {
  const controller = createController({
    copyRenderedImageDisabledReason: 'unsupported',
  } as unknown as Partial<EditorFloatingDocumentController>);
  renderDocumentBar(createProps({}, controller));

  expect(
    container?.querySelector('[data-ui="editor.floating.document-bar.copy-button"]')
  ).toBeNull();
});

it('hides the copy quick action for export formats that cannot be copied to clipboard', () => {
  mocks.exportSettings.imageFormat = 'jpeg';
  mocks.exportSettings.isClipboardCopySupported = false;
  renderDocumentBar(createProps());

  expect(
    container?.querySelector('[data-ui="editor.floating.document-bar.copy-button"]')
  ).toBeNull();
});

it('places visible scenario cancel and apply before local export actions', async () => {
  const controller = createController();
  const onApply = vi.fn(async () => undefined);
  const onClose = vi.fn();
  const onBeforeSelectionAwareAction = vi.fn();
  mocks.embed.mode = 'scenario';
  mocks.embed.onApply = onApply;
  mocks.embed.onClose = onClose;

  renderDocumentBar(createProps({ onBeforeSelectionAwareAction }, controller));

  const actionIds = Array.from(container?.querySelectorAll('button') ?? []).map((button) =>
    button.getAttribute('data-ui')
  );
  expect(actionIds.indexOf('editor.floating.document-bar.cancel-scenario-button')).toBeLessThan(
    actionIds.indexOf('editor.floating.document-bar.apply-scenario-button')
  );
  expect(actionIds.indexOf('editor.floating.document-bar.apply-scenario-button')).toBeLessThan(
    actionIds.indexOf('editor.floating.document-bar.save-button')
  );
  expect(getButton('editor.floating.document-bar.apply-scenario-button').textContent).toContain(
    translate('editor.documentActions.applyToScenario')
  );
  expect(getButton('editor.floating.document-bar.cancel-scenario-button').textContent).toContain(
    translate('editor.documentActions.returnToScenario')
  );
  expect(container?.querySelector('[data-state]')).toBeNull();
  expect(actionIds).not.toContain('editor.floating.document-bar.promote-button');
  expect(actionIds).not.toContain('editor.floating.document-bar.save-to-folder-button');
  expect(actionIds).not.toContain('editor.floating.document-bar.close-file-button');

  await act(async () => {
    getButton('editor.floating.document-bar.apply-scenario-button').click();
  });
  act(() => {
    getButton('editor.floating.document-bar.cancel-scenario-button').click();
  });

  expect(onBeforeSelectionAwareAction).toHaveBeenCalledOnce();
  expect(mocks.clearSelection).toHaveBeenCalledOnce();
  expect(onApply).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
});

it('keeps storage identity stable while reflecting autosave states', async () => {
  const renderStatus = async (state: typeof storeState.value, expectedLabel: string) => {
    storeState.value = state;
    renderDocumentBar();
    await act(async () => Promise.resolve());
    expect(container?.textContent).toContain(translate('editor.documentActions.draft'));
    const status = container?.querySelector(`[data-state="${state.saveState}"]`);
    expect(status?.getAttribute('aria-label')).toBe(expectedLabel);
    expect(status?.getAttribute('title')).toBe(expectedLabel);
    expect(status?.textContent).toBe(
      state.saveState === 'saved' || state.saveState === 'saving' ? '' : expectedLabel
    );
    expect(container?.textContent).not.toContain('Disk error');
    unmountDocumentBar();
  };

  await renderStatus(
    {
      pageTitle: 'Captured page',
      saveErrorMessage: null,
      saveState: 'saved',
      sessionId: 'asset-1',
    },
    translate('common.states.saved')
  );
  await renderStatus(
    {
      pageTitle: 'Captured page',
      saveErrorMessage: null,
      saveState: 'saving',
      sessionId: 'asset-1',
    },
    translate('common.states.saving')
  );
  await renderStatus(
    {
      pageTitle: 'Captured page',
      saveErrorMessage: 'Disk error',
      saveState: 'error',
      sessionId: 'asset-1',
    },
    translate('common.states.error')
  );
  await renderStatus(
    { pageTitle: 'Captured page', saveErrorMessage: null, saveState: 'idle', sessionId: 'asset-1' },
    translate('common.states.dirty')
  );
});

it('toggles autosave in its anchored status popover and keeps the library control icon-only', async () => {
  renderDocumentBar();
  await act(async () => Promise.resolve());
  const trigger = getButton('editor.floating.document-bar.autosave-trigger');
  expect(trigger.getAttribute('data-state')).toBe('saved');
  act(() => trigger.click());
  const popover = document.querySelector('#editor-autosave-status');
  expect(popover?.textContent).toContain(translate('editor.documentActions.autosaveOnDescription'));
  const toggle = popover?.querySelector<HTMLInputElement>('input[role="switch"]');
  expect(toggle?.checked).toBe(true);
  act(() => toggle?.click());
  expect(mocks.autosaveSetEnabled).toHaveBeenCalledWith(false, expect.any(Function));
  expect(trigger.getAttribute('data-state')).toBe('off');
  expect(trigger.textContent).toBe(translate('editor.documentActions.autosaveOffStatus'));
  expect(popover?.textContent).toContain(
    translate('editor.documentActions.autosaveOffDescription')
  );
  act(() => toggle?.click());
  expect(mocks.autosaveSetEnabled).toHaveBeenCalledWith(true, expect.any(Function));
  expect(trigger.getAttribute('data-state')).toBe('saved');
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger);
});

it('keeps apply disabled before loading and blocks duplicate apply or cancel during rendering', async () => {
  let finish!: () => void;
  const apply = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  mocks.embed.mode = 'scenario';
  mocks.embed.onApply = apply;
  mocks.embed.onClose = vi.fn();
  renderDocumentBar(createProps({ hasImage: false }));
  expect(getButton('editor.floating.document-bar.apply-scenario-button').disabled).toBe(true);
  rerenderDocumentBar(createProps());
  act(() => {
    getButton('editor.floating.document-bar.apply-scenario-button').click();
    getButton('editor.floating.document-bar.apply-scenario-button').click();
  });
  expect(apply).toHaveBeenCalledOnce();
  expect(getButton('editor.floating.document-bar.cancel-scenario-button').disabled).toBe(true);
  expect(getButton('editor.floating.document-bar.apply-scenario-button').disabled).toBe(true);
  await act(async () => finish());
  expect(getButton('editor.floating.document-bar.apply-scenario-button').disabled).toBe(false);
  expect(getButton('editor.floating.document-bar.cancel-scenario-button').disabled).toBe(false);
});

it('automatically opens a new error after recovery and never exposes diagnostic text', async () => {
  storeState.value.saveState = 'error';
  storeState.value.saveErrorMessage = 'internal-record-id=secret';
  renderDocumentBar();
  await act(async () => Promise.resolve());
  let trigger = container?.querySelector<HTMLButtonElement>('[data-state="error"]');
  expect(document.querySelector('#editor-save-error')?.textContent).toContain(
    translate('editor.documentActions.saveErrorDescription')
  );
  expect(document.body.textContent).not.toContain('internal-record-id');
  act(() => trigger?.click());
  storeState.value.saveState = 'saved';
  rerenderDocumentBar();
  expect(document.querySelector('#editor-save-error')).toBeNull();
  storeState.value.saveState = 'error';
  rerenderDocumentBar();
  trigger = container?.querySelector<HTMLButtonElement>('[data-state="error"]');
  expect(trigger?.getAttribute('aria-expanded')).toBe('true');
});

it('keeps autosave control reachable after a failed save while the mode is off', async () => {
  mocks.autosaveEnabled = false;
  storeState.value.saveState = 'error';
  renderDocumentBar();
  await act(async () => Promise.resolve());

  expect(
    container?.querySelector('[data-ui="editor.floating.document-bar.error-trigger"]')
  ).not.toBeNull();
  const trigger = getButton('editor.floating.document-bar.autosave-trigger');
  expect(trigger.getAttribute('data-state')).toBe('off');
  act(() => trigger.click());
  const toggle = document.querySelector<HTMLInputElement>(
    '#editor-autosave-status input[role="switch"]'
  );
  expect(toggle?.checked).toBe(false);
  act(() => toggle?.click());
  expect(mocks.autosaveSetEnabled).toHaveBeenCalledWith(true, expect.any(Function));
  expect(trigger.getAttribute('data-state')).toBe('autosave-settings');
});
