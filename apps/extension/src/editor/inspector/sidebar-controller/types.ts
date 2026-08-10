import type { Dispatch, SetStateAction } from 'react';
import type { SavePreset } from '../../../contracts/settings';
import type { EditorWorkspaceDefaults } from '../../persistence/workspace';
import type {
  BrowserFrameState,
  EditorFrameSettings,
  EditorSelectionState,
  EditorTool,
  EditorWorkspaceSettings,
} from '../../../features/editor/document/types';
import type { EditorToolSettings } from '../../../features/editor/document/tool-settings-types';
import type { EditorInspectorConfirmDialogState } from '../content/types';

export interface SidebarActionArgs {
  activeTool: EditorTool;
  browserFrame: BrowserFrameState;
  confirmOpenStorageManager: (dialog: EditorInspectorConfirmDialogState) => Promise<boolean>;
  defaultImagePresetId: string | null;
  frameDraft: EditorFrameSettings;
  savePresets: SavePreset[];
  selection: EditorSelectionState;
  setBrowserFrame: (updates: Partial<BrowserFrameState>) => void;
  setFrameDraft: Dispatch<SetStateAction<EditorFrameSettings>>;
  setWorkspaceColorError: (message: string | null) => void;
  setWorkspaceDefaultSavePending: (pending: boolean) => void;
  updateImageSettings: (patch: Partial<EditorToolSettings['image']>) => void;
  updateSelectionImageSettings: (patch: Partial<EditorToolSettings['image']>) => void;
  updateSelectionStepSettings: (patch: Partial<EditorToolSettings['step']>) => void;
  updateStepSettings: (patch: Partial<EditorToolSettings['step']>) => void;
  updateWorkspace: (patch: Partial<EditorWorkspaceSettings>) => void;
  updateWorkspaceDefaults: (patch: Partial<EditorWorkspaceDefaults>) => void;
  workspace: EditorWorkspaceSettings;
  workspaceDefaultColor: string;
}
