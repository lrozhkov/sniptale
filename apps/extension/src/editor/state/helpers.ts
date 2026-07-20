import type { StateCreator } from 'zustand';
import type {
  BrowserFrameState,
  EditorFrameSettings,
  EditorViewportState,
  EditorWorkspaceSettings,
} from '../../features/editor/document/types';
import type { EditorWorkspaceDefaults } from '../persistence/workspace';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_EDITOR_WORKSPACE_SETTINGS,
  normalizeEditorFrameSettings,
} from '../../features/editor/document/constants';
import type { EditorRasterToolSettings } from './raster-tools';
import {
  EMPTY_EDITOR_RASTER_SELECTION_SUMMARY,
  EMPTY_EDITOR_RASTER_TARGET_SUMMARY,
} from './raster-tools';
import type { EditorRuntimePatch, EditorState } from './types';

export type EditorStoreSet = Parameters<StateCreator<EditorState>>[0];
type ToolSettingsTarget = 'toolSettings' | 'selectionToolSettings';
type ToolSettingsKey =
  | 'pencil'
  | 'highlighter'
  | 'rectangle'
  | 'ellipse'
  | 'blur'
  | 'arrow'
  | 'line'
  | 'text'
  | 'step'
  | 'image';
type ToolSettingsPatch = Pick<EditorState, 'toolSettings' | 'selectionToolSettings'>;
type RuntimeStatePatch = Pick<
  EditorState,
  | 'layers'
  | 'selection'
  | 'cropSelection'
  | 'rasterSelection'
  | 'rasterTarget'
  | 'history'
  | 'viewport'
  | 'frame'
  | 'browserFrame'
>;
type ResetDocumentState = Pick<
  EditorState,
  | 'activeTool'
  | 'inspector'
  | 'inspectorCollapsed'
  | 'layerEffectsCategory'
  | 'viewportPreviewOpen'
  | 'saveErrorMessage'
  | 'saveState'
  | 'selectionToolSettings'
  | 'imageData'
  | 'pageTitle'
  | 'cropReady'
  | 'cropSelection'
  | 'richShapeToolSelection'
  | 'layers'
  | 'selection'
  | 'rasterSelection'
  | 'rasterTarget'
  | 'history'
  | 'viewport'
  | 'frame'
  | 'browserFrame'
  | 'workspace'
  | 'workspaceBackgroundEdited'
>;

export interface EditorStoreActionDefaults {
  initialSelection: EditorState['selection'];
  initialHistory: EditorState['history'];
  initialViewport: EditorState['viewport'];
}

type ViewportPreviewPatch = Pick<
  EditorState,
  'viewportPreviewOpen' | 'viewportPreviewAutomationBlockedInSession'
>;

export function createToolSettingsPatch<Key extends ToolSettingsKey>(
  state: EditorState,
  target: ToolSettingsTarget,
  key: Key,
  patch: Partial<EditorState['toolSettings'][Key]>
): ToolSettingsPatch {
  return {
    [target]: {
      ...state[target],
      [key]: {
        ...state[target][key],
        ...patch,
      },
    },
  } as ToolSettingsPatch;
}

export function createRuntimePatch(
  state: EditorState,
  patch: EditorRuntimePatch
): RuntimeStatePatch {
  return {
    layers: patch.layers ?? state.layers,
    selection: patch.selection ?? state.selection,
    cropSelection: patch.cropSelection === undefined ? state.cropSelection : patch.cropSelection,
    rasterSelection: patch.rasterSelection ?? state.rasterSelection,
    rasterTarget: patch.rasterTarget ?? state.rasterTarget,
    history: patch.history ?? state.history,
    viewport: patch.viewport ?? state.viewport,
    frame: patch.frame ? normalizeEditorFrameSettings(patch.frame) : state.frame,
    browserFrame: patch.browserFrame ?? state.browserFrame,
  };
}

export function createManualViewportPreviewPatch(
  _state: EditorState,
  open: boolean
): ViewportPreviewPatch {
  return {
    viewportPreviewOpen: open,
    viewportPreviewAutomationBlockedInSession: true,
  };
}

export function createResetDocumentState(
  state: EditorState,
  defaults: EditorStoreActionDefaults
): ResetDocumentState {
  return {
    ...createResetDocumentUiState(state),
    ...createResetDocumentCanvasState(state, defaults),
  };
}

function createResetDocumentUiState(
  state: EditorState
): Pick<
  ResetDocumentState,
  | 'activeTool'
  | 'inspector'
  | 'inspectorCollapsed'
  | 'layerEffectsCategory'
  | 'viewportPreviewOpen'
  | 'saveErrorMessage'
  | 'saveState'
  | 'selectionToolSettings'
  | 'imageData'
  | 'pageTitle'
  | 'cropReady'
  | 'cropSelection'
  | 'richShapeToolSelection'
> {
  return {
    activeTool: 'select',
    inspector: 'file',
    inspectorCollapsed: false,
    layerEffectsCategory: 'adjustments',
    viewportPreviewOpen: state.viewportPreviewAutomationBlockedInSession
      ? state.viewportPreviewOpen
      : false,
    saveErrorMessage: null,
    saveState: 'idle',
    selectionToolSettings: state.toolSettings,
    imageData: null,
    pageTitle: '',
    cropReady: false,
    cropSelection: null,
    richShapeToolSelection: null,
  };
}

function createResetDocumentCanvasState(
  state: EditorState,
  defaults: EditorStoreActionDefaults
): Pick<
  ResetDocumentState,
  | 'layers'
  | 'selection'
  | 'rasterSelection'
  | 'rasterTarget'
  | 'history'
  | 'viewport'
  | 'frame'
  | 'browserFrame'
  | 'workspace'
  | 'workspaceBackgroundEdited'
> {
  return {
    layers: [],
    selection: defaults.initialSelection,
    rasterSelection: EMPTY_EDITOR_RASTER_SELECTION_SUMMARY,
    rasterTarget: EMPTY_EDITOR_RASTER_TARGET_SUMMARY,
    history: defaults.initialHistory,
    viewport: defaults.initialViewport,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    browserFrame: {
      ...DEFAULT_BROWSER_FRAME_STATE,
      faviconDataUrl: state.browserFrame.faviconDataUrl ?? null,
      url: state.browserFrame.url,
    },
    workspace: createWorkspaceSettingsFromDefaults(state.workspaceDefaults),
    workspaceBackgroundEdited: false,
  };
}

function createWorkspaceSettingsFromDefaults(
  defaults: EditorWorkspaceDefaults
): EditorWorkspaceSettings {
  return {
    ...DEFAULT_EDITOR_WORKSPACE_SETTINGS,
    backgroundColor: defaults.backgroundColor,
  };
}

export function createObjectPatch<
  T extends
    | BrowserFrameState
    | EditorWorkspaceSettings
    | EditorViewportState
    | EditorFrameSettings
    | EditorRasterToolSettings,
>(current: T, patch: Partial<T>): T {
  return {
    ...current,
    ...patch,
  };
}
