// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { EditorFloatingDocumentBar } from './document-bar';
import type { EditorFloatingDocumentController } from './document-bar';
import type { EditorToolbarContentProps } from '../toolbar/types';
import { StaleImageWorkspaceError } from '../../../composition/persistence/image-aggregates';

const mocks = vi.hoisted(() => ({
  autosaveDiscard: vi.fn(async () => undefined),
  clearSelection: vi.fn(),
  embed: {
    mode: null as null | 'scenario',
    onApply: null as null | (() => Promise<void>),
    onClose: null as null | (() => void),
  },
  fireAndReport: vi.fn((_label: string, action: () => Promise<void> | void) => action()),
  runAndReport: vi.fn((_label: string, action: () => Promise<void> | void) => action()),
  exportSettings: {
    imageFormat: 'png' as 'png' | 'jpeg' | 'webp',
    isClipboardCopySupported: true,
  },
  getMediaLibraryEntry: vi.fn(),
  commitImagePresentation: vi.fn(),
  promoteImageAggregate: vi.fn(),
  saveImageAggregateCopyFromDocument: vi.fn(),
  autosaveActivate: vi.fn(),
  autosaveRebindAggregate: vi.fn(),
  autosaveLastWriteError: null as unknown,
  connectAggregateEditorPresence: vi.fn(
    (_args: { aggregate: { id: string; kind: 'image' }; promote: () => Promise<void> }) => ({
      dispose: vi.fn(),
    })
  ),
}));

vi.mock('../../../workflows/aggregate-editor-presence/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/aggregate-editor-presence/client')>()),
  connectAggregateEditorPresence: mocks.connectAggregateEditorPresence,
}));

vi.mock('../../../composition/persistence/media-library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/media-library')>()),
  getMediaLibraryEntry: mocks.getMediaLibraryEntry,
}));
vi.mock('../../../composition/persistence/image-aggregates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/image-aggregates')>()),
  commitImagePresentation: mocks.commitImagePresentation,
  promoteImageAggregate: mocks.promoteImageAggregate,
  saveImageAggregateCopyFromDocument: mocks.saveImageAggregateCopyFromDocument,
}));
vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  dataUrlToBlob: vi.fn(async () => new Blob(['preview'], { type: 'image/png' })),
}));
vi.mock('../../../platform/media-utils/image-thumbnail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/image-thumbnail')>()),
  createImageThumbnailBlob: vi.fn(async () => new Blob(['thumbnail'], { type: 'image/webp' })),
}));

const storeState = vi.hoisted(() => ({
  value: {
    pageTitle: 'Captured page',
    saveErrorMessage: null as string | null,
    saveState: 'saved' as 'idle' | 'saving' | 'saved' | 'error',
    sessionId: 'asset-1' as string | null,
  },
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: (selector: (state: typeof storeState.value) => unknown) =>
    selector(storeState.value),
}));
vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/controller-context')>()),
  useEditorController: () => ({
    autosaveService: {
      activate: mocks.autosaveActivate,
      rebindAggregate: mocks.autosaveRebindAggregate,
      discardDraft: mocks.autosaveDiscard,
      flushAutosave: vi.fn(async () => undefined),
      getDurableRevision: vi.fn(() => 1),
      getLastWriteError: vi.fn(() => mocks.autosaveLastWriteError),
    },
    clearSelection: mocks.clearSelection,
    closeDocument: vi.fn(),
    exportDocument: vi.fn(),
    renderForExport: vi.fn(async () => 'data:image/png;base64,YQ=='),
  }),
}));
vi.mock('../../application/embed-context/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/embed-context/context')>()),
  useEditorEmbedContext: () => mocks.embed,
}));
vi.mock('../../runtime/async-actions', () => ({
  fireAndReportEditorAction: mocks.fireAndReport,
  runAndReportEditorAction: mocks.runAndReport,
  reportEditorActionFailure: vi.fn(),
}));
vi.mock('../../inspector/document-actions/export-settings', () => ({
  useEditorExportSettingsState: () => mocks.exportSettings,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createController(
  overrides: Partial<EditorFloatingDocumentController> = {}
): EditorFloatingDocumentController {
  return {
    canvasSize: { height: 720, width: 1280 },
    copyRenderedImageDisabledReason: null,
    defaultImagePresetId: 'default',
    onCloseDocument: vi.fn(),
    onCopyRenderedImage: vi.fn(),
    onExportSession: vi.fn(),
    onImportSession: vi.fn(),
    onOpenImage: vi.fn(),
    onSaveImage: vi.fn(),
    onSaveImageAs: vi.fn(),
    savePresets: [{ id: 'default', name: 'Downloads', path: 'Downloads' }],
    setSavePresetPickerOpen: vi.fn(),
    saveToPreset: vi.fn(),
    ...overrides,
  } as unknown as EditorFloatingDocumentController;
}

function createProps(
  overrides: Partial<EditorToolbarContentProps> = {},
  controller: EditorFloatingDocumentController = createController()
) {
  return {
    documentController: controller,
    hasImage: true,
    history: { canRedo: true, canUndo: true, index: 1, size: 2 },
    onBeforeSelectionAwareAction: vi.fn(),
    ...overrides,
  };
}

function renderDocumentBar(props = createProps()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<EditorFloatingDocumentBar {...props} />);
  });
}

function rerenderDocumentBar(props = createProps()) {
  act(() => root?.render(<EditorFloatingDocumentBar {...props} />));
}

function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function getButton(dataUi: string) {
  const button = container?.querySelector<HTMLButtonElement>(`[data-ui="${dataUi}"]`);
  expect(button).not.toBeNull();
  return button as HTMLButtonElement;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  mocks.exportSettings.imageFormat = 'png';
  mocks.exportSettings.isClipboardCopySupported = true;
  mocks.embed.mode = null;
  mocks.embed.onApply = null;
  mocks.embed.onClose = null;
  mocks.autosaveLastWriteError = null;
  mocks.getMediaLibraryEntry.mockResolvedValue({
    lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1 },
  });
  mocks.promoteImageAggregate.mockResolvedValue(undefined);
  mocks.commitImagePresentation.mockResolvedValue(undefined);
  mocks.saveImageAggregateCopyFromDocument.mockResolvedValue('image-copy');
  storeState.value = {
    pageTitle: 'Captured page',
    saveErrorMessage: null,
    saveState: 'saved',
    sessionId: 'asset-1',
  };
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders storage and autosave status with a compact separator and routes quick actions', async () => {
  const controller = createController();
  renderDocumentBar(createProps({}, controller));

  expect(container?.textContent).toContain('Captured page');
  await act(async () => Promise.resolve());
  expect(container?.textContent).toContain(translate('editor.documentActions.draft'));
  expect(container?.textContent).toContain(`·${translate('common.states.saved')}`);
  expect(container?.querySelector('[data-state="saved"]')).not.toBeNull();
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
  expect(promote.previousElementSibling?.className).toContain('flex-col');
  await act(async () => promote.click());

  expect(mocks.promoteImageAggregate).toHaveBeenCalledWith('asset-1', 1);
  expect(container?.textContent).toContain(translate('editor.documentActions.inLibrary'));
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
  const saveCopy = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
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

  expect(container?.textContent).toContain(translate('editor.documentActions.reloadLatest'));
  const saveCopy = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
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
  const saveCopy = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
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

it('moves scenario apply and close actions into the top document bar after copy', async () => {
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
  expect(actionIds.indexOf('editor.floating.document-bar.copy-button')).toBeLessThan(
    actionIds.indexOf('editor.floating.document-bar.save-for-slide-button')
  );
  expect(actionIds.indexOf('editor.floating.document-bar.save-for-slide-button')).toBeLessThan(
    actionIds.indexOf('editor.floating.document-bar.close-scenario-button')
  );
  expect(actionIds).not.toContain('editor.floating.document-bar.promote-button');
  expect(actionIds).not.toContain('editor.floating.document-bar.save-to-folder-button');
  expect(actionIds).not.toContain('editor.floating.document-bar.close-file-button');

  await act(async () => {
    getButton('editor.floating.document-bar.save-for-slide-button').click();
  });
  act(() => {
    getButton('editor.floating.document-bar.close-scenario-button').click();
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
    expect(container?.textContent).toContain(`·${expectedLabel}`);
    expect(container?.querySelector(`[data-state="${state.saveState}"]`)).not.toBeNull();
    expect(container?.textContent).not.toContain('Disk error');
    act(() => root?.unmount());
    root = null;
    container?.remove();
    container = null;
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
