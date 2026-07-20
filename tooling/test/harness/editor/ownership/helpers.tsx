import { afterEach, beforeEach, vi } from 'vitest';
import {
  cleanupEditorOwnershipDom,
  createEditorOwnershipControllerMockBase,
  createEditorOwnershipSelection,
  createEditorOwnershipViewport,
  flushEditorOwnershipAsyncWork,
  renderWithController as renderEditorOwnershipWithController,
  renderWithControllerAsync as renderEditorOwnershipWithControllerAsync,
  rerenderWithControllerAsync as rerenderEditorOwnershipWithControllerAsync,
  setEditorOwnershipInputFiles,
} from './base';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_EDITOR_TOOL_SETTINGS,
  DEFAULT_EDITOR_WORKSPACE_SETTINGS,
} from '../../../../../apps/extension/src/features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../../../apps/extension/src/composition/persistence/highlighter';
import { useEditorStore } from '../../../../../apps/extension/src/editor/state/useEditorStore';

const editorInspectorOwnershipMocks = vi.hoisted(() => ({
  addBorderPresetMock: vi.fn(async () => undefined),
  importEditorSessionFromFileMock: vi.fn(),
  loadEditorSaveOptionsMock: vi.fn(),
  loadHighlighterSettingsMock: vi.fn(),
  openEditorImageFromFileMock: vi.fn(),
  patchEditorWorkspaceDefaultsMock: vi.fn(),
  saveEditorRenderedImageMock: vi.fn(async () => undefined),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

export function getEditorInspectorOwnershipMocks() {
  return editorInspectorOwnershipMocks;
}
vi.mock('../../../../../apps/extension/src/editor/document/file-actions', () => ({
  importEditorSessionFromFile: editorInspectorOwnershipMocks.importEditorSessionFromFileMock,
  loadEditorSaveOptions: editorInspectorOwnershipMocks.loadEditorSaveOptionsMock,
  openEditorImageFromFile: editorInspectorOwnershipMocks.openEditorImageFromFileMock,
  saveEditorRenderedImage: editorInspectorOwnershipMocks.saveEditorRenderedImageMock,
}));

vi.mock(
  '../../../../../apps/extension/src/composition/persistence/highlighter',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../apps/extension/src/composition/persistence/highlighter')
    >()),
    addBorderPreset: editorInspectorOwnershipMocks.addBorderPresetMock,
    loadHighlighterSettings: editorInspectorOwnershipMocks.loadHighlighterSettingsMock,
  })
);

vi.mock(
  '../../../../../apps/extension/src/editor/persistence/workspace',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../apps/extension/src/editor/persistence/workspace')
    >()),
    patchEditorWorkspaceDefaults: editorInspectorOwnershipMocks.patchEditorWorkspaceDefaultsMock,
  })
);

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),

  toast: {
    error: editorInspectorOwnershipMocks.toastErrorMock,
    success: editorInspectorOwnershipMocks.toastSuccessMock,
  },
}));

type EditorStoreState = ReturnType<typeof useEditorStore.getState>;

export function createControllerMock() {
  return {
    ...createEditorOwnershipControllerMockBase(),
    closeDocument: vi.fn(),
    insertTechnicalData: vi.fn(),
    bringSelectionToFront: vi.fn(),
    sendSelectionToBack: vi.fn(),
  };
}

function createEditorInspectorLayers(): EditorStoreState['layers'] {
  return [
    {
      effectCount: 0,
      effects: [],
      id: 'source-image',
      immutable: true,
      locked: false,
      name: 'Source',
      previewColor: null,
      previewDataUrl: null,
      previewTransparent: true,
      raster: true,
      selectedCount: 1,
      selected: false,
      type: 'image',
      typeLabel: 'Image',
      visible: true,
    },
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
  ];
}

export function resetEditorStore(overrides: Partial<EditorStoreState> = {}) {
  const toolSettings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET);

  useEditorStore.setState({
    activeTool: 'crop',
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
    layerEffectsCategory: 'adjustments',
    layers: createEditorInspectorLayers(),
    pageTitle: '',
    saveState: 'idle',
    selection: createEditorOwnershipSelection(),
    selectionToolSettings: toolSettings,
    sessionId: null,
    toolSettings,
    viewport: createEditorOwnershipViewport(),
    viewportPreviewOpen: false,
    workspace: DEFAULT_EDITOR_WORKSPACE_SETTINGS,
    ...overrides,
  });
}

function setupGlobals() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const createStorageArea = () => ({
    get: vi.fn((keys: unknown, callback: (value: Record<string, unknown>) => void) => {
      if (Array.isArray(keys)) {
        const values = Object.fromEntries(keys.map((key) => [key, undefined])) as Record<
          string,
          unknown
        >;
        callback(values);
        return;
      }

      if (keys && typeof keys === 'object') {
        callback(keys as Record<string, unknown>);
        return;
      }

      callback({});
    }),
    remove: vi.fn((_: unknown, callback: () => void) => callback()),
    set: vi.fn((_: unknown, callback: () => void) => callback()),
  });

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        getManifest: () => ({ version: '0.0.0-test' }),
      },
      storage: {
        local: createStorageArea(),
        session: createStorageArea(),
        sync: createStorageArea(),
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
}

export function renderWithController(node: React.ReactNode, controller: object) {
  renderEditorOwnershipWithController(node, controller);
}

export async function renderWithControllerAsync(node: React.ReactNode, controller: object) {
  await renderEditorOwnershipWithControllerAsync(node, controller);
}

export async function rerenderWithControllerAsync(node: React.ReactNode, controller: object) {
  await rerenderEditorOwnershipWithControllerAsync(node, controller);
}

export const cleanupDom = cleanupEditorOwnershipDom;
export const setInputFiles = setEditorOwnershipInputFiles;
export const flushAsyncWork = flushEditorOwnershipAsyncWork;

beforeEach(() => {
  setupGlobals();
  editorInspectorOwnershipMocks.loadEditorSaveOptionsMock.mockResolvedValue({
    defaultImagePresetId: 'preset-default',
    presets: [{ enabled: true, id: 'preset-default', name: 'Team', order: 0, path: 'team' }],
  });
  editorInspectorOwnershipMocks.loadHighlighterSettingsMock.mockResolvedValue({
    borderPresets: [DEFAULT_BORDER_PRESET],
    defaultBorderPresetId: DEFAULT_BORDER_PRESET.id,
  });
  editorInspectorOwnershipMocks.patchEditorWorkspaceDefaultsMock.mockResolvedValue({
    backgroundColor: DEFAULT_EDITOR_WORKSPACE_SETTINGS.backgroundColor,
  });
  resetEditorStore();
});

afterEach(() => {
  cleanupDom();
  Reflect.deleteProperty(globalThis, 'chrome');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
