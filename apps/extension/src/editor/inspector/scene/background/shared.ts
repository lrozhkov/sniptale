import type { EditorFrameSettings } from '../../../../features/editor/document/types';

interface EditorInspectorFrameBackgroundGradientPreset {
  id: string;
  label: string;
  from: string;
  to: string;
  angle: number;
}

export interface EditorInspectorFrameBackgroundEditorProps {
  applyFramePatch: (patch: Partial<EditorFrameSettings>) => void;
  applyGradientPreset: (preset: EditorInspectorFrameBackgroundGradientPreset) => void;
  frameBackgroundImageFitOptions: Array<{
    value: EditorFrameSettings['backgroundImageFit'];
    label: string;
  }>;
  frameBackgroundPalette: readonly string[];
  frameDraft: EditorFrameSettings;
  gradientPresets: EditorInspectorFrameBackgroundGradientPreset[];
  onClearBackgroundImage: () => void;
  onPickBackgroundImage: () => void;
  previewFramePatch: (patch: Partial<EditorFrameSettings>) => void;
  recentColors: string[];
  toNumber: (value: string, fallback?: number) => number;
}
