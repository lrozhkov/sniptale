// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  bootstrapEditorPageSessionMock,
  createEditorPageServicesMock,
  flushEditorAutosaveIfNeededMock,
  loadEditorPageDefaultsMock,
  openEditorBootstrapPayloadMock,
  useEditorStoreMock,
  useAppLocaleMock,
  useCommandPaletteHotkeyMock,
} = vi.hoisted(() => ({
  bootstrapEditorPageSessionMock: vi.fn(),
  createEditorPageServicesMock: vi.fn(),
  flushEditorAutosaveIfNeededMock: vi.fn(),
  loadEditorPageDefaultsMock: vi.fn(),
  openEditorBootstrapPayloadMock: vi.fn(),
  useEditorStoreMock: vi.fn(),
  useAppLocaleMock: vi.fn(),
  useCommandPaletteHotkeyMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: useAppLocaleMock,
  usePageLocaleMetadata: useAppLocaleMock,
}));

vi.mock('../../../ui/command-palette/hotkey', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ui/command-palette/hotkey')>()),
  useCommandPaletteHotkey: useCommandPaletteHotkeyMock,
}));

vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/controller-context')>()),
  EditorControllerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../command-palette', () => ({
  EditorCommandPalette: ({ hasImage }: { hasImage: boolean }) => (
    <div data-ui="editor.command-palette">{String(hasImage)}</div>
  ),
}));

vi.mock('../../workspace/canvas', () => ({
  CanvasWrapper: ({ hasImage }: { hasImage: boolean }) => (
    <div data-ui="editor.canvas-wrapper">
      <div data-ui="editor.canvas.context-zone">
        <div data-ui="editor.canvas.surface-hit-area">{String(hasImage)}</div>
        {!hasImage ? <div data-ui="editor.canvas.empty-dropzone">empty</div> : null}
      </div>
      <div data-ui="editor.canvas.preview-zone">preview</div>
    </div>
  ),
}));

vi.mock('../../workspace/floating', () => ({
  EditorFloatingWorkspace: ({ hasImage }: { hasImage: boolean }) => (
    <div data-ui="editor.floating-workspace">{String(hasImage)}</div>
  ),
}));

vi.mock('./runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime')>()),
  bootstrapEditorPageSession: bootstrapEditorPageSessionMock,
  createEditorPageServices: createEditorPageServicesMock,
  flushEditorAutosaveIfNeeded: flushEditorAutosaveIfNeededMock,
  loadEditorPageDefaults: loadEditorPageDefaultsMock,
  openEditorBootstrapPayload: openEditorBootstrapPayloadMock,
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: useEditorStoreMock,
}));

import { EDITOR_BOOTSTRAP_EVENT } from '@sniptale/ui/branding';
import type { EditorBootstrapPayload } from '../../../workflows/editor/bootstrap';
import { dispatchMalformedEditorBootstrapEvent } from './index.test-support';
import { EditorPage } from './';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createServices() {
  return {
    autosaveService: {
      dispose: vi.fn(),
    },
    controller: {
      dispose: vi.fn(),
    },
  };
}

function createEditorStoreState(
  overrides: Partial<
    Record<'imageData' | 'hydrateDefaults' | 'hydrateWorkspaceDefaults' | 'setPageTitle', unknown>
  > = {}
) {
  return {
    imageData: 'data:image/png;base64,1',
    hydrateDefaults: vi.fn(),
    hydrateWorkspaceDefaults: vi.fn(),
    setPageTitle: vi.fn(),
    ...overrides,
  };
}

type EditorStoreState = ReturnType<typeof createEditorStoreState>;

function applyEditorStoreState(state: EditorStoreState) {
  useEditorStoreMock.mockImplementation((selector: (editorState: EditorStoreState) => unknown) =>
    selector(state)
  );
}

async function renderEditorPage() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<EditorPage />);
  });
}

function useEditorPageTestScope() {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
}

async function verifiesImageOwnedPageShell() {
  const services = createServices();
  const state = createEditorStoreState();
  createEditorPageServicesMock.mockReturnValue(services);
  applyEditorStoreState(state);

  await renderEditorPage();

  const pageRoot = container?.querySelector('[data-ui="editor.page.root"]');

  expect(useAppLocaleMock).toHaveBeenCalledOnce();
  expect(createEditorPageServicesMock).toHaveBeenCalledTimes(1);
  expect(loadEditorPageDefaultsMock).toHaveBeenCalledWith(
    state.hydrateDefaults,
    state.hydrateWorkspaceDefaults
  );
  expect(bootstrapEditorPageSessionMock).toHaveBeenCalledTimes(1);
  expect(useCommandPaletteHotkeyMock).toHaveBeenCalledTimes(1);
  expect(pageRoot?.className).toContain('relative h-screen');
  expect(pageRoot?.className).toContain('bg-[var(--sniptale-color-surface-canvas)]');
  expect(pageRoot?.className).not.toContain('bg-[linear-gradient');
  expect(container?.querySelector('[data-ui="editor.canvas.layer"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="editor.floating-workspace"]')?.textContent).toBe(
    'true'
  );
}

async function verifiesFloatingWorkspaceReceivesEmptyDocumentState() {
  createEditorPageServicesMock.mockReturnValue(createServices());
  applyEditorStoreState(createEditorStoreState({ imageData: null }));

  await renderEditorPage();

  expect(container?.querySelector('[data-ui="editor.floating-workspace"]')?.textContent).toBe(
    'false'
  );
}

async function verifiesBootstrapEventRoutingAndDispose() {
  const services = createServices();
  const state = createEditorStoreState();
  createEditorPageServicesMock.mockReturnValue(services);
  applyEditorStoreState(state);

  await renderEditorPage();

  const payload: EditorBootstrapPayload = {
    dataUrl: 'data:image/png;base64,2',
    title: 'Bootstrap title',
    url: 'https://example.com',
  };
  window.dispatchEvent(new CustomEvent(EDITOR_BOOTSTRAP_EVENT, { detail: payload }));
  await Promise.resolve();

  expect(openEditorBootstrapPayloadMock).toHaveBeenCalledWith(
    payload,
    expect.objectContaining({
      isCancelled: expect.any(Function),
      setPageTitle: state.setPageTitle,
    }),
    services
  );

  openEditorBootstrapPayloadMock.mockClear();
  dispatchMalformedEditorBootstrapEvent(EDITOR_BOOTSTRAP_EVENT);
  expect(openEditorBootstrapPayloadMock).not.toHaveBeenCalled();

  act(() => {
    root?.unmount();
  });
  root = null;

  expect(services.autosaveService.dispose).toHaveBeenCalledOnce();
  expect(services.controller.dispose).toHaveBeenCalledOnce();
}

async function verifiesPageRootContextMenuBlocking() {
  createEditorPageServicesMock.mockReturnValue(createServices());
  applyEditorStoreState(createEditorStoreState());

  await renderEditorPage();

  const pageRoot = container?.querySelector<HTMLElement>('[data-ui="editor.page.root"]');
  const canvasZone = container?.querySelector<HTMLElement>(
    '[data-ui="editor.canvas.context-zone"]'
  );
  const canvasSurface = container?.querySelector<HTMLElement>(
    '[data-ui="editor.canvas.surface-hit-area"]'
  );
  const previewZone = container?.querySelector<HTMLElement>(
    '[data-ui="editor.canvas.preview-zone"]'
  );

  const previewEvent = new MouseEvent('contextmenu', {
    bubbles: true,
    button: 2,
    cancelable: true,
  });
  previewZone?.dispatchEvent(previewEvent);

  const pageRootEvent = new MouseEvent('contextmenu', {
    bubbles: true,
    button: 2,
    cancelable: true,
  });
  pageRoot?.dispatchEvent(pageRootEvent);

  const canvasZoneEvent = new MouseEvent('contextmenu', {
    bubbles: true,
    button: 2,
    cancelable: true,
  });
  canvasZone?.dispatchEvent(canvasZoneEvent);

  const canvasSurfaceEvent = new MouseEvent('contextmenu', {
    bubbles: true,
    button: 2,
    cancelable: true,
  });
  canvasSurface?.dispatchEvent(canvasSurfaceEvent);

  expect(previewEvent.defaultPrevented).toBe(true);
  expect(pageRootEvent.defaultPrevented).toBe(true);
  expect(canvasZoneEvent.defaultPrevented).toBe(true);
  expect(canvasSurfaceEvent.defaultPrevented).toBe(false);
}

describe('EditorPage', () => {
  useEditorPageTestScope();

  it(
    'bootstraps the page shell with shared services and renders image-owned UI',
    verifiesImageOwnedPageShell
  );
  it(
    'keeps the floating workspace mounted when the editor has no image data',
    verifiesFloatingWorkspaceReceivesEmptyDocumentState
  );
  it(
    'routes bootstrap events through the extracted runtime opener and disposes services on unmount',
    verifiesBootstrapEventRoutingAndDispose
  );
  it(
    'blocks right-click outside the canonical canvas surface while keeping the real surface available',
    verifiesPageRootContextMenuBlocking
  );
});
