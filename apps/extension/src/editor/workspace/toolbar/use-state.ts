import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../../state/useEditorStore';

export function useEditorToolbarState() {
  return useEditorStore(
    useShallow((state) => ({
      activeTool: state.activeTool,
      gridEnabled: state.workspace.gridEnabled,
      history: state.history,
      inspector: state.inspector,
      inspectorCollapsed: state.inspectorCollapsed,
      layerEffectsCategory: state.layerEffectsCategory,
      saveErrorMessage: state.saveErrorMessage,
      saveState: state.saveState,
      selection: state.selection,
      setActiveTool: state.setActiveTool,
      setInspector: state.setInspector,
      setInspectorCollapsed: state.setInspectorCollapsed,
      setViewportPreviewOpenFromUser: state.setViewportPreviewOpenFromUser,
      viewportPreviewOpen: state.viewportPreviewOpen,
      zoomPercent: state.viewport.zoomPercent,
    }))
  );
}
