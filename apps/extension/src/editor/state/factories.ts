import type {
  BrowserFrameState,
  EditorViewportState,
  EditorWorkspaceSettings,
} from '../../features/editor/document/types';
import type { EditorLayerEffectCategory } from '../../features/editor/document/effects';
import { normalizeEditorFrameSettings } from '../../features/editor/document/constants';
import {
  createManualViewportPreviewPatch,
  createObjectPatch,
  type EditorStoreSet,
} from './helpers';
import type { EditorState } from './types';
import {
  createHydrateDefaultsAction,
  createRasterToolSettingsUpdater,
  createToolSettingsUpdaters,
} from './tool-settings';

export type EditorStoreSetters = Pick<
  EditorState,
  | 'setActiveTool'
  | 'syncActiveTool'
  | 'setInspector'
  | 'setLayerEffectsCategory'
  | 'setInspectorCollapsed'
  | 'setViewportPreviewOpenFromUser'
  | 'setViewportPreviewOpenFromSync'
  | 'setSaveErrorMessage'
  | 'setSaveState'
  | 'setSessionId'
  | 'setImageData'
  | 'setPageTitle'
  | 'setCropReady'
  | 'setRichShapeToolSelection'
>;
export type EditorStoreToolActions = Pick<
  EditorState,
  | 'hydrateDefaults'
  | 'hydrateWorkspaceDefaults'
  | 'updateWorkspaceDefaults'
  | 'updateBrushSettings'
  | 'updateSelectionBrushSettings'
  | 'updateShapeSettings'
  | 'updateSelectionShapeSettings'
  | 'updateBlurSettings'
  | 'updateSelectionBlurSettings'
  | 'updateArrowSettings'
  | 'updateSelectionArrowSettings'
  | 'updateLineSettings'
  | 'updateSelectionLineSettings'
  | 'updateTextSettings'
  | 'updateSelectionTextSettings'
  | 'updateStepSettings'
  | 'updateSelectionStepSettings'
  | 'updateImageSettings'
  | 'updateSelectionImageSettings'
  | 'updateRasterToolSettings'
>;
export type EditorStoreLayoutActions = Pick<
  EditorState,
  'updateFrame' | 'setBrowserFrame' | 'updateWorkspace' | 'updateViewport'
>;

export function createEditorStoreSetterActions(set: EditorStoreSet): EditorStoreSetters {
  return {
    setActiveTool: (activeTool) => set({ activeTool, inspector: 'tool' }),
    syncActiveTool: (activeTool) => set({ activeTool }),
    setInspector: (inspector) => set({ inspector }),
    setLayerEffectsCategory: (layerEffectsCategory: EditorLayerEffectCategory) =>
      set({ layerEffectsCategory }),
    setInspectorCollapsed: (inspectorCollapsed) => set({ inspectorCollapsed }),
    setViewportPreviewOpenFromUser: (open) =>
      set((state) => createManualViewportPreviewPatch(state, open)),
    setViewportPreviewOpenFromSync: (viewportPreviewOpen) => set({ viewportPreviewOpen }),
    setSaveErrorMessage: (saveErrorMessage) => set({ saveErrorMessage }),
    setSaveState: (saveState) => set({ saveState }),
    setSessionId: (sessionId) => set({ sessionId }),
    setImageData: (imageData) => set({ imageData }),
    setPageTitle: (pageTitle) => set({ pageTitle }),
    setCropReady: (cropReady) => set({ cropReady }),
    setRichShapeToolSelection: (richShapeToolSelection) => set({ richShapeToolSelection }),
  };
}

export function createEditorStoreToolActions(set: EditorStoreSet): EditorStoreToolActions {
  return {
    hydrateDefaults: createHydrateDefaultsAction(set),
    hydrateWorkspaceDefaults: createWorkspaceDefaultsHydrator(set),
    updateWorkspaceDefaults: createWorkspaceDefaultsUpdater(set),
    ...createToolSettingsUpdaters(set),
    updateRasterToolSettings: createRasterToolSettingsUpdater(set),
  };
}

function createWorkspaceDefaultsHydrator(
  set: EditorStoreSet
): EditorStoreToolActions['hydrateWorkspaceDefaults'] {
  return (defaults) =>
    set((state) => {
      const workspaceDefaults = { ...state.workspaceDefaults, ...defaults };

      return {
        workspaceDefaults,
        workspace: state.workspaceBackgroundEdited
          ? state.workspace
          : {
              ...state.workspace,
              backgroundColor: workspaceDefaults.backgroundColor,
            },
      };
    });
}

function createWorkspaceDefaultsUpdater(
  set: EditorStoreSet
): EditorStoreToolActions['updateWorkspaceDefaults'] {
  return (patch) =>
    set((state) => ({
      workspaceDefaults: {
        ...state.workspaceDefaults,
        ...patch,
      },
    }));
}

export function createEditorStoreLayoutActions(set: EditorStoreSet): EditorStoreLayoutActions {
  return {
    updateFrame: (patch) =>
      set((state) => ({
        frame: normalizeEditorFrameSettings(createObjectPatch(state.frame, patch)),
      })),
    setBrowserFrame: (updates) =>
      set((state) => ({
        browserFrame: createObjectPatch<BrowserFrameState>(state.browserFrame, updates),
      })),
    updateWorkspace: (patch) =>
      set((state) => ({
        workspace: createObjectPatch<EditorWorkspaceSettings>(state.workspace, patch),
        ...(patch.backgroundColor === undefined ? {} : { workspaceBackgroundEdited: true }),
      })),
    updateViewport: (patch) =>
      set((state) => ({
        viewport: createObjectPatch<EditorViewportState>(state.viewport, patch),
      })),
  };
}
