// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import type {
  EditorLayerItem,
  EditorSelectionState,
} from '../../../features/editor/document/types';
import { createDefaultEditorPresetStorageState } from '../../../composition/persistence/editor-presets';

const loadEditorSaveOptionsMock = vi.fn();

vi.mock('../../document/file-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/file-actions')>()),
  loadEditorSaveOptions: () => loadEditorSaveOptionsMock(),
}));

import { useEditorInspectorSidebarLocalState } from './local-state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const DEFAULT_SELECTION_STATE: EditorSelectionState = {
  hasSelection: false,
  selectedObjectHeight: null,
  selectedObjectCount: 0,
  selectedObjectId: null,
  selectedObjectIds: [],
  selectedObjectType: null,
  selectedObjectWidth: null,
};
const DEFAULT_SAVE_OPTIONS = {
  defaultImagePresetId: 'preset-default',
  presets: [{ enabled: true, id: 'preset-default', name: 'Default', order: 0, path: 'out' }],
};
const DEFAULT_LAYERS: EditorLayerItem[] = [];

function flushMicrotasks() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function cleanupDom() {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
}

function setupLocalStateTest() {
  cleanupDom();
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  loadEditorSaveOptionsMock.mockResolvedValue(DEFAULT_SAVE_OPTIONS);
}

function renderHarness(props: {
  canvasHeight?: number;
  canvasWidth?: number;
  frame?: typeof DEFAULT_EDITOR_FRAME_SETTINGS;
  inspector?: string;
  isResizableLayerSelection?: boolean;
  layers?: EditorLayerItem[];
  selection?: EditorSelectionState;
  sourceHeight?: number;
  sourceName?: string | null;
  sourceWidth?: number;
  setInspector?: (inspector: 'tool') => void;
  syncActiveTool?: (tool: 'select') => void;
  workspaceBackgroundColor?: string;
  workspaceDefaultColor?: string;
}) {
  let hookValue: ReturnType<typeof useEditorInspectorSidebarLocalState> | null = null;
  const Harness = () => {
    hookValue = useEditorInspectorSidebarLocalState({
      canvasHeight: props.canvasHeight ?? 720,
      canvasWidth: props.canvasWidth ?? 1280,
      frame: props.frame ?? DEFAULT_EDITOR_FRAME_SETTINGS,
      inspector: props.inspector ?? 'frame',
      sceneBackgroundPresets: createDefaultEditorPresetStorageState().sceneBackground,
      isResizableLayerSelection: props.isResizableLayerSelection ?? false,
      layers: props.layers ?? DEFAULT_LAYERS,
      selection: props.selection ?? DEFAULT_SELECTION_STATE,
      sourceHeight: props.sourceHeight ?? 360,
      sourceName: props.sourceName ?? 'capture',
      sourceWidth: props.sourceWidth ?? 640,
      setInspector: props.setInspector ?? vi.fn(),
      syncActiveTool: props.syncActiveTool ?? vi.fn(),
      workspaceBackgroundColor: props.workspaceBackgroundColor ?? '#111111',
      workspaceDefaultColor: props.workspaceDefaultColor ?? '#222222',
    });
    return null;
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));
  return () => hookValue;
}

async function expectSaveOptionsAndConfirmLifecycle() {
  const getHookValue = renderHarness({});

  await act(async () => {
    await flushMicrotasks();
  });

  const initial = getHookValue();
  expect(initial?.defaultImagePresetId).toBe('preset-default');
  expect(initial?.savePresets).toHaveLength(1);
  expect(initial?.confirmDialog).toBeNull();

  let confirmed = false;
  await act(async () => {
    const request = initial?.requestConfirm({
      cancelText: 'cancel',
      confirmText: 'confirm',
      message: 'message',
      title: 'title',
    });
    initial?.onConfirmDialogConfirm();
    confirmed = await request!;
  });

  expect(confirmed).toBe(true);
  expect(getHookValue()?.confirmDialog).toBeNull();
}

async function expectDraftStateTracking() {
  const getHookValue = renderHarness({
    canvasHeight: 500,
    canvasWidth: 900,
    isResizableLayerSelection: true,
    selection: {
      ...DEFAULT_SELECTION_STATE,
      hasSelection: true,
      selectedObjectCount: 1,
      selectedObjectIds: ['layer-1'],
      selectedObjectHeight: 120,
      selectedObjectWidth: 240,
    },
    sourceHeight: 400,
    sourceWidth: 800,
  });

  await act(async () => {
    await flushMicrotasks();
  });

  expect(getHookValue()?.canvasSizeDraft).toEqual({ height: 500, width: 900 });
  expect(getHookValue()?.imageSizeDraft).toEqual({ height: 400, width: 800 });
  expect(getHookValue()?.layerSizeDraft).toEqual({ height: 120, width: 240 });
  expect(getHookValue()?.layerSizeLocked).toBe(true);
}

async function expectWorkspaceColorState() {
  const getHookValue = renderHarness({});

  await act(async () => {
    await flushMicrotasks();
  });

  expect(getHookValue()?.workspaceColor.matchesDefault).toBe(false);
  expect(getHookValue()?.workspaceColor.pending).toBe(false);

  act(() => {
    getHookValue()?.workspaceColor.setError('save failed');
    getHookValue()?.workspaceColor.setPending(true);
  });

  expect(getHookValue()?.workspaceColor.error).toBe('save failed');
  expect(getHookValue()?.workspaceColor.pending).toBe(true);

  const getMatchingHookValue = renderHarness({
    workspaceBackgroundColor: '#AbCdEf',
    workspaceDefaultColor: '#abcdef',
  });

  await act(async () => {
    await flushMicrotasks();
  });

  expect(getMatchingHookValue()?.workspaceColor.matchesDefault).toBe(true);
}

async function expectLayerEffectsSelectionExit() {
  const syncActiveTool = vi.fn();
  const setInspector = vi.fn();
  const getHookValue = renderHarness({
    inspector: 'layer-effects',
    layers: [
      { id: 'layer-1', name: 'Layer 1' } as EditorLayerItem,
      { id: 'layer-2', name: 'Layer 2' } as EditorLayerItem,
    ],
    selection: {
      ...DEFAULT_SELECTION_STATE,
      hasSelection: true,
      selectedObjectCount: 1,
      selectedObjectId: 'layer-2',
      selectedObjectIds: ['layer-2'],
    },
    setInspector,
    syncActiveTool,
  });

  act(() => {
    getHookValue()?.openLayerEffects('layer-1', 'filters', 'blur');
  });

  await act(async () => {
    await flushMicrotasks();
  });

  expect(syncActiveTool).toHaveBeenCalledWith('select');
  expect(setInspector).toHaveBeenCalledWith('tool');
}

describe('useEditorInspectorSidebarLocalState', () => {
  beforeEach(setupLocalStateTest);

  it('hydrates save options and confirm dialog state through isolated local seams', async () => {
    await expectSaveOptionsAndConfirmLifecycle();
  });

  it('tracks draft state and resets size drafts when viewport inputs change', async () => {
    await expectDraftStateTracking();
  });

  it('tracks workspace default matching and pending save state locally', async () => {
    await expectWorkspaceColorState();
  });

  it('normalizes back to select when layer-effects loses its single-layer selection', async () => {
    await expectLayerEffectsSelectionExit();
  });
});
