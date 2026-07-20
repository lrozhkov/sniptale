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
      updateArrowSettings: state.updateArrowSettings,
      updateLineSettings: state.updateLineSettings,
      updateBlurSettings: state.updateBlurSettings,
      updateBrushSettings: state.updateBrushSettings,
      updateSelectionBlurSettings: state.updateSelectionBlurSettings,
      updateSelectionArrowSettings: state.updateSelectionArrowSettings,
      updateSelectionLineSettings: state.updateSelectionLineSettings,
      updateSelectionBrushSettings: state.updateSelectionBrushSettings,
      updateSelectionShapeSettings: state.updateSelectionShapeSettings,
      updateSelectionStepSettings: state.updateSelectionStepSettings,
      updateSelectionTextSettings: state.updateSelectionTextSettings,
      updateSelectionImageSettings: state.updateSelectionImageSettings,
      updateShapeSettings: state.updateShapeSettings,
      updateStepSettings: state.updateStepSettings,
      updateTextSettings: state.updateTextSettings,
      updateImageSettings: state.updateImageSettings,
      updateWorkspace: state.updateWorkspace,
      updateWorkspaceDefaults: state.updateWorkspaceDefaults,
      viewport: state.viewport,
      workspace: state.workspace,
    }))
  );
}

export type EditorInspectorStoreSlice = ReturnType<typeof useEditorInspectorStoreSlice>;
