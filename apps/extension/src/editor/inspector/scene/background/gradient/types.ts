import type { EditorFrameSettings } from '../../../../../features/editor/document/types';

type GradientPreset = {
  id: string;
  label: string;
  from: string;
  to: string;
  angle: number;
};

export type EditorInspectorFrameBackgroundGradientEditorProps = {
  applyFramePatch: (patch: Partial<EditorFrameSettings>) => void;
  applyGradientPreset: (preset: GradientPreset) => void;
  frameBackgroundPalette: readonly string[];
  frameDraft: EditorFrameSettings;
  gradientPresets: GradientPreset[];
  previewFramePatch: (patch: Partial<EditorFrameSettings>) => void;
  recentColors: string[];
  toNumber: (value: string, fallback?: number) => number;
};

export type EditorInspectorFrameBackgroundGradientPresetGridProps = Pick<
  EditorInspectorFrameBackgroundGradientEditorProps,
  'applyGradientPreset' | 'frameDraft' | 'gradientPresets'
>;

export type EditorInspectorFrameBackgroundGradientColorControlsProps = Pick<
  EditorInspectorFrameBackgroundGradientEditorProps,
  'applyFramePatch' | 'frameBackgroundPalette' | 'frameDraft' | 'previewFramePatch' | 'recentColors'
>;
