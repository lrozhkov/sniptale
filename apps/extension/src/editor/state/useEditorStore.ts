import { create } from 'zustand';
import type {
  EditorHistoryState,
  EditorSelectionState,
  EditorViewportState,
} from '../../features/editor/document/types';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_EDITOR_TOOL_SETTINGS,
  DEFAULT_EDITOR_WORKSPACE_SETTINGS,
} from '../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../composition/persistence/highlighter';
import { DEFAULT_EDITOR_WORKSPACE_DEFAULTS } from '../persistence/workspace';
import { createEditorStoreActions } from './actions';
import {
  DEFAULT_EDITOR_RASTER_TOOL_SETTINGS,
  EMPTY_EDITOR_RASTER_SELECTION_SUMMARY,
  EMPTY_EDITOR_RASTER_TARGET_SUMMARY,
} from './raster-tools';
import type { EditorState } from './types';

const initialToolSettings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET);

const initialSelection: EditorSelectionState = {
  hasSelection: false,
  selectedObjectCount: 0,
  selectedObjectType: null,
  selectedObjectId: null,
  selectedObjectIds: [],
  selectedObjectLocked: false,
  selectedObjectWidth: null,
  selectedObjectHeight: null,
};

const initialHistory: EditorHistoryState = {
  canUndo: false,
  canRedo: false,
  index: 0,
  size: 1,
};

const initialViewport: EditorViewportState = {
  zoomPercent: 100,
  canvasWidth: 0,
  canvasHeight: 0,
  sourceWidth: 0,
  sourceHeight: 0,
  sourceName: null,
  viewportWidth: 0,
  viewportHeight: 0,
  scrollLeft: 0,
  scrollTop: 0,
  scaledCanvasWidth: 0,
  scaledCanvasHeight: 0,
  canvasOffsetLeft: 0,
  canvasOffsetTop: 0,
};

export const useEditorStore = create<EditorState>()((set) => ({
  activeTool: 'select',
  inspector: 'file',
  inspectorCollapsed: false,
  layerEffectsCategory: 'adjustments',
  viewportPreviewOpen: false,
  viewportPreviewAutomationBlockedInSession: false,
  saveErrorMessage: null,
  saveState: 'idle',
  sessionId: null,
  toolSettings: initialToolSettings,
  selectionToolSettings: initialToolSettings,
  rasterToolSettings: DEFAULT_EDITOR_RASTER_TOOL_SETTINGS,
  imageData: null,
  pageTitle: '',
  cropReady: false,
  cropSelection: null,
  richShapeToolSelection: null,
  layers: [],
  selection: initialSelection,
  rasterSelection: EMPTY_EDITOR_RASTER_SELECTION_SUMMARY,
  rasterTarget: EMPTY_EDITOR_RASTER_TARGET_SUMMARY,
  history: initialHistory,
  viewport: initialViewport,
  frame: DEFAULT_EDITOR_FRAME_SETTINGS,
  browserFrame: DEFAULT_BROWSER_FRAME_STATE,
  workspace: DEFAULT_EDITOR_WORKSPACE_SETTINGS,
  workspaceDefaults: DEFAULT_EDITOR_WORKSPACE_DEFAULTS,
  workspaceBackgroundEdited: false,
  ...createEditorStoreActions(set, {
    initialSelection,
    initialHistory,
    initialViewport,
  }),
}));
