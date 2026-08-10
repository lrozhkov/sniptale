import type React from 'react';
import type {
  BrowserFrameState,
  EditorFrameSettings,
  EditorWorkspaceSettings,
} from '../../features/editor/document/types';
import type { EditorRichShapeDocumentObject } from '../../features/editor/document/rich-shape';
import type { EditorToolSettings } from '../../features/editor/document/tool-settings-types';
import type { EditorRichShapeFormattingPatch } from '../controller/rich-shape-formatting';
import type { EditorRenderedImageOptions } from '../document/model/render-options';
import type { CompactSelectOption } from '../chrome/ui';
import type { EditorInspectorPresetHeaderState } from './presets';
import type { BackgroundGradientPreset } from './sidebar-shared';

export type EditorInspectorSizeDraft = { width: number; height: number };

export interface EditorInspectorColorActions {
  previewColor: (setter: (value: string) => void, color: string) => void;
  updateColor: (setter: (value: string) => void, color: string) => void;
}

export interface EditorInspectorToolPatchActions {
  applyStepPatch: (patch: Partial<EditorToolSettings['step']>) => void;
  previewStepPatch: (patch: Partial<EditorToolSettings['step']>) => void;
  applyImagePatch?: ((patch: Partial<EditorToolSettings['image']>) => void) | undefined;
  previewImagePatch?: ((patch: Partial<EditorToolSettings['image']>) => void) | undefined;
  applyRichShapePatch: (patch: EditorRichShapeFormattingPatch) => void;
  arrangeSelection: (action: 'forward' | 'backward' | 'front' | 'back') => void;
  commitPendingSelectionSettings: () => void;
}

export interface EditorInspectorRichShapeState {
  richShapeSelection: EditorRichShapeDocumentObject | null;
}

export interface EditorInspectorToolChoiceOptions {
  lineStyleOptions: CompactSelectOption<EditorToolSettings['image']['strokeStyle']>[];
  stepTypeOptions: CompactSelectOption<EditorToolSettings['step']['type']>[];
  stepAlphabetOptions: CompactSelectOption<'cyrillic' | 'latin'>[];
}

export interface EditorInspectorRecentColorState {
  recentColors: string[];
}

export interface EditorInspectorPaletteState {
  frameBackgroundPalette: readonly string[];
  shapeFillPalette: readonly string[];
  shapeStrokePalette: readonly string[];
  textColorPalette: readonly string[];
}

export interface EditorInspectorPresetHeaderBag {
  scenePresetHeader: EditorInspectorPresetHeaderState | null;
  toolPresetHeader: EditorInspectorPresetHeaderState | null;
}

export interface EditorInspectorNumberParser {
  toNumber: (value: string, fallback?: number) => number;
}

export interface EditorInspectorSelectionActionIcons {
  selectionDuplicateIcon: React.ReactNode;
  selectionDeleteIcon: React.ReactNode;
}

export interface EditorInspectorFrameMutationActions {
  syncBrowserFrame: (updates: Partial<BrowserFrameState>) => Promise<void> | void;
  insertOrUpdateBrowserFrame?: () => Promise<void> | void;
  setFrameDraft: React.Dispatch<React.SetStateAction<EditorFrameSettings>>;
  updateWorkspace: (patch: Partial<EditorWorkspaceSettings>) => void;
  applyWorkspaceColor: (color: string) => Promise<void> | void;
  saveWorkspaceColorAsDefault: () => Promise<void> | void;
  setUniformPadding: (value: number) => void;
  applyGradientPreset: (preset: BackgroundGradientPreset) => void;
  clearBackgroundImage: () => void;
  onPickBackgroundImage: () => void;
}

export interface EditorInspectorDocumentActions {
  onSaveImage: (options?: EditorRenderedImageOptions) => Promise<void> | void;
  onSaveImageAs: (options?: EditorRenderedImageOptions) => Promise<void> | void;
  onCopyRenderedImage: (options?: EditorRenderedImageOptions) => Promise<void> | void;
  copyRenderedImageDisabledReason?: string | null;
  onOpenImage: () => Promise<void> | void;
  onExportSession: () => Promise<void> | void;
  onImportSession: () => Promise<void> | void;
  onCloseDocument: () => Promise<void> | void;
  onApplyFrame: () => Promise<void> | void;
}
