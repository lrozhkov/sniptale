// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorFloatingDocumentBar } from './document-bar';
import type { EditorFloatingDocumentController } from './document-bar';

const mocks = vi.hoisted(() => ({
  clearSelection: vi.fn(),
  documentActions: vi.fn(() => <div data-ui="mock.document-actions" />),
  fireAndReport: vi.fn((_label: string, action: () => Promise<void> | void) => action()),
  runAndReport: vi.fn((_label: string, action: () => Promise<void> | void) => action()),
}));

const storeState = vi.hoisted(() => ({
  value: {
    pageTitle: 'Captured page',
    saveErrorMessage: null as string | null,
    saveState: 'saved' as const,
  },
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: (selector: (state: typeof storeState.value) => unknown) =>
    selector(storeState.value),
}));
vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/controller-context')>()),
  useEditorController: () => ({ clearSelection: mocks.clearSelection }),
}));
vi.mock('../../application/embed-context/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/embed-context/context')>()),
  useEditorEmbedContext: () => ({ mode: null }),
}));
vi.mock('../../runtime/async-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/async-actions')>()),
  fireAndReportEditorAction: mocks.fireAndReport,
  runAndReportEditorAction: mocks.runAndReport,
}));
vi.mock('../../inspector/document-actions', () => ({
  EditorInspectorDocumentActions: mocks.documentActions,
}));
vi.mock('../../inspector/document-actions/export-settings', () => ({
  useEditorExportSettingsState: () => ({
    imageFormat: 'png',
    isClipboardCopySupported: true,
  }),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createDeferredAction() {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function createController(
  overrides: Partial<EditorFloatingDocumentController>
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
    savePresets: [],
    saveToPreset: vi.fn(),
    ...overrides,
  } as EditorFloatingDocumentController;
}

function renderDocumentBar(controller: EditorFloatingDocumentController) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <EditorFloatingDocumentBar
        documentController={controller}
        hasImage
        history={{ canRedo: false, canUndo: false }}
        onBeforeSelectionAwareAction={vi.fn()}
      />
    );
  });
}

function getCopyButton() {
  const button = container?.querySelector<HTMLButtonElement>(
    '[data-ui="editor.floating.document-bar.copy-button"]'
  );
  expect(button).not.toBeNull();
  return button as HTMLButtonElement;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('sets floating document copy success only after the clipboard promise resolves', async () => {
  const copyAction = createDeferredAction();
  renderDocumentBar(createController({ onCopyRenderedImage: vi.fn(() => copyAction.promise) }));

  act(() => getCopyButton().click());
  expect(getCopyButton().getAttribute('data-copy-status')).toBe('saving');

  await act(async () => copyAction.resolve());

  expect(getCopyButton().getAttribute('data-copy-status')).toBe('saved');
});

it('does not show saved copy feedback when clipboard copy fails', async () => {
  const copyAction = createDeferredAction();
  renderDocumentBar(createController({ onCopyRenderedImage: vi.fn(() => copyAction.promise) }));

  act(() => getCopyButton().click());
  expect(getCopyButton().getAttribute('data-copy-status')).toBe('saving');

  await act(async () => copyAction.reject(new Error('clipboard blocked')));

  expect(getCopyButton().getAttribute('data-copy-status')).toBe('idle');
});
