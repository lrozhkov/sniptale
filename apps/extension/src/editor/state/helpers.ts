import type { StateCreator } from 'zustand';
import type {
  BrowserFrameState,
  EditorFrameSettings,
  EditorLayerItem,
  EditorViewportState,
  EditorWorkspaceSettings,
} from '../../features/editor/document/types';
import type { EditorWorkspaceDefaults } from '../../features/editor/document/types';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_EDITOR_WORKSPACE_SETTINGS,
  normalizeEditorFrameSettings,
} from '../../features/editor/document/constants';
import type { EditorRuntimePatch, EditorState } from './types';
import type { DrawingToolDefaults } from '../../features/drawing/public';

export type EditorStoreSet = Parameters<StateCreator<EditorState>>[0];
type ToolSettingsTarget = 'toolSettings' | 'selectionToolSettings';
type ToolSettingsKey = 'pencil' | 'marker' | 'shape' | 'arrow' | 'text' | 'step' | 'image';
type ToolSettingsPatch = Pick<EditorState, 'toolSettings' | 'selectionToolSettings'>;
type RuntimeStatePatch = Pick<
  EditorState,
  | 'layers'
  | 'selection'
  | 'cropReady'
  | 'cropSelection'
  | 'history'
  | 'viewport'
  | 'frame'
  | 'browserFrame'
>;
type ResetDocumentState = Pick<
  EditorState,
  | 'activeTool'
  | 'frameAnnotationCreationKind'
  | 'inspector'
  | 'freshImageBackgroundPending'
  | 'inspectorCollapsed'
  | 'layerEffectsCategory'
  | 'viewportPreviewOpen'
  | 'showOutsideCanvas'
  | 'saveErrorMessage'
  | 'saveState'
  | 'selectionToolSettings'
  | 'imageData'
  | 'pageTitle'
  | 'cropReady'
  | 'cropSelection'
  | 'richShapeToolSelection'
  | 'canvasCropMode'
  | 'layers'
  | 'selection'
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

export function createDrawingToolSettingsPatch<Tool extends keyof DrawingToolDefaults>(
  state: EditorState,
  target: ToolSettingsTarget,
  tool: Tool,
  patch: Partial<DrawingToolDefaults[Tool]>
): ToolSettingsPatch {
  return {
    [target]: {
      ...state[target],
      [tool]: {
        ...state[target][tool],
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
    layers: patch.layers ? retainLayerProjections(state.layers, patch.layers) : state.layers,
    selection: patch.selection ?? state.selection,
    cropReady: patch.cropReady,
    cropSelection: patch.cropSelection,
    history: patch.history ?? state.history,
    viewport: patch.viewport ?? state.viewport,
    frame: patch.frame ? normalizeEditorFrameSettings(patch.frame) : state.frame,
    browserFrame: patch.browserFrame ?? state.browserFrame,
  };
}

function sameProjectionFields<T extends object>(previous: T, next: T): boolean {
  const keys = Object.keys(previous) as Array<keyof T>;
  return (
    keys.length === Object.keys(next).length &&
    keys.every((key) => Object.hasOwn(next, key) && Object.is(previous[key], next[key]))
  );
}

function sameProjectionItems<T extends object>(previous: T[] | undefined, next: T[] | undefined) {
  if (previous === next) return true;
  return (
    previous !== undefined &&
    next !== undefined &&
    previous.length === next.length &&
    previous.every((item, index) => sameProjectionFields(item, next[index]!))
  );
}

function sameLayerProjection(previous: EditorLayerItem, next: EditorLayerItem): boolean {
  const { effects: previousEffects, groupChildren: previousChildren, ...previousFields } = previous;
  const { effects: nextEffects, groupChildren: nextChildren, ...nextFields } = next;
  return (
    sameProjectionFields(previousFields, nextFields) &&
    sameProjectionItems(previousEffects, nextEffects) &&
    sameProjectionItems(previousChildren, nextChildren)
  );
}

function retainLayerProjections(previous: EditorLayerItem[], next: EditorLayerItem[]) {
  const previousById = new Map(previous.map((layer) => [layer.id, layer]));
  const retained = next.map((layer) => {
    const existing = previousById.get(layer.id);
    return existing && sameLayerProjection(existing, layer) ? existing : layer;
  });
  return previous.length === retained.length &&
    retained.every((layer, index) => layer === previous[index])
    ? previous
    : retained;
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
  | 'frameAnnotationCreationKind'
  | 'inspector'
  | 'freshImageBackgroundPending'
  | 'inspectorCollapsed'
  | 'layerEffectsCategory'
  | 'viewportPreviewOpen'
  | 'showOutsideCanvas'
  | 'saveErrorMessage'
  | 'saveState'
  | 'selectionToolSettings'
  | 'imageData'
  | 'pageTitle'
  | 'cropReady'
  | 'cropSelection'
  | 'richShapeToolSelection'
  | 'canvasCropMode'
> {
  return {
    activeTool: 'select',
    frameAnnotationCreationKind: null,
    inspector: 'file',
    freshImageBackgroundPending: false,
    inspectorCollapsed: false,
    layerEffectsCategory: 'adjustments',
    viewportPreviewOpen: state.viewportPreviewAutomationBlockedInSession
      ? state.viewportPreviewOpen
      : false,
    showOutsideCanvas: false,
    saveErrorMessage: null,
    saveState: 'idle',
    selectionToolSettings: state.toolSettings,
    imageData: null,
    pageTitle: '',
    cropReady: false,
    cropSelection: null,
    richShapeToolSelection: null,
    canvasCropMode: 'crop',
  };
}

function createResetDocumentCanvasState(
  state: EditorState,
  defaults: EditorStoreActionDefaults
): Pick<
  ResetDocumentState,
  | 'layers'
  | 'selection'
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
    history: defaults.initialHistory,
    viewport: defaults.initialViewport,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    browserFrame: {
      ...DEFAULT_BROWSER_FRAME_STATE,
      faviconDataUrl: null,
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
    hideSelectionWhileDragging: defaults.hideSelectionWhileDragging,
  };
}

export function createObjectPatch<
  T extends BrowserFrameState | EditorWorkspaceSettings | EditorViewportState | EditorFrameSettings,
>(current: T, patch: Partial<T>): T {
  return {
    ...current,
    ...patch,
  };
}
