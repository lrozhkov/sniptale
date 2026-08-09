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
  clearSelection: vi.fn(),
  documentActions: vi.fn(() => <div data-ui="mock.document-actions" />),
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
  autosaveLastWriteError: null as unknown,
  connectAggregateEditorPresence: vi.fn(() => ({ dispose: vi.fn() })),
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
      flushAutosave: vi.fn(async () => undefined),
      getDurableRevision: vi.fn(() => 1),
      getLastWriteError: vi.fn(() => mocks.autosaveLastWriteError),
    },
    clearSelection: mocks.clearSelection,
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
vi.mock('../../inspector/document-actions', () => ({
  EditorInspectorDocumentActions: mocks.documentActions,
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
    history: { canRedo: true, canUndo: true },
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

it('renders document title, status, and document quick actions next to the title', async () => {
  const controller = createController();
  renderDocumentBar(createProps({}, controller));

  expect(container?.textContent).toContain('Captured page');
  expect(container?.textContent).toContain(translate('common.states.saved'));
  const status = container?.querySelector<HTMLElement>('[data-state="saved"]');
  expect(status?.className).toContain('text-[12px] font-semibold uppercase');
  expect(status?.className).not.toContain('tracking-');

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
});

it('shows storage state separately and promotes a linked draft without changing its id', async () => {
  window.history.replaceState(null, '', '?assetId=asset-1');
  renderDocumentBar();
  await act(async () => Promise.resolve());

  expect(container?.textContent).toContain(translate('editor.documentActions.draft'));
  const promote = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (candidate) =>
      candidate.textContent?.includes(translate('editor.documentActions.saveToLibrary'))
  );
  await act(async () => promote?.click());

  expect(mocks.promoteImageAggregate).toHaveBeenCalledWith('asset-1', 1);
  expect(container?.textContent).toContain(translate('editor.documentActions.inLibrary'));
  window.history.replaceState(null, '', '/');
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
  expect(mocks.autosaveActivate).toHaveBeenCalledWith(
    expect.objectContaining({ durableRevision: 1, sourceTitle: 'Captured page' })
  );
  expect(window.location.search).toContain('assetId=');
});

it('opens the existing full document actions menu from the file button', () => {
  const controller = createController();
  renderDocumentBar(createProps({}, controller));

  act(() => {
    getButton('editor.floating.document-bar.file-menu-button').click();
  });

  expect(
    container?.querySelector('[data-ui="editor.floating.document-bar.file-menu"]')
  ).not.toBeNull();
  expect(container?.querySelector('[data-ui="mock.document-actions"]')).not.toBeNull();
  expect(mocks.documentActions).toHaveBeenCalledWith(
    expect.objectContaining({
      canvasSize: { height: 720, width: 1280 },
      onExportSession: controller.onExportSession,
      onSaveToPreset: controller.saveToPreset,
    }),
    undefined
  );
});

it('keeps document-required quick actions disabled for an empty editor', () => {
  storeState.value = {
    pageTitle: '',
    saveErrorMessage: null,
    saveState: 'idle',
    sessionId: null,
  };

  renderDocumentBar(createProps({ hasImage: false }));

  expect(getButton('editor.floating.document-bar.file-menu-button').disabled).toBe(true);
  expect(getButton('editor.floating.document-bar.save-button').disabled).toBe(true);
  expect(getButton('editor.floating.document-bar.save-as-button').disabled).toBe(true);
  expect(
    container?.querySelector('[data-ui="editor.floating.document-bar.copy-button"]')
  ).toBeNull();
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

it('renders saving, error, and draft status labels from the current store state', () => {
  const renderStatus = (state: typeof storeState.value, expected: string) => {
    storeState.value = state;
    renderDocumentBar();
    expect(container?.textContent).toContain(expected);
    act(() => root?.unmount());
    root = null;
    container?.remove();
    container = null;
  };

  renderStatus(
    {
      pageTitle: 'Captured page',
      saveErrorMessage: null,
      saveState: 'saved',
      sessionId: 'asset-1',
    },
    translate('common.states.saved')
  );
  renderStatus(
    {
      pageTitle: 'Captured page',
      saveErrorMessage: null,
      saveState: 'saving',
      sessionId: 'asset-1',
    },
    translate('common.states.saving')
  );
  renderStatus(
    {
      pageTitle: 'Captured page',
      saveErrorMessage: 'Disk error',
      saveState: 'error',
      sessionId: 'asset-1',
    },
    'Disk error'
  );
  renderStatus(
    { pageTitle: 'Captured page', saveErrorMessage: null, saveState: 'idle', sessionId: 'asset-1' },
    translate('common.states.draft')
  );
});
