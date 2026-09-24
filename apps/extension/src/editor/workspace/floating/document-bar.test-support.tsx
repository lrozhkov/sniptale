// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { EditorFloatingDocumentBar } from './document-bar';
import type { EditorFloatingDocumentController } from './document-bar';
import type { EditorToolbarContentProps } from '../toolbar/types';

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
  autosaveEnabled: true,
  autosaveSetEnabled: vi.fn((enabled: boolean) => {
    mocks.autosaveEnabled = enabled;
  }),
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
      saveNow: vi.fn(async () => undefined),
      isEnabled: () => mocks.autosaveEnabled,
      setEnabled: mocks.autosaveSetEnabled,
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

export let container: HTMLDivElement | null = null;
let root: Root | null = null;

export function createController(
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

export function createProps(
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

export function renderDocumentBar(props = createProps()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<EditorFloatingDocumentBar {...props} />);
  });
}

export function rerenderDocumentBar(props = createProps()) {
  act(() => root?.render(<EditorFloatingDocumentBar {...props} />));
}

export function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

export function getButton(dataUi: string) {
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
  mocks.autosaveEnabled = true;
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

export function unmountDocumentBar() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
}

afterEach(() => {
  unmountDocumentBar();
  vi.unstubAllGlobals();
});

export { mocks, storeState };
