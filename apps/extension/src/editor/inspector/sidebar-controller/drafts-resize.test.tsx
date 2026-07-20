// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import { createDefaultEditorPresetStorageState } from '../../../composition/persistence/editor-presets';
import { useInspectorSidebarDraftState } from './drafts';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const DEFAULT_SELECTION = {
  hasSelection: false,
  selectedObjectHeight: null,
  selectedObjectCount: 0,
  selectedObjectId: null,
  selectedObjectIds: [],
  selectedObjectType: null,
  selectedObjectWidth: null,
};

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

function createResizeArgs(
  overrides: Partial<Parameters<typeof useInspectorSidebarDraftState>[0]> = {}
) {
  return {
    canvasHeight: 720,
    canvasWidth: 1280,
    cropSelection: null,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    inspector: 'canvas-size',
    sceneBackgroundPresets: createDefaultEditorPresetStorageState().sceneBackground,
    isResizableLayerSelection: false,
    selection: DEFAULT_SELECTION,
    sourceHeight: 720,
    sourceName: 'capture',
    sourceWidth: 1280,
    ...overrides,
  };
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('resets stale resize drafts after closing the resize inspector', () => {
  const hook = renderHook(createResizeArgs());

  hook.rerender(createResizeArgs({ cropSelection: { height: 360, width: 640 } }));
  expect(hook.getValue()?.canvasSizeDraft).toEqual({ height: 360, width: 640 });

  hook.rerender(createResizeArgs({ inspector: 'tool' }));
  expect(hook.getValue()?.canvasSizeDraft).toEqual({ height: 720, width: 1280 });
});
