import { useEditorController } from '../../application/controller-context';
import { getSelectedRichShapeDocumentObject } from '../../controller/public-actions/selection/rich-shape';
import { normalizeEditorImageSettings } from '../../../features/editor/document/constants';
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
type EditorInspectorActionGroups = ReturnType<typeof useEditorInspectorSidebarActions>;
type EditorInspectorActions = EditorInspectorActionGroups['catalogActions'] &
  EditorInspectorActionGroups['editorActions'] &
  EditorInspectorActionGroups['selectionActions'] &
  EditorInspectorActionGroups['staticOptions'] &
  EditorInspectorActionGroups['utilityActions'];

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
  localState: EditorInspectorLocalState
): EditorInspectorActions {
  const groups = useEditorInspectorSidebarActions(
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
      setWorkspaceColorError: localState.workspaceColor.setError,
      setWorkspaceDefaultSavePending: localState.workspaceColor.setPending,
      updateSelectionStepSettings: store.updateSelectionStepSettings,
      updateSelectionImageSettings: store.updateSelectionImageSettings,
      updateStepSettings: store.updateStepSettings,
      updateImageSettings: store.updateImageSettings,
      updateWorkspace: store.updateWorkspace,
      updateWorkspaceDefaults: store.updateWorkspaceDefaults,
      workspace: store.workspace,
      workspaceDefaultColor: useEditorStore.getState().workspaceDefaults.backgroundColor,
    },
    hasImage
  );
  return {
    ...groups.staticOptions,
    ...groups.utilityActions,
    ...groups.selectionActions,
    ...groups.catalogActions,
    ...groups.editorActions,
  };
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
  const actions = useSidebarActions(hasImage, store, localState);
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
    applyStepPresetSettings: (settings) => actions.applyStepPatch(settings),
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
