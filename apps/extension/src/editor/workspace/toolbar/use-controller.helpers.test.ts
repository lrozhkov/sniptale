import { describe, expect, it, vi } from 'vitest';

const actionsMock = vi.hoisted(() => ({
  activateTool: vi.fn(),
  toggleInspector: vi.fn(),
}));
const derivedStateMock = vi.hoisted(() => ({
  inspectorMeta: { subtitle: 'subtitle', title: 'title' },
  isToolButtonActive: vi.fn(),
  isToolMode: false,
}));

vi.mock('./actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./actions')>()),
  createEditorToolbarActions: vi.fn(() => actionsMock),
}));

vi.mock('../../inspector/toolbar-derived-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../inspector/toolbar-derived-state')>()),
  getEditorToolbarDerivedState: vi.fn(() => derivedStateMock),
}));

import { createEditorToolbarActions } from './actions';
import { getEditorToolbarDerivedState } from '../../inspector/toolbar-derived-state';
import { buildEditorToolbarControllerProps } from './use-controller.helpers';

function createToolbarState() {
  return {
    activeTool: 'select',
    gridEnabled: true,
    history: { canRedo: false, canUndo: true },
    inspector: 'layer-effects',
    inspectorCollapsed: false,
    layerEffectsCategory: 'transformations',
    selection: {
      hasSelection: true,
      selectedObjectCount: 1,
      selectedObjectId: 'layer-1',
      selectedObjectType: 'image',
    },
    setActiveTool: vi.fn(),
    setInspector: vi.fn(),
    setInspectorCollapsed: vi.fn(),
    setViewportPreviewOpenFromUser: vi.fn(),
    viewportPreviewOpen: false,
    zoomPercent: 125,
  } as const;
}

function createToolbarController() {
  return {
    cancelCropMode: vi.fn(),
    clearSelection: vi.fn(),
    setActiveTool: vi.fn(),
    suspendToolMode: vi.fn(),
  };
}

function assertVisibilityActions(
  props: ReturnType<typeof buildEditorToolbarControllerProps>,
  state: ReturnType<typeof createToolbarState>
) {
  props.onCollapseInspector();
  props.onExpandInspector();
  props.onSetViewportPreviewOpenManually(true);

  expect(state.setInspectorCollapsed).toHaveBeenNthCalledWith(1, true);
  expect(state.setInspectorCollapsed).toHaveBeenNthCalledWith(2, false);
  expect(state.setViewportPreviewOpenFromUser).toHaveBeenCalledWith(true);
}

function registerControllerPropsTest() {
  it('builds toolbar props with layer-effects category-aware inspector metadata', () => {
    const state = createToolbarState();
    const controller = createToolbarController();

    const props = buildEditorToolbarControllerProps(state as never, true, controller);

    expect(getEditorToolbarDerivedState).toHaveBeenCalledWith(
      expect.objectContaining({ layerEffectsCategory: 'transformations' })
    );
    expect(createEditorToolbarActions).toHaveBeenCalledWith(
      expect.objectContaining({
        controller,
        hasImage: true,
        inspector: 'layer-effects',
      })
    );
    expect(props.inspectorMeta).toEqual(derivedStateMock.inspectorMeta);
    expect(props.onActivateTool).toBe(actionsMock.activateTool);
    assertVisibilityActions(props, state);
  });
}

describe('editor-toolbar.use-controller.helpers', () => {
  registerControllerPropsTest();
});
