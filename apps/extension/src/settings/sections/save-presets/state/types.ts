import type { DragEvent, ReactNode } from 'react';

import type { Settings } from '../../../../contracts/settings';
import type { CaptureActionType, SavePreset } from '../../../../contracts/settings';

export interface SavePresetsSyncState {
  captureAction: CaptureActionType;
  defaultExportPresetId: string | null;
  defaultImagePresetId: string | null;
  defaultVideoPresetId: string | null;
  isLoading: boolean;
  presets: SavePreset[];
  saveCapturesToGallery: boolean;
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
  setSaveCapturesToGallery: (value: boolean) => void;
  settings: Settings;
  updateSettings: (value: Partial<Settings>) => Promise<void>;
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

export interface SavePresetsDragState {
  draggedId: string | null;
  setDraggedId: (value: string | null) => void;
  setDragOverId: (value: string | null) => void;
}

export interface SavePresetsDragUiState extends SavePresetsDragState {
  dragOverId: string | null;
  hoveredPresetId: string | null;
  setHoveredPresetId: (value: string | null) => void;
}

export interface SavePresetsActions {
  confirmDeletePreset: () => Promise<void>;
  handleCaptureActionChange: (value: CaptureActionType) => Promise<void>;
  handleDefaultPresetChange: (
    field: 'defaultImagePresetId' | 'defaultVideoPresetId' | 'defaultExportPresetId',
    value: string,
    onChange: (id: string | null) => void,
    previousValue: string | null,
    successKey:
      | 'savePresets.messages.defaultExportUpdated'
      | 'savePresets.messages.defaultImageUpdated'
      | 'savePresets.messages.defaultVideoUpdated'
  ) => Promise<void>;
  handleDeletePreset: (preset: SavePreset) => void;
  handleDrop: (targetId: string) => Promise<void>;
  handleSavePreset: (name: string, path: string, enabled: boolean) => Promise<void>;
  handleTogglePresetEnabled: (preset: SavePreset) => Promise<void>;
  handleToggleSaveToGallery: () => Promise<void>;
}

interface SavePresetsRowDragHandlers {
  onDragEnd: () => void;
  onDragLeave: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>, id: string) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>, id: string) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, id: string) => void;
}

export interface SavePresetsRowHandlers extends SavePresetsRowDragHandlers {
  onDelete: (preset: SavePreset) => void;
  onEdit: (preset?: SavePreset) => void;
  onHoverChange: (id: string | null) => void;
  onToggleEnabled: (preset: SavePreset) => Promise<void>;
}

interface SavePresetsRowState {
  draggedId: string | null;
  dragOverId: string | null;
  hoveredPresetId: string | null;
}

export interface SavePresetsRowProps extends SavePresetsRowHandlers, SavePresetsRowState {
  preset: SavePreset;
}

export interface SavePresetsRowShellProps extends SavePresetsRowDragHandlers {
  children: ReactNode;
  className: string;
  onHoverChange: (id: string | null) => void;
  presetId: string;
}

export interface SavePresetsListBodyProps extends SavePresetsRowHandlers, SavePresetsRowState {
  presets: SavePreset[];
}

export interface SavePresetsListProps extends SavePresetsListBodyProps {
  confirmDelete: SavePreset | null;
  confirmDeletePreset: () => Promise<void>;
  editingPreset?: SavePreset;
  isEditorOpen: boolean;
  onCloseDeleteDialog: () => void;
  onCloseEditor: () => void;
  onSavePreset: (name: string, path: string, enabled: boolean) => Promise<void>;
  presetCountLabel: string;
}
