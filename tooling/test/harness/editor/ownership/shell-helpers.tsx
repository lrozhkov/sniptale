// @vitest-environment jsdom

import { afterEach, beforeEach, expect, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_EDITOR_TOOL_SETTINGS,
  DEFAULT_EDITOR_WORKSPACE_SETTINGS,
} from '../../../../../apps/extension/src/features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../../../apps/extension/src/composition/persistence/highlighter';
import { useEditorStore } from '../../../../../apps/extension/src/editor/state/useEditorStore';
import {
  cleanupEditorOwnershipDom,
  createEditorOwnershipControllerMockBase,
  createEditorOwnershipSelection,
  createEditorOwnershipViewport,
  renderWithController as renderEditorOwnershipWithController,
  setEditorOwnershipInputFiles,
} from './base';

const editorShellOwnershipMocks = vi.hoisted(() => ({
  importEditorSessionFromFileMock: vi.fn(),
  insertEditorImageFromFileMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  openEditorImageFromFileMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  startEditorViewportPreviewLoopMock: vi.fn(() => () => undefined),
}));

export function getEditorShellOwnershipMocks() {
  return editorShellOwnershipMocks;
}

vi.mock('../../../../../apps/extension/src/editor/document/file-actions', () => ({
  importEditorSessionFromFile: editorShellOwnershipMocks.importEditorSessionFromFileMock,
  insertEditorImageFromFile: editorShellOwnershipMocks.insertEditorImageFromFileMock,
  openEditorImageFromFile: editorShellOwnershipMocks.openEditorImageFromFileMock,
}));

vi.mock('../../../../../apps/extension/src/platform/runtime-messaging/index', () => ({
  sendRuntimeMessage: editorShellOwnershipMocks.sendRuntimeMessageMock,
}));

vi.mock(
  '../../../../../apps/extension/src/composition/persistence/settings',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../apps/extension/src/composition/persistence/settings')
    >()),
    loadSettings: editorShellOwnershipMocks.loadSettingsMock,
  })
);

vi.mock('../../../../../apps/extension/src/editor/workspace/viewport-preview/drawing', () => ({
  startEditorViewportPreviewLoop: editorShellOwnershipMocks.startEditorViewportPreviewLoopMock,
}));

type EditorStoreState = ReturnType<typeof useEditorStore.getState>;

export function createControllerMock() {
  return {
    ...createEditorOwnershipControllerMockBase(),
    dispose: vi.fn(),
    exportDocument: vi.fn(() => ({
      sourceImageData: 'data:image/png;base64,exported',
      version: 1,
    })),
    insertImage: vi.fn(async () => undefined),
    insertTechnicalData: vi.fn(),
    loadDocument: vi.fn(async () => undefined),
    mount: vi.fn(),
    navigateViewportTo: vi.fn(),
    openImage: vi.fn(async () => undefined),
    redo: vi.fn(async () => undefined),
    renderToDataUrl: vi.fn(() => 'data:image/png;base64,rendered'),
    resetToOriginal: vi.fn(async () => undefined),
    undo: vi.fn(async () => undefined),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomToFit: vi.fn(),
    resetZoom: vi.fn(),
    bringSelectionToFront: vi.fn(),
  };
}

export function resetEditorStore(overrides: Partial<EditorStoreState> = {}) {
  const toolSettings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET);

  useEditorStore.setState({
    activeTool: 'select',
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    cropReady: true,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    history: {
      canRedo: true,
      canUndo: true,
      index: 1,
      size: 2,
    },
    imageData: 'data:image/png;base64,source',
    inspector: 'tool',
    inspectorCollapsed: false,
    layers: [
      {
        effectCount: 0,
        effects: [],
        id: 'layer-1',
        immutable: false,
        locked: false,
        name: 'Layer 1',
        previewColor: '#ff5500',
        previewDataUrl: null,
        previewTransparent: false,
        raster: false,
        selectedCount: 1,
        selected: true,
        type: 'rectangle',
        typeLabel: 'Rectangle',
        visible: true,
      },
    ] satisfies EditorStoreState['layers'],
    pageTitle: '',
    saveState: 'idle',
    selection: createEditorOwnershipSelection(),
    selectionToolSettings: toolSettings,
    sessionId: null,
    toolSettings,
    viewport: createEditorOwnershipViewport(),
    viewportPreviewOpen: true,
    workspace: DEFAULT_EDITOR_WORKSPACE_SETTINGS,
    ...overrides,
  });
}

function setupGlobals() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        getManifest: () => ({ version: '0.0.0-test' }),
      },
    },
  });
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
}

export function renderWithController(node: React.ReactNode, controller: object) {
  renderEditorOwnershipWithController(node, controller);
}

export const cleanupDom = cleanupEditorOwnershipDom;

export function queryButtonByTitle(title: string, index = 0): HTMLButtonElement {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(`button[title="${title}"]`)
  );
  const button = buttons[index];
  expect(button).toBeDefined();
  if (!button) {
    throw new Error(`Expected button with title "${title}" at index ${index}`);
  }
  return button;
}

export function setInputFiles(input: HTMLInputElement, files: File[]) {
  setEditorOwnershipInputFiles(input, files);
}

beforeEach(() => {
  setupGlobals();
  editorShellOwnershipMocks.loadSettingsMock.mockResolvedValue({
    defaultImagePresetId: 'preset-default',
    imageFormat: 'png',
    imageQuality: 0.92,
    presets: [],
  });
  editorShellOwnershipMocks.sendRuntimeMessageMock.mockResolvedValue({ success: true });
  resetEditorStore();
});

afterEach(() => {
  cleanupDom();
  window.localStorage.clear();
  Reflect.deleteProperty(globalThis, 'chrome');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
