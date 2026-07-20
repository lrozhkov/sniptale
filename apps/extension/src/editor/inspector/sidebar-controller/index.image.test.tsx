// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_EDITOR_TOOL_SETTINGS,
  DEFAULT_EDITOR_WORKSPACE_SETTINGS,
} from '../../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';

const mocks = vi.hoisted(() => ({
  actionArgs: null as Record<string, unknown> | null,
  presetHeaderArgs: null as Record<string, unknown> | null,
  setFrameDraft: vi.fn(),
  updateImageSettings: vi.fn(),
  updateSelectionImageSettings: vi.fn(),
}));

vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/controller-context')>()),
  useEditorController: () => ({ canvas: null }),
}));
vi.mock('../../controller/public-actions/selection/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../controller/public-actions/selection/rich-shape')
  >()),
  getSelectedRichShapeDocumentObject: () => null,
}));
vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: Object.assign(
    vi.fn((selector) => selector({ workspaceDefaults: {} })),
    {
      getState: () => ({ workspaceDefaults: { backgroundColor: '#ffffff' } }),
    }
  ),
}));
vi.mock('./store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./store')>()),
  useEditorInspectorStoreSlice: () => ({
    activeTool: 'select',
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    cropReady: false,
    cropSelection: null,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    inspector: 'tool',
    inspectorCollapsed: false,
    layerEffectsCategory: null,
    layers: [],
    selection: { hasSelection: true, selectedObjectCount: 1, selectedObjectType: 'image' },
    selectionToolSettings: DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET),
    setActiveTool: vi.fn(),
    setBrowserFrame: vi.fn(),
    setImageData: vi.fn(),
    setInspector: vi.fn(),
    setLayerEffectsCategory: vi.fn(),
    syncActiveTool: vi.fn(),
    toolSettings: DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET),
    updateArrowSettings: vi.fn(),
    updateBlurSettings: vi.fn(),
    updateBrushSettings: vi.fn(),
    updateImageSettings: mocks.updateImageSettings,
    updateLineSettings: vi.fn(),
    updateSelectionArrowSettings: vi.fn(),
    updateSelectionBlurSettings: vi.fn(),
    updateSelectionBrushSettings: vi.fn(),
    updateSelectionImageSettings: mocks.updateSelectionImageSettings,
    updateSelectionLineSettings: vi.fn(),
    updateSelectionShapeSettings: vi.fn(),
    updateSelectionStepSettings: vi.fn(),
    updateSelectionTextSettings: vi.fn(),
    updateShapeSettings: vi.fn(),
    updateStepSettings: vi.fn(),
    updateTextSettings: vi.fn(),
    updateWorkspace: vi.fn(),
    updateWorkspaceDefaults: vi.fn(),
    viewport: { canvasHeight: 600, canvasWidth: 800, sourceHeight: 600, sourceWidth: 800 },
    workspace: DEFAULT_EDITOR_WORKSPACE_SETTINGS,
  }),
}));
vi.mock('./derived', () => ({
  useEditorInspectorSidebarDerived: () => ({
    highlightedTool: 'select',
    inspectorToolSettings: DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET),
  }),
}));
vi.mock('./local-state', () => ({
  useEditorInspectorSidebarLocalState: () => ({
    backgroundImageInputRef: { current: null },
    defaultImagePresetId: 'preset-default',
    frameDraft: DEFAULT_EDITOR_FRAME_SETTINGS,
    importSessionInputRef: { current: null },
    openImageInputRef: { current: null },
    openLayerEffects: vi.fn(),
    requestConfirm: vi.fn(),
    savePresets: [],
    setFrameDraft: mocks.setFrameDraft,
    setSavePresetPickerOpen: vi.fn(),
    workspaceColor: {
      error: null,
      matchesDefault: false,
      pending: false,
      setError: vi.fn(),
      setPending: vi.fn(),
    },
  }),
}));
vi.mock('./presets', () => ({ useEditorPresetStorageState: () => ({ sceneBackground: {} }) }));
vi.mock('./actions', () => ({
  useEditorInspectorSidebarActions: (args: Record<string, unknown>) => {
    mocks.actionArgs = args;
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
  },
}));
vi.mock('./preset-headers', () => ({
  useEditorInspectorPresetHeaders: (args: Record<string, unknown>) => {
    mocks.presetHeaderArgs = args;
    return { scenePresetHeader: null, toolPresetHeader: null };
  },
}));
vi.mock('./builders', () => ({
  createEditorInspectorControllerActions: () => ({}),
  mergeEditorInspectorDerivedState: () => ({}),
  selectEditorInspectorSidebarDerivedInput: () => ({}),
  createCloseDocumentHandler: () => vi.fn(),
  createRichShapeActionHandlers: () => ({
    applyRichShapePatch: vi.fn(),
    arrangeSelection: vi.fn(),
  }),
}));
vi.mock('./result', () => ({
  buildEditorInspectorSidebarControllerResult: () => ({ inspector: 'tool' }),
  createEditorInspectorSidebarControllerStoreResult: () => ({}),
}));
vi.mock('../compact/commands', () => ({ buildEditorInspectorCompactCommandGroups: () => [] }));
vi.mock('../compact/params', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../compact/params')>()),
  createEditorInspectorCompactCommandGroupsParams: () => ({}),
}));

import { useEditorInspectorSidebarController } from './';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  vi.clearAllMocks();
});

it('threads image setting updaters and normalizes source image preset header patches', () => {
  const Harness: React.FC = () => {
    useEditorInspectorSidebarController(true);
    return null;
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => root?.render(<Harness />));
  const setFrameSettings = mocks.presetHeaderArgs?.['setFrameSettings'];
  if (typeof setFrameSettings !== 'function') {
    throw new TypeError('Expected preset header frame settings handler.');
  }
  setFrameSettings({
    sourceImage: { opacity: 0.4 },
  });
  setFrameSettings({});

  expect(mocks.actionArgs?.['updateImageSettings']).toBe(mocks.updateImageSettings);
  expect(mocks.actionArgs?.['updateSelectionImageSettings']).toBe(
    mocks.updateSelectionImageSettings
  );
  expect(mocks.setFrameDraft.mock.calls[0]?.[0](DEFAULT_EDITOR_FRAME_SETTINGS).sourceImage).toEqual(
    expect.objectContaining({ opacity: 0.4, strokeStyle: 'solid' })
  );
  expect(mocks.setFrameDraft.mock.calls[1]?.[0](DEFAULT_EDITOR_FRAME_SETTINGS).sourceImage).toEqual(
    DEFAULT_EDITOR_FRAME_SETTINGS.sourceImage
  );
});
