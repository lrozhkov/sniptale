/* eslint-disable max-lines-per-function -- hook orchestration coverage keeps the seam proof together */
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildCompactCommandGroups: vi.fn(() => [{ id: 'compact-group' }]),
  buildCompactParams: vi.fn(() => ({ id: 'compact-params' })),
  actionGroups: vi.fn(() => ({ document: {}, layerEffects: {}, sidebar: {} })),
  mergeEditorInspectorDerivedState: vi.fn(() => ({ id: 'derived-props' })),
  buildDerivedParams: vi.fn(() => ({ id: 'derived-params' })),
  buildResult: vi.fn(() => ({ id: 'controller-result' })),
  createStoreResult: vi.fn(() => ({ id: 'store-result' })),
  closeHandler: vi.fn(() => 'close-handler'),
  controllerHook: vi.fn(() => ({ id: 'editor-controller' })),
  derivedHook: vi.fn(() => ({
    highlightedTool: 'rectangle',
    inspectorToolSettings: {
      rectangle: { id: 'rectangle-shape-settings' },
      ellipse: { id: 'ellipse-shape-settings' },
      text: { id: 'text-settings' },
    },
    isResizableLayerSelection: true,
  })),
  localStateHook: vi.fn(() => ({
    backgroundImageInputRef: { current: null },
    defaultImagePresetId: 'preset-1',
    frameDraft: { id: 'frame-draft' },
    importSessionInputRef: { current: null },
    openImageInputRef: { current: null },
    openLayerEffects: vi.fn(),
    requestConfirm: vi.fn(),
    savePresets: [],
    setSavePresetPickerOpen: vi.fn(),
    workspaceColor: {
      error: null,
      matchesDefault: false,
      pending: false,
      setError: vi.fn(),
      setPending: vi.fn(),
    },
  })),
  sidebarActionsHook: vi.fn(() => ({
    applyLinePresetSettings: vi.fn(),
    id: 'sidebar-actions',
  })),
  presetHeadersHook: vi.fn(() => ({
    scenePresetHeader: { id: 'scene-header' },
    toolPresetHeader: { id: 'tool-header' },
  })),
  useEditorStoreHook: vi.fn(
    (selector: (state: { workspaceDefaults: { backgroundColor: string } }) => unknown) =>
      selector({ workspaceDefaults: { backgroundColor: '#ffffff' } })
  ),
  storeHook: vi.fn(() => ({
    activeTool: 'select',
    browserFrame: { id: 'browser' },
    cropReady: false,
    frame: { id: 'frame' },
    inspector: 'tool',
    inspectorCollapsed: true,
    layers: [],
    selection: {
      hasSelection: false,
      selectedObjectCount: 0,
      selectedObjectHeight: null,
      selectedObjectId: null,
      selectedObjectIds: [],
      selectedObjectType: null,
      selectedObjectWidth: null,
    },
    selectionToolSettings: { id: 'selection-settings' },
    syncActiveTool: vi.fn(),
    setImageData: vi.fn(),
    setInspector: vi.fn(),
    setLayerEffectsCategory: vi.fn(),
    toolSettings: { id: 'tool-settings' },
    updateWorkspace: vi.fn(),
    viewport: {
      canvasHeight: 600,
      canvasWidth: 800,
      sourceHeight: 300,
      sourceName: 'capture.png',
      sourceWidth: 400,
    },
    workspace: { id: 'workspace' },
  })),
}));

vi.mock('../../application/controller-context', () => ({
  EditorControllerProvider: ({ children }: { children: unknown }) => children,
  useEditorController: mocks.controllerHook,
  useOptionalEditorController: mocks.controllerHook,
}));

vi.mock('../../state/useEditorStore', () => ({
  EditorInspector: {},
  EditorState: {},
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

vi.mock('./builders', () => ({
  createEditorInspectorControllerActions: mocks.actionGroups,
  mergeEditorInspectorDerivedState: mocks.mergeEditorInspectorDerivedState,
  selectEditorInspectorSidebarDerivedInput: mocks.buildDerivedParams,
  createRichShapeActionHandlers: vi.fn(() => ({
    applyRichShapePatch: vi.fn(),
    arrangeSelection: vi.fn(),
  })),
  createCloseDocumentHandler: mocks.closeHandler,
}));

vi.mock('./result', () => ({
  buildEditorInspectorSidebarControllerResult: mocks.buildResult,
  createEditorInspectorSidebarControllerStoreResult: mocks.createStoreResult,
}));

vi.mock('./store', () => ({
  EditorInspectorStoreSlice: {},
  useEditorInspectorStoreSlice: mocks.storeHook,
}));

vi.mock('./actions', () => ({
  useEditorInspectorSidebarActions: mocks.sidebarActionsHook,
}));

vi.mock('./derived', () => ({
  useEditorInspectorSidebarDerived: mocks.derivedHook,
}));

vi.mock('./local-state', () => ({
  useEditorInspectorSidebarLocalState: mocks.localStateHook,
}));

vi.mock('./preset-headers', () => ({
  useEditorInspectorPresetHeaders: mocks.presetHeadersHook,
}));

import { useEditorInspectorSidebarController } from './';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const INSPECTOR_TOOL_SETTINGS = {
  ellipse: { id: 'ellipse-shape-settings' },
  rectangle: { id: 'rectangle-shape-settings' },
  text: { id: 'text-settings' },
};

function renderHook(hasImage: boolean) {
  let value: ReturnType<typeof useEditorInspectorSidebarController> | null = null;

  const Harness = () => {
    value = useEditorInspectorSidebarController(hasImage);
    return null;
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));

  return () => value;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

it('builds the sidebar controller result and compact command groups from the orchestrated seams', () => {
  const getValue = renderHook(true);

  expect(mocks.sidebarActionsHook).toHaveBeenCalledWith(
    expect.objectContaining({
      shapeSettings: { id: 'rectangle-shape-settings' },
      shapeTool: 'rectangle',
      textSettings: { id: 'text-settings' },
      setWorkspaceDefaultSavePending: expect.any(Function),
      workspaceDefaultColor: '#ffffff',
    }),
    true
  );
  expect(mocks.presetHeadersHook).toHaveBeenCalledWith(
    expect.objectContaining({
      activeTool: 'rectangle',
      applyBlurPresetSettings: expect.any(Function),
      applyArrowPresetSettings: expect.any(Function),
      applyBrushPresetSettings: expect.any(Function),
      applyShapePresetSettings: expect.any(Function),
      applyStepPresetSettings: expect.any(Function),
      applyTextPresetSettings: expect.any(Function),
      frameDraft: { id: 'frame-draft' },
      toolSettings: {
        ellipse: { id: 'ellipse-shape-settings' },
        rectangle: { id: 'rectangle-shape-settings' },
        text: { id: 'text-settings' },
      },
    })
  );
  mocks.presetHeadersHook.mock.calls[0]?.[0]?.applyLinePresetSettings({ id: 'line-settings' });
  expect(mocks.actionGroups).toHaveBeenCalledWith(
    expect.objectContaining({
      actions: expect.objectContaining({ id: 'sidebar-actions' }),
      backgroundImageInputRef: { current: null },
      controller: { id: 'editor-controller' },
      frameDraft: { id: 'frame-draft' },
      importSessionInputRef: { current: null },
      openImageInputRef: { current: null },
      openLayerEffects: expect.any(Function),
      syncActiveTool: expect.any(Function),
      setImageData: expect.any(Function),
      setInspector: expect.any(Function),
    })
  );
  expect(mocks.buildCompactParams).toHaveBeenCalledWith(
    expect.objectContaining({ hasImage: true, onCloseDocument: 'close-handler' })
  );
  const collapsedStoreMatcher = expect.objectContaining({ inspectorCollapsed: true });
  expect(mocks.createStoreResult).toHaveBeenCalledWith(collapsedStoreMatcher);
  expect(mocks.buildCompactCommandGroups).toHaveBeenCalledWith({
    controller: { id: 'editor-controller' },
    id: 'compact-params',
  });
  expect(getValue()).toEqual({
    compactCommandGroups: [{ id: 'compact-group' }],
    id: 'controller-result',
    onCloseDocument: 'close-handler',
  });
});

it('resolves the highlighted shape owner for ellipse and diamond tools', () => {
  mocks.derivedHook.mockImplementation(() => ({
    highlightedTool: 'ellipse',
    inspectorToolSettings: INSPECTOR_TOOL_SETTINGS,
    isResizableLayerSelection: true,
  }));
  renderHook(false);

  expect(mocks.sidebarActionsHook).toHaveBeenLastCalledWith(
    expect.objectContaining({
      shapeSettings: { id: 'ellipse-shape-settings' },
      shapeTool: 'ellipse',
    }),
    false
  );

  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;

  mocks.derivedHook.mockImplementation(() => ({
    highlightedTool: 'diamond',
    inspectorToolSettings: INSPECTOR_TOOL_SETTINGS,
    isResizableLayerSelection: true,
  }));
  renderHook(false);

  expect(mocks.sidebarActionsHook).toHaveBeenLastCalledWith(
    expect.objectContaining({
      shapeSettings: { id: 'rectangle-shape-settings' },
      shapeTool: 'diamond',
    }),
    false
  );
});

it('falls back to the rectangle owner for non-shape highlighted tools', () => {
  mocks.derivedHook.mockImplementation(() => ({
    highlightedTool: 'select',
    inspectorToolSettings: INSPECTOR_TOOL_SETTINGS,
    isResizableLayerSelection: false,
  }));
  renderHook(false);

  expect(mocks.sidebarActionsHook).toHaveBeenLastCalledWith(
    expect.objectContaining({
      shapeSettings: { id: 'rectangle-shape-settings' },
      shapeTool: 'rectangle',
    }),
    false
  );
});
