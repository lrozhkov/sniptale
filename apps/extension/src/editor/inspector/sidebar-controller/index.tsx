import { useEditorController } from '../../application/controller-context';
import { getSelectedRichShapeDocumentObject } from '../../controller/public-actions/selection/rich-shape';
import {
  getEditorShapeSettings,
  type EditorShapeTool,
} from '../../../features/editor/document/shape-settings';
import { normalizeEditorImageSettings } from '../../../features/editor/document/constants';
import { type EditorTool } from '../../../features/editor/document/types';
import { useEditorStore } from '../../state/useEditorStore';
import type { EditorInspectorPresetHeaderBag } from '../types';
import {
  createEditorInspectorControllerActions,
  mergeEditorInspectorDerivedState,
  selectEditorInspectorSidebarDerivedInput,
  createRichShapeActionHandlers,
  createCloseDocumentHandler,
} from './builders';
import {
  buildEditorInspectorSidebarCompactCommandGroups,
  createEditorInspectorSidebarCompactContext,
} from './compact-context';
import {
  buildEditorInspectorSidebarControllerResult,
  createEditorInspectorSidebarControllerStoreResult,
} from './result';
import { type EditorInspectorStoreSlice, useEditorInspectorStoreSlice } from './store';
import { useEditorInspectorSidebarActions } from './actions';
import { useEditorInspectorSidebarDerived } from './derived';
import { useEditorInspectorSidebarLocalState } from './local-state';
import { useEditorPresetStorageState } from './presets';
import { useEditorInspectorPresetHeaders } from './preset-headers';

type EditorInspectorLocalState = ReturnType<typeof useEditorInspectorSidebarLocalState>;

function createSidebarControllerLocalState(localState: EditorInspectorLocalState) {
  const { workspaceColor, ...rest } = localState;

  return {
    ...rest,
    workspaceColorError: workspaceColor.error,
    workspaceColorMatchesDefault: workspaceColor.matchesDefault,
    workspaceDefaultSavePending: workspaceColor.pending,
  };
}

function useSidebarDerivedState(
  hasImage: boolean,
  store: EditorInspectorStoreSlice,
  editorController: ReturnType<typeof useEditorController>
) {
  const workspaceDefaultColor = useEditorStore((state) => state.workspaceDefaults.backgroundColor);
  const editorPresetState = useEditorPresetStorageState();
  const derivedParams = selectEditorInspectorSidebarDerivedInput(hasImage, store);
  const initialDerived = useEditorInspectorSidebarDerived({
    ...derivedParams,
    editorPresetState,
    frameDraft: store.frame,
  });
  const localState = useEditorInspectorSidebarLocalState({
    canvasHeight: store.viewport.canvasHeight,
    canvasWidth: store.viewport.canvasWidth,
    cropSelection: store.cropSelection,
    frame: store.frame,
    inspector: store.inspector,
    sceneBackgroundPresets: editorPresetState.sceneBackground,
    isResizableLayerSelection: initialDerived.isResizableLayerSelection,
    layers: store.layers,
    selection: store.selection,
    setInspector: store.setInspector,
    syncActiveTool: store.syncActiveTool,
    sourceHeight: store.viewport.sourceHeight,
    sourceName: store.viewport.sourceName,
    sourceWidth: store.viewport.sourceWidth,
    workspaceBackgroundColor: store.workspace.backgroundColor,
    workspaceDefaultColor,
  });
  const derived = useEditorInspectorSidebarDerived({
    ...derivedParams,
    editorPresetState,
    frameDraft: localState.frameDraft,
  });

  return {
    derived: {
      ...derived,
      richShapeSelection: getSelectedRichShapeDocumentObject({ canvas: editorController.canvas }),
    },
    editorPresetState,
    localState,
  };
}

function useSidebarActions(
  hasImage: boolean,
  store: EditorInspectorStoreSlice,
  derived: ReturnType<typeof useSidebarDerivedState>['derived'],
  localState: EditorInspectorLocalState
) {
  return useEditorInspectorSidebarActions(
    {
      activeTool: store.activeTool,
      browserFrame: store.browserFrame,
      confirmOpenStorageManager: (dialog) => localState.requestConfirm(dialog),
      defaultImagePresetId: localState.defaultImagePresetId,
      frameDraft: localState.frameDraft,
      savePresets: localState.savePresets,
      selection: store.selection,
      setFrameDraft: localState.setFrameDraft,
      setBrowserFrame: store.setBrowserFrame,
      shapeSettings: getEditorShapeSettings(
        derived.inspectorToolSettings,
        resolveSidebarShapeTool(derived.highlightedTool)
      ),
      shapeTool: resolveSidebarShapeTool(derived.highlightedTool),
      textSettings: derived.inspectorToolSettings.text,
      setWorkspaceColorError: localState.workspaceColor.setError,
      setWorkspaceDefaultSavePending: localState.workspaceColor.setPending,
      updateBlurSettings: store.updateBlurSettings,
      updateArrowSettings: store.updateArrowSettings,
      updateLineSettings: store.updateLineSettings,
      updateBrushSettings: store.updateBrushSettings,
      updateSelectionBlurSettings: store.updateSelectionBlurSettings,
      updateSelectionArrowSettings: store.updateSelectionArrowSettings,
      updateSelectionLineSettings: store.updateSelectionLineSettings,
      updateSelectionBrushSettings: store.updateSelectionBrushSettings,
      updateSelectionShapeSettings: store.updateSelectionShapeSettings,
      updateSelectionStepSettings: store.updateSelectionStepSettings,
      updateSelectionTextSettings: store.updateSelectionTextSettings,
      updateSelectionImageSettings: store.updateSelectionImageSettings,
      updateShapeSettings: store.updateShapeSettings,
      updateStepSettings: store.updateStepSettings,
      updateTextSettings: store.updateTextSettings,
      updateImageSettings: store.updateImageSettings,
      updateWorkspace: store.updateWorkspace,
      updateWorkspaceDefaults: store.updateWorkspaceDefaults,
      workspace: store.workspace,
      workspaceDefaultColor: useEditorStore.getState().workspaceDefaults.backgroundColor,
    },
    hasImage
  );
}

export function resolveSidebarShapeTool(tool: EditorTool): EditorShapeTool {
  if (tool === 'ellipse') {
    return 'ellipse';
  }

  if (tool === 'diamond') {
    return 'diamond';
  }

  return 'rectangle';
}

function buildSidebarControllerState(args: {
  editorController: ReturnType<typeof useEditorController>;
  handleCloseDocument: () => void;
  hasImage: boolean;
  localState: EditorInspectorLocalState;
  store: EditorInspectorStoreSlice;
  actions: ReturnType<typeof useSidebarActions>;
  derived: ReturnType<typeof useSidebarDerivedState>['derived'] & EditorInspectorPresetHeaderBag;
}) {
  const controllerDerivedState = mergeSidebarControllerDerivedState(args);
  const controllerActionGroups = createEditorInspectorControllerActions({
    actions: args.actions,
    backgroundImageInputRef: args.localState.backgroundImageInputRef,
    controller: args.editorController,
    frameDraft: args.localState.frameDraft,
    importSessionInputRef: args.localState.importSessionInputRef,
    openImageInputRef: args.localState.openImageInputRef,
    openLayerEffects: args.localState.openLayerEffects,
    syncActiveTool: args.store.syncActiveTool,
    setImageData: args.store.setImageData,
    setInspector: args.store.setInspector,
    setLayerEffectsCategory: args.store.setLayerEffectsCategory,
  });
  const richShapeActions = createRichShapeActionHandlers(args.editorController);
  const expandedActionProps = {
    ...controllerActionGroups.sidebar,
    ...controllerActionGroups.layerEffects,
    ...controllerActionGroups.document,
    applyRichShapePatch: richShapeActions.applyRichShapePatch,
    arrangeSelection: richShapeActions.arrangeSelection,
  };
  const controllerLocalState = createSidebarControllerLocalState(args.localState);
  const controller = buildEditorInspectorSidebarControllerResult({
    store: createEditorInspectorSidebarControllerStoreResult(args.store),
    localState: controllerLocalState,
    derived: controllerDerivedState,
    actions: expandedActionProps,
    handleCloseDocument: args.handleCloseDocument,
  });

  return {
    compactContext: createEditorInspectorSidebarCompactContext({
      controller,
      hasImage: args.hasImage,
      onCloseDocument: args.handleCloseDocument,
    }),
    controller,
  };
}

function mergeSidebarControllerDerivedState(args: {
  localState: EditorInspectorLocalState;
  store: EditorInspectorStoreSlice;
  derived: ReturnType<typeof useSidebarDerivedState>['derived'] & EditorInspectorPresetHeaderBag;
}) {
  return mergeEditorInspectorDerivedState({
    browserFrame: args.store.browserFrame,
    cropReady: args.store.cropReady,
    cropSelection: args.store.cropSelection,
    defaultImagePresetId: args.localState.defaultImagePresetId,
    derived: args.derived,
    savePresets: args.localState.savePresets,
    selection: args.store.selection,
    workspace: args.store.workspace,
  });
}

export function useEditorInspectorSidebarController(hasImage: boolean) {
  const editorController = useEditorController();
  const store = useEditorInspectorStoreSlice();
  const { derived, editorPresetState, localState } = useSidebarDerivedState(
    hasImage,
    store,
    editorController
  );
  const actions = useSidebarActions(hasImage, store, derived, localState);
  const presetHeaders = useEditorInspectorPresetHeaders(
    createPresetHeaderArgs(derived, actions, editorPresetState, localState)
  );
  const handleCloseDocument = createCloseDocumentHandler({
    controller: editorController,
    hasImage,
    requestConfirm: localState.requestConfirm,
    setSavePresetPickerOpen: localState.setSavePresetPickerOpen,
  });
  const sidebarState = buildSidebarControllerState({
    editorController,
    handleCloseDocument,
    hasImage,
    localState,
    store,
    actions,
    derived: {
      ...derived,
      ...presetHeaders,
    },
  });
  const compactCommandGroups = buildEditorInspectorSidebarCompactCommandGroups({
    controller: editorController,
    context: sidebarState.compactContext,
  });

  return {
    ...sidebarState.controller,
    compactCommandGroups,
    onCloseDocument: handleCloseDocument,
  };
}

function createPresetHeaderArgs(
  derived: ReturnType<typeof useSidebarDerivedState>['derived'],
  actions: ReturnType<typeof useSidebarActions>,
  editorPresetState: ReturnType<typeof useSidebarDerivedState>['editorPresetState'],
  localState: ReturnType<typeof useSidebarDerivedState>['localState']
): Parameters<typeof useEditorInspectorPresetHeaders>[0] {
  return {
    activeTool: derived.highlightedTool,
    applyBlurPresetSettings: (settings) => actions.applyBlurPresetSettings(settings),
    applyArrowPresetSettings: (settings) => actions.applyArrowPresetSettings(settings),
    applyLinePresetSettings: (settings) => actions.applyLinePresetSettings(settings),
    applyBrushPresetSettings: (tool, settings) => actions.applyBrushPresetSettings(tool, settings),
    applyShapePresetSettings: (owner, settings) =>
      actions.applyShapePresetSettings(owner, settings),
    applyStepPresetSettings: (settings) => actions.applyStepPresetSettings(settings),
    applyTextPresetSettings: (settings) => actions.applyTextPresetSettings(settings),
    borderPresets: actions.borderPresets,
    defaultBorderPresetId: actions.defaultBorderPresetId,
    editorPresetState,
    frameDraft: localState.frameDraft,
    setFrameSettings: (settings) => {
      localState.setFrameDraft((state) => ({
        ...state,
        ...settings,
        sourceImage: normalizeEditorImageSettings(settings.sourceImage ?? state.sourceImage),
      }));
    },
    toolSettings: derived.inspectorToolSettings,
  };
}
