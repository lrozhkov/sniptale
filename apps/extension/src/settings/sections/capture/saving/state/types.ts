import type { Settings, SettingsPatch } from '../../../../../contracts/settings';
import type { CaptureActionType, SavePreset } from '../../../../../contracts/settings';

export interface SavePresetsSyncState {
  captureAction: CaptureActionType;
  defaultExportPresetId: string | null;
  defaultImagePresetId: string | null;
  defaultVideoPresetId: string | null;
  isLoading: boolean;
  presets: SavePreset[];
  setCaptureAction: (value: CaptureActionType) => void;
  setDefaultExportPresetId: (
    value: string | null | ((prev: string | null) => string | null)
  ) => void;
  setDefaultImagePresetId: (
    value: string | null | ((prev: string | null) => string | null)
  ) => void;
  setDefaultVideoPresetId: (
    value: string | null | ((prev: string | null) => string | null)
  ) => void;
  setPresets: (value: SavePreset[]) => void;
  settings: Settings;
  updateSettings: (value: SettingsPatch) => Promise<void>;
}

export interface SavePresetsDialogState {
  closeDeleteDialog: () => void;
  closeEditor: () => void;
  confirmDelete: SavePreset | null;
  editingPreset?: SavePreset;
}

export interface SavePresetsDialogsState extends SavePresetsDialogState {
  isEditorOpen: boolean;
  openEditor: (preset?: SavePreset) => void;
  setConfirmDelete: (preset: SavePreset | null) => void;
  setEditingPreset: (preset: SavePreset | undefined) => void;
  setIsEditorOpen: (value: boolean) => void;
}

export interface SavePresetsActions {
  confirmDeletePreset: () => Promise<void>;
  handleCaptureActionChange: (value: CaptureActionType) => Promise<void>;
  handleDefaultPresetChange: (
    field: 'defaultImagePresetId' | 'defaultVideoPresetId' | 'defaultExportPresetId',
    value: string,
    onChange: (id: string | null) => void,
    previousValue: string | null
  ) => Promise<void>;
  handleDeletePreset: (preset: SavePreset) => void;
  handleMoveBefore: (presetId: string, beforePresetId: string | null) => Promise<void>;
  handleSavePreset: (name: string, path: string, enabled: boolean) => Promise<void>;
  handleTogglePresetEnabled: (preset: SavePreset) => Promise<void>;
}

export interface SavePresetsRowHandlers {
  onDelete: (preset: SavePreset) => void;
  onEdit: (preset?: SavePreset) => void;
  onToggleEnabled: (preset: SavePreset) => Promise<void>;
}

export interface SavePresetsListProps extends SavePresetsRowHandlers {
  confirmDelete: SavePreset | null;
  confirmDeletePreset: () => Promise<void>;
  editingPreset?: SavePreset;
  isEditorOpen: boolean;
  onCloseDeleteDialog: () => void;
  onCloseEditor: () => void;
  onSavePreset: (name: string, path: string, enabled: boolean) => Promise<void>;
  presets: SavePreset[];
  onMoveBefore: (presetId: string, beforePresetId: string | null) => Promise<void>;
}
