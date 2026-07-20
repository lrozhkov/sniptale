// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

type PresetHeaderArgs = {
  applyArrowPresetSettings: (settings: unknown) => void;
  applyBlurPresetSettings: (settings: unknown) => void;
  applyBrushPresetSettings: (tool: string, settings: unknown) => void;
  applyLinePresetSettings: (settings: unknown) => void;
  applyShapePresetSettings: (owner: string, settings: unknown) => void;
  applyStepPresetSettings: (settings: unknown) => void;
  applyTextPresetSettings: (settings: unknown) => void;
  setFrameSettings: (settings: Record<string, unknown>) => void;
};

function createActionsMock() {
  return {
    applyArrowPresetSettings: vi.fn(),
    applyBlurPresetSettings: vi.fn(),
    applyBrushPresetSettings: vi.fn(),
    applyLinePresetSettings: vi.fn(),
    applyShapePresetSettings: vi.fn(),
    applyStepPresetSettings: vi.fn(),
    applyTextPresetSettings: vi.fn(),
    borderPresets: [],
    defaultBorderPresetId: null,
  };
}

function createDerivedHookMock() {
  return vi.fn(() => ({
    highlightedTool: 'line',
    inspectorToolSettings: {
      ellipse: {},
      rectangle: {},
      text: {},
    },
    isResizableLayerSelection: false,
  }));
}

function createLocalStateHookMock(setFrameDraftMock: ReturnType<typeof vi.fn>) {
  return vi.fn(() => ({
    backgroundImageInputRef: { current: null },
    defaultImagePresetId: null,
    frameDraft: { backgroundColor: '#ffffff' },
    importSessionInputRef: { current: null },
    openImageInputRef: { current: null },
    openLayerEffects: vi.fn(),
    requestConfirm: vi.fn(),
    savePresets: [],
    setFrameDraft: setFrameDraftMock,
    setSavePresetPickerOpen: vi.fn(),
    workspaceColor: {
      error: null,
      matchesDefault: false,
      pending: false,
      setError: vi.fn(),
      setPending: vi.fn(),
    },
  }));
}

function createStoreHookMock() {
  return vi.fn(() => ({
    activeTool: 'select',
    browserFrame: null,
    cropReady: false,
    cropSelection: null,
    frame: {},
    inspector: 'tool',
    layers: [],
    selection: {},
    selectionToolSettings: {},
    setImageData: vi.fn(),
    setInspector: vi.fn(),
    setLayerEffectsCategory: vi.fn(),
    syncActiveTool: vi.fn(),
    toolSettings: {},
    viewport: { canvasHeight: 1, canvasWidth: 1, sourceHeight: 1, sourceWidth: 1 },
    workspace: {},
  }));
}

function createPresetArgsMocks() {
  const actions = createActionsMock();
  const setFrameDraftMock = vi.fn((updater: (state: Record<string, unknown>) => unknown) =>
    updater({ backgroundColor: '#ffffff' })
  );
  return {
    actions,
    buildCompactCommandGroups: vi.fn(() => []),
    buildCompactParams: vi.fn(() => ({})),
    createEditorInspectorControllerActions: vi.fn(() => ({})),
    mergeEditorInspectorDerivedState: vi.fn(() => ({})),
    buildDerivedParams: vi.fn(() => ({})),
    buildResult: vi.fn(() => ({})),
    closeHandler: vi.fn(() => vi.fn()),
    controllerHook: vi.fn(() => ({ canvas: { getActiveObjects: vi.fn(() => []) } })),
    derivedHook: createDerivedHookMock(),
    localStateHook: createLocalStateHookMock(setFrameDraftMock),
    presetHeadersHook: vi.fn((_args: PresetHeaderArgs) => ({})),
    sidebarActionsHook: vi.fn(() => actions),
    setFrameDraftMock,
    storeHook: createStoreHookMock(),
    useEditorStoreHook: vi.fn(
      (selector: (state: { workspaceDefaults: { backgroundColor: string } }) => unknown) =>
        selector({ workspaceDefaults: { backgroundColor: '#ffffff' } })
    ),
  };
}

const mocks = vi.hoisted(createPresetArgsMocks);

vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/controller-context')>()),
  useEditorController: mocks.controllerHook,
}));
vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: Object.assign(mocks.useEditorStoreHook, {
    getState: () => ({ workspaceDefaults: { backgroundColor: '#ffffff' } }),
  }),
}));
vi.mock('../compact/commands', () => ({
  buildEditorInspectorCompactCommandGroups: mocks.buildCompactCommandGroups,
}));
vi.mock('../compact/params', () => ({
  createEditorInspectorCompactCommandGroupsParams: mocks.buildCompactParams,
  flattenEditorInspectorCompactCommandGroupsParams: vi.fn(),
}));
vi.mock('./builders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./builders')>()),
  createEditorInspectorControllerActions: mocks.createEditorInspectorControllerActions,
  mergeEditorInspectorDerivedState: mocks.mergeEditorInspectorDerivedState,
  selectEditorInspectorSidebarDerivedInput: mocks.buildDerivedParams,
  createCloseDocumentHandler: mocks.closeHandler,
}));
vi.mock('./result', () => ({
  buildEditorInspectorSidebarControllerResult: mocks.buildResult,
  createEditorInspectorSidebarControllerStoreResult: vi.fn(() => ({})),
}));
vi.mock('./store', () => ({
  EditorInspectorStoreSlice: {},
  useEditorInspectorStoreSlice: mocks.storeHook,
}));
vi.mock('./actions', () => ({ useEditorInspectorSidebarActions: mocks.sidebarActionsHook }));
vi.mock('./derived', () => ({ useEditorInspectorSidebarDerived: mocks.derivedHook }));
vi.mock('./local-state', () => ({ useEditorInspectorSidebarLocalState: mocks.localStateHook }));
vi.mock('./preset-headers', () => ({ useEditorInspectorPresetHeaders: mocks.presetHeadersHook }));

import { resolveSidebarShapeTool, useEditorInspectorSidebarController } from './';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.clearAllMocks();
});

it('wires every preset header callback to sidebar actions', () => {
  const Harness = () => {
    useEditorInspectorSidebarController(true);
    return null;
  };
  container = document.createElement('div');
  root = createRoot(container);
  act(() => root?.render(<Harness />));
  const args = mocks.presetHeadersHook.mock.calls[0]![0];

  args.applyBlurPresetSettings({ id: 'blur' });
  args.applyArrowPresetSettings({ id: 'arrow' });
  args.applyLinePresetSettings({ id: 'line' });
  args.applyBrushPresetSettings('pencil', { id: 'brush' });
  args.applyShapePresetSettings('rectangle', { id: 'shape' });
  args.applyStepPresetSettings({ id: 'step' });
  args.applyTextPresetSettings({ id: 'text' });
  args.setFrameSettings({ backgroundColor: '#abcdef' });

  expect(mocks.actions.applyBlurPresetSettings).toHaveBeenCalledWith({ id: 'blur' });
  expect(mocks.actions.applyArrowPresetSettings).toHaveBeenCalledWith({ id: 'arrow' });
  expect(mocks.actions.applyLinePresetSettings).toHaveBeenCalledWith({ id: 'line' });
  expect(mocks.actions.applyBrushPresetSettings).toHaveBeenCalledWith('pencil', { id: 'brush' });
  expect(mocks.actions.applyShapePresetSettings).toHaveBeenCalledWith('rectangle', { id: 'shape' });
  expect(mocks.actions.applyStepPresetSettings).toHaveBeenCalledWith({ id: 'step' });
  expect(mocks.actions.applyTextPresetSettings).toHaveBeenCalledWith({ id: 'text' });
  expect(mocks.setFrameDraftMock).toHaveBeenCalled();
});

it('resolves sidebar shape tools without routing diamonds into rectangle UI state', () => {
  expect(resolveSidebarShapeTool('ellipse')).toBe('ellipse');
  expect(resolveSidebarShapeTool('diamond')).toBe('diamond');
  expect(resolveSidebarShapeTool('select')).toBe('rectangle');
});
