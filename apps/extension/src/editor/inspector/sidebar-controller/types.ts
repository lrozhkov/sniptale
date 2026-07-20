import type { Dispatch, SetStateAction } from 'react';
import type { BorderPreset } from '../../../features/highlighter/contracts';
import type { SavePreset } from '../../../contracts/settings';
import type { EditorWorkspaceDefaults } from '../../persistence/workspace';
import type {
  BrowserFrameState,
  EditorFrameSettings,
  EditorSelectionState,
  EditorShapeSettings,
  EditorTool,
  EditorWorkspaceSettings,
} from '../../../features/editor/document/types';
import type {
  EditorShapeSettingsOwner,
  EditorShapeTool,
} from '../../../features/editor/document/shape-settings';
import type { EditorToolSettings } from '../../../features/editor/document/tool-settings-types';
import type { ImageEditorController } from '../../controller';
import type { EditorInspectorConfirmDialogState } from '../content/types';

export interface SidebarToolSettingTargetArgs {
  activeTool: EditorTool;
  selection: EditorSelectionState;
  updateBlurSettings: (patch: Partial<EditorToolSettings['blur']>) => void;
  updateArrowSettings: (patch: Partial<EditorToolSettings['arrow']>) => void;
  updateLineSettings?: (patch: Partial<EditorToolSettings['line']>) => void;
  updateBrushSettings: (
    tool: 'pencil' | 'highlighter',
    patch: Partial<EditorToolSettings['pencil']>
  ) => void;
  updateSelectionBlurSettings: (patch: Partial<EditorToolSettings['blur']>) => void;
  updateSelectionArrowSettings: (patch: Partial<EditorToolSettings['arrow']>) => void;
  updateSelectionLineSettings?: (patch: Partial<EditorToolSettings['line']>) => void;
  updateSelectionBrushSettings: (
    tool: 'pencil' | 'highlighter',
    patch: Partial<EditorToolSettings['pencil']>
  ) => void;
  updateSelectionShapeSettings: (
    tool: EditorShapeSettingsOwner,
    patch: Partial<EditorShapeSettings>
  ) => void;
  updateSelectionStepSettings: (patch: Partial<EditorToolSettings['step']>) => void;
  updateSelectionTextSettings: (patch: Partial<EditorToolSettings['text']>) => void;
  updateSelectionImageSettings?: (patch: Partial<EditorToolSettings['image']>) => void;
  updateShapeSettings: (
    tool: EditorShapeSettingsOwner,
    patch: Partial<EditorShapeSettings>
  ) => void;
  updateStepSettings: (patch: Partial<EditorToolSettings['step']>) => void;
  updateTextSettings: (patch: Partial<EditorToolSettings['text']>) => void;
  updateImageSettings?: (patch: Partial<EditorToolSettings['image']>) => void;
}

export interface ResolvedToolSettingTargets {
  arrow: (patch: Partial<EditorToolSettings['arrow']>) => void;
  line?: ((patch: Partial<EditorToolSettings['line']>) => void) | undefined;
  blur: (patch: Partial<EditorToolSettings['blur']>) => void;
  brush: (tool: 'pencil' | 'highlighter', patch: Partial<EditorToolSettings['pencil']>) => void;
  preset?: (patch: {
    shape: Partial<EditorShapeSettings>;
    step: Partial<EditorToolSettings['step']>;
  }) => void;
  shape: (patch: Partial<EditorShapeSettings>) => void;
  step: (patch: Partial<EditorToolSettings['step']>) => void;
  text: (patch: Partial<EditorToolSettings['text']>) => void;
  image?: (patch: Partial<EditorToolSettings['image']>) => void;
}

export interface SidebarUtilityActionArgs {
  borderPresets: BorderPreset[];
  controller: Pick<
    ImageEditorController,
    | 'exportDocument'
    | 'previewActiveSettingsOnSelection'
    | 'refreshActiveToolSettingsPreview'
    | 'renderToDataUrl'
    | 'withHistoryMuted'
  >;
  confirmOpenStorageManager: (dialog: EditorInspectorConfirmDialogState) => Promise<boolean>;
  defaultImagePresetId: string | null;
  hasImage: boolean;
  rememberRecentColor: (color: string) => Promise<void>;
  savePresets: SavePreset[];
  setFrameDraft: Dispatch<SetStateAction<EditorFrameSettings>>;
  syncBrowserFrame: (updates: Partial<BrowserFrameState>) => Promise<void>;
  insertOrUpdateBrowserFrame?: () => Promise<void>;
  targets: ResolvedToolSettingTargets;
}

export interface SidebarActionArgs extends SidebarToolSettingTargetArgs {
  browserFrame: BrowserFrameState;
  confirmOpenStorageManager: SidebarUtilityActionArgs['confirmOpenStorageManager'];
  defaultImagePresetId: string | null;
  frameDraft: EditorFrameSettings;
  savePresets: SavePreset[];
  setFrameDraft: Dispatch<SetStateAction<EditorFrameSettings>>;
  setBrowserFrame: (updates: Partial<BrowserFrameState>) => void;
  shapeSettings: EditorShapeSettings;
  shapeTool: EditorShapeTool;
  textSettings: EditorToolSettings['text'];
  updateWorkspace: (patch: Partial<EditorWorkspaceSettings>) => void;
  updateWorkspaceDefaults: (patch: Partial<EditorWorkspaceDefaults>) => void;
  workspace: EditorWorkspaceSettings;
  workspaceDefaultColor: string;
  setWorkspaceColorError: (message: string | null) => void;
  setWorkspaceDefaultSavePending: (pending: boolean) => void;
}
