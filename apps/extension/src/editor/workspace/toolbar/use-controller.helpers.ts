import type { ImageEditorController } from '../../controller';
import { getEditorToolbarDerivedState } from '../../inspector/toolbar-derived-state';
import { closeLayerEffectsBeforeToolbarAction, createEditorToolbarActions } from './actions';
import type { EditorToolbarContentProps } from './types';
import type { useEditorToolbarState } from './use-state';

function createToolbarInspectorVisibilityActions(args: {
  setInspectorCollapsed: (collapsed: boolean) => void;
  setViewportPreviewOpenFromUser: EditorToolbarContentProps['onSetViewportPreviewOpenManually'];
}) {
  return {
    onCollapseInspector: () => args.setInspectorCollapsed(true),
    onExpandInspector: () => args.setInspectorCollapsed(false),
    onSetViewportPreviewOpenManually: args.setViewportPreviewOpenFromUser,
  };
}

function createToolbarSelectionAwareAction(state: ReturnType<typeof useEditorToolbarState>) {
  return () =>
    closeLayerEffectsBeforeToolbarAction({
      inspector: state.inspector,
      setActiveTool: state.setActiveTool,
    });
}

export function buildEditorToolbarControllerProps(
  state: ReturnType<typeof useEditorToolbarState>,
  hasImage: boolean,
  controller: Pick<
    ImageEditorController,
    'cancelCropMode' | 'clearSelection' | 'setActiveTool' | 'suspendToolMode'
  >
): EditorToolbarContentProps {
  const { inspectorMeta, isToolButtonActive, isToolMode } = getEditorToolbarDerivedState({
    activeTool: state.activeTool,
    inspector: state.inspector,
    layerEffectsCategory: state.layerEffectsCategory,
    selection: state.selection,
  });

  const actions = createEditorToolbarActions({
    controller,
    hasImage,
    inspector: state.inspector,
    setActiveTool: state.setActiveTool,
    setInspector: state.setInspector,
  });
  const visibilityActions = createToolbarInspectorVisibilityActions({
    setInspectorCollapsed: state.setInspectorCollapsed,
    setViewportPreviewOpenFromUser: state.setViewportPreviewOpenFromUser,
  });

  return {
    activeTool: state.activeTool,
    gridEnabled: state.gridEnabled,
    hasImage,
    history: state.history,
    inspector: state.inspector,
    inspectorCollapsed: state.inspectorCollapsed,
    inspectorMeta,
    isToolButtonActive,
    isToolMode,
    viewportPreviewOpen: state.viewportPreviewOpen,
    zoomPercent: state.zoomPercent,
    onActivateTool: actions.activateTool,
    onBeforeSelectionAwareAction: createToolbarSelectionAwareAction(state),
    onCollapseInspector: visibilityActions.onCollapseInspector,
    onExpandInspector: visibilityActions.onExpandInspector,
    onSetViewportPreviewOpenManually: visibilityActions.onSetViewportPreviewOpenManually,
    onToggleInspector: actions.toggleInspector,
  };
}
