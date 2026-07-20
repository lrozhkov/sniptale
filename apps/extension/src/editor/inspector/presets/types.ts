import type React from 'react';
import type { CompactSelectOption } from '../../chrome/ui';

export type EditorInspectorPresetViewMode = 'parameters' | 'templates';

export interface EditorInspectorPresetSavePanelState {
  canSave: boolean;
  mode: 'create' | 'overwrite';
  name: string;
  overwriteOptions: CompactSelectOption<string>[];
  overwriteDisabled: boolean;
  overwriteHint?: string;
  overwriteTargetId: string;
  onCancel: () => void;
  onModeChange: (mode: 'create' | 'overwrite') => void;
  onNameChange: (name: string) => void;
  onOverwriteTargetChange: (presetId: string) => void;
  onSave: () => void;
}

export interface EditorInspectorTemplateCardState {
  id: string;
  label: string;
  preview: React.ReactNode;
  selected: boolean;
  system?: boolean;
  onApply: () => void;
}

export interface EditorInspectorTemplateGroupState {
  id: 'system' | 'user' | string;
  label: string;
  templates: EditorInspectorTemplateCardState[];
}

export interface EditorInspectorPresetHeaderState {
  activeView: EditorInspectorPresetViewMode;
  groups?: EditorInspectorTemplateGroupState[];
  savePanel: EditorInspectorPresetSavePanelState | null;
  saveDisabled: boolean;
  templates: EditorInspectorTemplateCardState[];
  onViewChange: (view: EditorInspectorPresetViewMode) => void;
  onOpenSavePanel: () => void;
}
