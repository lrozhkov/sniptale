import type { DEFAULT_BORDER_PRESET } from '../../composition/persistence/highlighter';
import type { EditorWorkspaceDefaults } from '../persistence/workspace';
import type {
  BrowserFrameState,
  EditorBrushSettings,
  EditorFrameSettings,
  EditorHistoryState,
  EditorLayerItem,
  EditorSelectionState,
  EditorShapeSettings,
  EditorTool,
  EditorViewportState,
  EditorWorkspaceSettings,
} from '../../features/editor/document/types';
import type { EditorLayerEffectCategory } from '../../features/editor/document/effects';
import type { EditorShapeSettingsOwner } from '../../features/editor/document/shape-settings';
import type { EditorToolSettings } from '../../features/editor/document/tool-settings-types';
import type {
  EditorRasterSelectionSummary,
  EditorRasterTargetSummary,
  EditorRasterToolSettings,
} from './raster-tools';
import type { EditorCustomShapeDefinition } from '../../features/editor/document/rich-shape/custom';

export type EditorInspector =
  | 'none'
  | 'file'
  | 'tool'
  | 'layer-effects'
  | 'image-size'
  | 'canvas-size'
  | 'frame'
  | 'browser-frame'
  | 'meta'
  | 'workspace'
  | 'grid';

interface EditorCropSelectionState {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface EditorRuntimePatch {
  layers?: EditorLayerItem[];
  selection?: EditorSelectionState;
  cropSelection?: EditorCropSelectionState | null;
  rasterSelection?: EditorRasterSelectionSummary;
  rasterTarget?: EditorRasterTargetSummary;
  history?: EditorHistoryState;
  viewport?: EditorViewportState;
  frame?: EditorFrameSettings;
  browserFrame?: BrowserFrameState;
}

export interface EditorRichShapeToolSelection {
  shapeId: string;
  customDefinition?: EditorCustomShapeDefinition;
  rough: boolean;
}

interface EditorUiState {
  activeTool: EditorTool;
  inspector: EditorInspector;
  inspectorCollapsed: boolean;
  layerEffectsCategory: EditorLayerEffectCategory;
  viewportPreviewOpen: boolean;
  viewportPreviewAutomationBlockedInSession: boolean;
  saveErrorMessage: string | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  sessionId: string | null;
  toolSettings: EditorToolSettings;
  selectionToolSettings: EditorToolSettings;
  rasterToolSettings: EditorRasterToolSettings;
  imageData: string | null;
  pageTitle: string;
  cropReady: boolean;
  cropSelection: EditorCropSelectionState | null;
  richShapeToolSelection: EditorRichShapeToolSelection | null;
}

interface EditorDocumentState {
  layers: EditorLayerItem[];
  selection: EditorSelectionState;
  rasterSelection: EditorRasterSelectionSummary;
  rasterTarget: EditorRasterTargetSummary;
  history: EditorHistoryState;
  viewport: EditorViewportState;
  frame: EditorFrameSettings;
  browserFrame: BrowserFrameState;
  workspace: EditorWorkspaceSettings;
  workspaceDefaults: EditorWorkspaceDefaults;
  workspaceBackgroundEdited: boolean;
}

interface EditorUiActions {
  setActiveTool: (tool: EditorTool) => void;
  syncActiveTool: (tool: EditorTool) => void;
  setInspector: (inspector: EditorInspector) => void;
  setLayerEffectsCategory: (category: EditorLayerEffectCategory) => void;
  setInspectorCollapsed: (collapsed: boolean) => void;
  setViewportPreviewOpenFromUser: (open: boolean) => void;
  setViewportPreviewOpenFromSync: (open: boolean) => void;
  setSaveErrorMessage: (message: string | null) => void;
  setSaveState: (saveState: EditorState['saveState']) => void;
  setSessionId: (sessionId: string | null) => void;
  setImageData: (imageData: string | null) => void;
  setPageTitle: (pageTitle: string) => void;
  setCropReady: (cropReady: boolean) => void;
  setRichShapeToolSelection: (selection: EditorRichShapeToolSelection | null) => void;
  hydrateDefaults: (options?: {
    borderPreset?: typeof DEFAULT_BORDER_PRESET;
    frame?: Partial<EditorFrameSettings>;
    toolSettings?: Partial<EditorToolSettings>;
  }) => void;
  hydrateWorkspaceDefaults: (defaults: EditorWorkspaceDefaults) => void;
  updateWorkspaceDefaults: (patch: Partial<EditorWorkspaceDefaults>) => void;
}

interface EditorToolActions {
  updateBrushSettings: (
    tool: 'pencil' | 'highlighter',
    patch: Partial<EditorBrushSettings>
  ) => void;
  updateSelectionBrushSettings: (
    tool: 'pencil' | 'highlighter',
    patch: Partial<EditorBrushSettings>
  ) => void;
  updateShapeSettings: (
    tool: EditorShapeSettingsOwner,
    patch: Partial<EditorShapeSettings>
  ) => void;
  updateSelectionShapeSettings: (
    tool: EditorShapeSettingsOwner,
    patch: Partial<EditorShapeSettings>
  ) => void;
  updateBlurSettings: (patch: Partial<EditorToolSettings['blur']>) => void;
  updateSelectionBlurSettings: (patch: Partial<EditorToolSettings['blur']>) => void;
  updateArrowSettings: (patch: Partial<EditorToolSettings['arrow']>) => void;
  updateSelectionArrowSettings: (patch: Partial<EditorToolSettings['arrow']>) => void;
  updateLineSettings: (patch: Partial<EditorToolSettings['line']>) => void;
  updateSelectionLineSettings: (patch: Partial<EditorToolSettings['line']>) => void;
  updateTextSettings: (patch: Partial<EditorToolSettings['text']>) => void;
  updateSelectionTextSettings: (patch: Partial<EditorToolSettings['text']>) => void;
  updateStepSettings: (patch: Partial<EditorToolSettings['step']>) => void;
  updateSelectionStepSettings: (patch: Partial<EditorToolSettings['step']>) => void;
  updateImageSettings: (patch: Partial<EditorToolSettings['image']>) => void;
  updateSelectionImageSettings: (patch: Partial<EditorToolSettings['image']>) => void;
  updateRasterToolSettings: (patch: Partial<EditorRasterToolSettings>) => void;
}

interface EditorDocumentActions {
  updateFrame: (patch: Partial<EditorFrameSettings>) => void;
  setBrowserFrame: (updates: Partial<BrowserFrameState>) => void;
  updateWorkspace: (patch: Partial<EditorWorkspaceSettings>) => void;
  updateViewport: (patch: Partial<EditorViewportState>) => void;
  syncRuntime: (patch: EditorRuntimePatch) => void;
  resetDocumentState: () => void;
}

export interface EditorState
  extends
    EditorUiState,
    EditorDocumentState,
    EditorUiActions,
    EditorToolActions,
    EditorDocumentActions {}
