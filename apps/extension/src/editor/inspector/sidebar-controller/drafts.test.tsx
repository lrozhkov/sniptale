// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import type { EditorSelectionState } from '../../../features/editor/document/types';
import { createDefaultEditorPresetStorageState } from '../../../composition/persistence/editor-presets';
import { useInspectorSidebarDraftState } from './drafts';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const DEFAULT_SELECTION: EditorSelectionState = {
  hasSelection: false,
  selectedObjectHeight: null,
  selectedObjectCount: 0,
  selectedObjectId: null,
  selectedObjectIds: [],
  selectedObjectType: null,
  selectedObjectWidth: null,
};

function createCleanOpenFrame() {
  return {
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    backgroundColor: 'transparent',
    backgroundImageData: null,
    backgroundMode: 'color' as const,
    layoutMode: 'fit-image' as const,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
  };
}

function createHydratedSceneBackgroundPresets() {
  const sceneBackgroundPresets = createDefaultEditorPresetStorageState().sceneBackground;
  sceneBackgroundPresets.defaultPresetId = 'loaded-default';
  sceneBackgroundPresets.presets = [
    ...sceneBackgroundPresets.presets,
    {
      enabled: true,
      id: 'loaded-default',
      isSystemDefault: false,
      name: 'Loaded default',
      order: 1,
      settings: {
        ...sceneBackgroundPresets.presets[0]!.settings,
        backgroundColor: '#102030',
        backgroundGradientAngle: 32,
        backgroundGradientFrom: '#203040',
        backgroundGradientTo: '#405060',
        backgroundMode: 'gradient',
        layoutMode: 'fit-image',
        paddingTop: 24,
        paddingRight: 16,
        paddingBottom: 12,
        paddingLeft: 8,
      },
    },
  ];

  return sceneBackgroundPresets;
}

function renderHook(args: Parameters<typeof useInspectorSidebarDraftState>[0]) {
  let hookValue: ReturnType<typeof useInspectorSidebarDraftState> | null = null;
  let state = args;

  const Harness = () => {
    hookValue = useInspectorSidebarDraftState(state);
    return null;
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));

  return {
    getValue: () => hookValue,
    rerender: (nextArgs: Parameters<typeof useInspectorSidebarDraftState>[0]) => {
      state = nextArgs;
      act(() => root?.render(<Harness />));
    },
  };
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('keeps frame drafts aligned with authoritative defaults without suggested padding bootstrap', () => {
  const hook = renderHook({
    canvasHeight: 720,
    canvasWidth: 1280,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    inspector: 'frame',
    sceneBackgroundPresets: createDefaultEditorPresetStorageState().sceneBackground,
    isResizableLayerSelection: false,
    selection: DEFAULT_SELECTION,
    sourceHeight: 400,
    sourceName: 'capture',
    sourceWidth: 800,
  });

  expect(hook.getValue()?.frameDraft).toEqual(DEFAULT_EDITOR_FRAME_SETTINGS);
  expect(hook.getValue()?.frameDraft.paddingTop).toBe(128);
});

it('seeds the scene draft from the default preset instead of the opened document frame', () => {
  const cleanOpenFrame = createCleanOpenFrame();
  const sceneBackgroundPresets = createDefaultEditorPresetStorageState().sceneBackground;
  const hook = renderHook({
    canvasHeight: 400,
    canvasWidth: 800,
    frame: cleanOpenFrame,
    inspector: 'frame',
    sceneBackgroundPresets,
    isResizableLayerSelection: false,
    selection: DEFAULT_SELECTION,
    sourceHeight: 400,
    sourceName: 'capture',
    sourceWidth: 800,
  });

  expect(hook.getValue()?.frameDraft.paddingTop).toBe(128);
  expect(hook.getValue()?.frameDraft.layoutMode).toBe('expand-canvas');
  expect(hook.getValue()?.frameDraft.backgroundMode).toBe('gradient');
});

it('hydrates the scene draft from an asynchronously loaded default preset without leaving it dirty', () => {
  const cleanOpenFrame = createCleanOpenFrame();
  const initialPresets = createDefaultEditorPresetStorageState().sceneBackground;
  const hydratedPresets = createHydratedSceneBackgroundPresets();
  const hook = renderHook({
    canvasHeight: 400,
    canvasWidth: 800,
    frame: cleanOpenFrame,
    inspector: 'frame',
    sceneBackgroundPresets: initialPresets,
    isResizableLayerSelection: false,
    selection: DEFAULT_SELECTION,
    sourceHeight: 400,
    sourceName: 'capture',
    sourceWidth: 800,
  });

  hook.rerender({
    canvasHeight: 400,
    canvasWidth: 800,
    frame: cleanOpenFrame,
    inspector: 'frame',
    sceneBackgroundPresets: hydratedPresets,
    isResizableLayerSelection: false,
    selection: DEFAULT_SELECTION,
    sourceHeight: 400,
    sourceName: 'capture',
    sourceWidth: 800,
  });

  expect(hook.getValue()?.frameDraft).toMatchObject(hydratedPresets.presets[1]!.settings);
});

it('syncs canvas size draft from an active crop selection', () => {
  const hook = renderHook({
    canvasHeight: 720,
    canvasWidth: 1280,
    cropSelection: null,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    inspector: 'tool',
    sceneBackgroundPresets: createDefaultEditorPresetStorageState().sceneBackground,
    isResizableLayerSelection: false,
    selection: DEFAULT_SELECTION,
    sourceHeight: 720,
    sourceName: 'capture',
    sourceWidth: 1280,
  });

  expect(hook.getValue()?.canvasSizeDraft).toEqual({ height: 720, width: 1280 });

  hook.rerender({
    canvasHeight: 720,
    canvasWidth: 1280,
    cropSelection: { height: 360, width: 640 },
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    inspector: 'tool',
    sceneBackgroundPresets: createDefaultEditorPresetStorageState().sceneBackground,
    isResizableLayerSelection: false,
    selection: DEFAULT_SELECTION,
    sourceHeight: 720,
    sourceName: 'capture',
    sourceWidth: 1280,
  });

  expect(hook.getValue()?.canvasSizeDraft).toEqual({ height: 360, width: 640 });
});

it('keeps image, canvas, and layer drafts stable across unchanged and clamped inputs', () => {
  const selection = {
    ...DEFAULT_SELECTION,
    hasSelection: true,
    selectedObjectHeight: null,
    selectedObjectWidth: null,
  };
  const args = {
    canvasHeight: 0,
    canvasWidth: 0,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    inspector: 'tool',
    sceneBackgroundPresets: createDefaultEditorPresetStorageState().sceneBackground,
    isResizableLayerSelection: true,
    selection,
    sourceHeight: 0,
    sourceName: 'capture',
    sourceWidth: 0,
  };
  const hook = renderHook(args);
  const initialCanvasDraft = hook.getValue()?.canvasSizeDraft;

  expect(hook.getValue()?.imageSizeDraft).toEqual({ height: 1, width: 1 });
  expect(initialCanvasDraft).toEqual({ height: 1, width: 1 });
  expect(hook.getValue()?.layerSizeDraft).toEqual({ height: 1, width: 1 });
  expect(hook.getValue()?.layerSizeLocked).toBe(true);

  hook.rerender({ ...args });

  expect(hook.getValue()?.canvasSizeDraft).toBe(initialCanvasDraft);
});

it('preserves a dirty scene draft when loaded defaults change later', () => {
  const cleanOpenFrame = createCleanOpenFrame();
  const initialPresets = createDefaultEditorPresetStorageState().sceneBackground;
  const hydratedPresets = createHydratedSceneBackgroundPresets();
  const hook = renderHook({
    canvasHeight: 400,
    canvasWidth: 800,
    frame: cleanOpenFrame,
    inspector: 'frame',
    sceneBackgroundPresets: initialPresets,
    isResizableLayerSelection: false,
    selection: DEFAULT_SELECTION,
    sourceHeight: 400,
    sourceName: 'capture',
    sourceWidth: 800,
  });

  act(() => {
    hook.getValue()?.setFrameDraft((state) => ({ ...state, backgroundColor: '#abcdef' }));
  });
  hook.rerender({
    canvasHeight: 400,
    canvasWidth: 800,
    frame: cleanOpenFrame,
    inspector: 'frame',
    sceneBackgroundPresets: hydratedPresets,
    isResizableLayerSelection: false,
    selection: DEFAULT_SELECTION,
    sourceHeight: 400,
    sourceName: 'capture',
    sourceWidth: 800,
  });

  expect(hook.getValue()?.frameDraft.backgroundColor).toBe('#abcdef');
});
