import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../../state/useEditorStore';

export function useEditorInspectorStoreSlice() {
  return useEditorStore(
    useShallow((state) => ({
      activeTool: state.activeTool,
      browserFrame: state.browserFrame,
      cropReady: state.cropReady,
      cropSelection: state.cropSelection,
      frame: state.frame,
      inspector: state.inspector,
      inspectorCollapsed: state.inspectorCollapsed,
      layerEffectsCategory: state.layerEffectsCategory,
      layers: state.layers,
      selection: state.selection,
      selectionToolSettings: state.selectionToolSettings,
      setActiveTool: state.setActiveTool,
      syncActiveTool: state.syncActiveTool,
      setBrowserFrame: state.setBrowserFrame,
      setImageData: state.setImageData,
      setInspector: state.setInspector,
      setLayerEffectsCategory: state.setLayerEffectsCategory,
      toolSettings: state.toolSettings,
      updateDrawingToolSettings: state.updateDrawingToolSettings,
      updateSelectionDrawingToolSettings: state.updateSelectionDrawingToolSettings,
      updateSelectionStepSettings: state.updateSelectionStepSettings,
      updateSelectionImageSettings: state.updateSelectionImageSettings,
      updateStepSettings: state.updateStepSettings,
      updateImageSettings: state.updateImageSettings,
      updateWorkspace: state.updateWorkspace,
      updateWorkspaceDefaults: state.updateWorkspaceDefaults,
      viewport: state.viewport,
      workspace: state.workspace,
    }))
  );
}

export type EditorInspectorStoreSlice = ReturnType<typeof useEditorInspectorStoreSlice>;
