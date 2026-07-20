import { translate } from '../../../platform/i18n';
import type {
  EditorLayerEffectCategory,
  EditorRasterEffect,
  EditorRasterEffectId,
} from '../../../features/editor/document/effects';
import type { EditorInspectorPresetHeaderBag } from '../types';
import type { useEditorController } from '../../application/controller-context';
import { updateSelectedRichShapeFormatting } from '../../controller/public-actions/selection/rich-shape';
import type { EditorLayerTransformationId } from '../../controller/layer-effects/registry';
import type { EditorLayerEffectCommandId } from '../../controller/layer-effects/registry';
import { createEditorActionRailHandlers } from './action-rail';
import { DimensionInput } from '../sidebar-shared';
import type { EditorInspectorStoreSlice } from './store';
import type { useEditorInspectorSidebarActions } from './actions';
import type { useEditorInspectorSidebarDerived } from './derived';
import type { useEditorInspectorSidebarLocalState } from './local-state';
import type { EditorInspectorRichShapeState } from '../types';

type EditorInspectorLocalState = ReturnType<typeof useEditorInspectorSidebarLocalState>;
type EditorInspectorDerivedState = ReturnType<typeof useEditorInspectorSidebarDerived>;
type EditorInspectorActions = ReturnType<typeof useEditorInspectorSidebarActions>;
type EditorInspectorDerivedInputSource = {
  activeTool: unknown;
  inspector: unknown;
  selection: unknown;
  selectionToolSettings: unknown;
  toolSettings: unknown;
  viewport: {
    canvasHeight: number;
    canvasWidth: number;
    sourceHeight: number;
    sourceWidth: number;
  };
};
type EditorInspectorDerivedInput<Source extends EditorInspectorDerivedInputSource> = {
  activeTool: Source['activeTool'];
  canvasHeight: number;
  canvasWidth: number;
  hasImage: boolean;
  inspector: Source['inspector'];
  selection: Source['selection'];
  selectionToolSettings: Source['selectionToolSettings'];
  sourceHeight: number;
  sourceWidth: number;
  toolSettings: Source['toolSettings'];
};

export function selectEditorInspectorSidebarDerivedInput<
  Source extends EditorInspectorDerivedInputSource,
>(hasImage: boolean, store: Source): EditorInspectorDerivedInput<Source> {
  return {
    activeTool: store.activeTool,
    canvasHeight: store.viewport.canvasHeight,
    canvasWidth: store.viewport.canvasWidth,
    hasImage,
    inspector: store.inspector,
    selection: store.selection,
    selectionToolSettings: store.selectionToolSettings,
    sourceHeight: store.viewport.sourceHeight,
    sourceWidth: store.viewport.sourceWidth,
    toolSettings: store.toolSettings,
  };
}

export function mergeEditorInspectorDerivedState(args: {
  browserFrame: EditorInspectorStoreSlice['browserFrame'];
  cropReady: boolean;
  cropSelection?: EditorInspectorStoreSlice['cropSelection'];
  defaultImagePresetId: string | null;
  derived: EditorInspectorDerivedState &
    EditorInspectorPresetHeaderBag &
    EditorInspectorRichShapeState;
  savePresets: Awaited<
    ReturnType<typeof import('../../document/file-actions').loadEditorSaveOptions>
  >['presets'];
  selection: EditorInspectorStoreSlice['selection'];
  workspace: EditorInspectorStoreSlice['workspace'];
}) {
  return {
    ...args.derived,
    browserFrame: args.browserFrame,
    cropReady: args.cropReady,
    cropSelection: args.cropSelection ?? null,
    defaultImagePresetId: args.defaultImagePresetId,
    savePresets: args.savePresets,
    selection: args.selection,
    workspace: args.workspace,
  };
}

type EditorInspectorControllerActionArgs = {
  actions: EditorInspectorActions;
  backgroundImageInputRef: EditorInspectorLocalState['backgroundImageInputRef'];
  controller: ReturnType<typeof useEditorController>;
  frameDraft: EditorInspectorLocalState['frameDraft'];
  importSessionInputRef: EditorInspectorLocalState['importSessionInputRef'];
  openImageInputRef: EditorInspectorLocalState['openImageInputRef'];
  openLayerEffects: EditorInspectorLocalState['openLayerEffects'];
  syncActiveTool: EditorInspectorStoreSlice['syncActiveTool'];
  setImageData: EditorInspectorStoreSlice['setImageData'];
  setInspector: EditorInspectorStoreSlice['setInspector'];
  setLayerEffectsCategory: EditorInspectorStoreSlice['setLayerEffectsCategory'];
};

export function createEditorInspectorControllerActions(args: EditorInspectorControllerActionArgs) {
  const actionRailHandlers = createEditorActionRailHandlers(args.controller, args.setImageData);
  const { selectLayer, setActiveTool, withHistoryMuted } = createSelectionActionHelpers(
    args.controller
  );
  const runRasterLayerAction = createRasterLayerActionRunner(selectLayer, withHistoryMuted);
  const openLayerEffects = createOpenLayerEffectsHandler(
    selectLayer,
    withHistoryMuted,
    setActiveTool,
    args.openLayerEffects,
    args.syncActiveTool,
    args.setLayerEffectsCategory,
    args.setInspector
  );
  const layerEffectActions = createLayerEffectActionProps(
    args.controller,
    runRasterLayerAction,
    openLayerEffects
  );

  return {
    document: {
      DimensionInput,
      backgroundImageInputRef: args.backgroundImageInputRef,
      importSessionInputRef: args.importSessionInputRef,
      onApplyFrame: () => args.controller.applyFrameSettings(args.frameDraft),
      onExportSession: () => actionRailHandlers.exportSession(),
      onImportSession: () => args.importSessionInputRef.current?.click(),
      onOpenImage: () => args.openImageInputRef.current?.click(),
      onPickBackgroundImage: () => args.backgroundImageInputRef.current?.click(),
      onResizeCanvas: (width: number, height: number) =>
        args.controller.resizeCanvas(width, height),
      onResizeImage: (width: number, height: number) => args.controller.resizeImage(width, height),
      onResizeLayer: (layerId: string, width: number, height: number) =>
        runRasterLayerAction(layerId, () =>
          Promise.resolve(args.controller.resizeLayer(layerId, width, height))
        ),
      openImageInputRef: args.openImageInputRef,
      setImageData: args.setImageData,
    },
    layerEffects: layerEffectActions,
    sidebar: args.actions,
  };
}

function createLayerEffectActionProps(
  controller: ReturnType<typeof useEditorController>,
  runRasterLayerAction: ReturnType<typeof createRasterLayerActionRunner>,
  onOpenLayerEffects: ReturnType<typeof createOpenLayerEffectsHandler>
) {
  return {
    applyLayerEffect: (layerId: string, effect: EditorRasterEffect) =>
      runRasterLayerAction(layerId, () => controller.applyLayerEffect(layerId, effect)),
    applyLayerTransformation: (layerId: string, transformationId: EditorLayerTransformationId) =>
      runRasterLayerAction(layerId, () =>
        controller.applyLayerTransformation(layerId, transformationId)
      ),
    onOpenLayerEffects,
    previewLayerEffect: (layerId: string, effect: EditorRasterEffect) =>
      controller.previewLayerEffect(layerId, effect),
    removeLayerEffect: (layerId: string, effectId: EditorRasterEffectId) =>
      controller.removeLayerEffect(layerId, effectId),
    resetLayerEffectPreview: (layerId: string) => controller.resetLayerEffectPreview(layerId),
    updateLayerEffect: (layerId: string, effect: EditorRasterEffect) =>
      controller.updateLayerEffect(layerId, effect),
  };
}

export function createRichShapeActionHandlers(controller: ReturnType<typeof useEditorController>) {
  return {
    applyRichShapePatch: (patch: Parameters<typeof updateSelectedRichShapeFormatting>[1]) =>
      updateSelectedRichShapeFormatting(
        {
          canvas: controller.canvas,
          commitHistory: () => controller.commitHistory(),
          syncRuntimeState: () => controller.syncRuntimeState(),
          withHistoryMuted: <T>(callback: () => T) => controller.withHistoryMuted(callback),
        },
        patch
      ),
    arrangeSelection: (action: 'forward' | 'backward' | 'front' | 'back') => {
      if (action === 'forward') {
        controller.bringForwardSelection();
      } else if (action === 'backward') {
        controller.sendBackwardSelection();
      } else if (action === 'front') {
        controller.bringSelectionToFront();
      } else {
        controller.sendSelectionToBack();
      }
    },
  };
}

function createSelectionActionHelpers(controller: ReturnType<typeof useEditorController>) {
  return {
    selectLayer: (layerId: string, options?: Parameters<typeof controller.selectLayer>[1]) =>
      controller.selectLayer(layerId, options),
    setActiveTool: (tool: Parameters<typeof controller.setActiveTool>[0]) =>
      controller.setActiveTool(tool),
    withHistoryMuted: <T>(callback: () => T) => controller.withHistoryMuted(callback),
  };
}

function createRasterLayerActionRunner(
  selectLayer: ReturnType<typeof useEditorController>['selectLayer'],
  withHistoryMuted: ReturnType<typeof useEditorController>['withHistoryMuted']
) {
  return async (layerId: string, action: () => Promise<void>) => {
    withHistoryMuted(() => {
      selectLayer(layerId, { focusViewport: false });
    });

    await action();
  };
}

function createOpenLayerEffectsHandler(
  selectLayer: ReturnType<typeof useEditorController>['selectLayer'],
  withHistoryMuted: ReturnType<typeof useEditorController>['withHistoryMuted'],
  setControllerActiveTool: ReturnType<typeof useEditorController>['setActiveTool'],
  openLayerEffects: EditorInspectorLocalState['openLayerEffects'],
  syncActiveTool: EditorInspectorStoreSlice['syncActiveTool'],
  setLayerEffectsCategory: EditorInspectorStoreSlice['setLayerEffectsCategory'],
  setInspector: EditorInspectorStoreSlice['setInspector']
) {
  return (
    layerId: string,
    category: EditorLayerEffectCategory,
    activeEffectId: EditorLayerEffectCommandId | null = null,
    options?: { focusViewport?: boolean }
  ) => {
    withHistoryMuted(() => {
      selectLayer(layerId, { focusViewport: options?.focusViewport ?? false });
    });
    syncActiveTool('select');
    setControllerActiveTool('select');
    openLayerEffects(layerId, category, activeEffectId);
    setLayerEffectsCategory(category);
    setInspector('layer-effects');
  };
}

export function createCloseDocumentHandler(args: {
  controller: ReturnType<typeof useEditorController>;
  hasImage: boolean;
  requestConfirm: EditorInspectorLocalState['requestConfirm'];
  setSavePresetPickerOpen: EditorInspectorLocalState['setSavePresetPickerOpen'];
}) {
  const closeDocument = () => {
    args.setSavePresetPickerOpen(false);
    args.controller.closeDocument();
  };

  return () => {
    if (!args.hasImage) {
      closeDocument();
      return;
    }

    void args
      .requestConfirm({
        title: translate('editor.documentActions.closeFile'),
        message: translate('editor.documentActions.confirmCloseDocument'),
        confirmText: translate('common.actions.close'),
        cancelText: translate('common.actions.cancel'),
      })
      .then((confirmed) => {
        if (confirmed) {
          closeDocument();
        }
      });
  };
}
