import type React from 'react';

import type { EditorFrameSettings } from '../../../features/editor/document/types';
import type { EditorImageSettings } from '../../../features/editor/document/image-types';
import type { EditorInspectorPresetHeaderState } from '../presets';
import type { CompactSelectOption } from '../../chrome/ui';

export interface EditorInspectorFramePanelProps {
  scenePresetHeader: EditorInspectorPresetHeaderState | null;
  frameDraft: EditorFrameSettings;
  backgroundPreviewStyle: React.CSSProperties;
  framePaddingSummary: string;
  frameLayoutModeOptions: CompactSelectOption<EditorFrameSettings['layoutMode']>[];
  frameBackgroundModeOptions: CompactSelectOption<EditorFrameSettings['backgroundMode']>[];
  gradientPresets: Array<{ id: string; label: string; from: string; to: string; angle: number }>;
  frameBackgroundPalette: readonly string[];
  frameBackgroundImageFitOptions: CompactSelectOption<EditorFrameSettings['backgroundImageFit']>[];
  lineStyleOptions?: CompactSelectOption<EditorImageSettings['strokeStyle']>[] | undefined;
  recentColors: string[];
  shapeStrokePalette?: readonly string[] | undefined;
  toNumber: (value: string, fallback?: number) => number;
  setFrameDraft: React.Dispatch<React.SetStateAction<EditorFrameSettings>>;
  setLayoutMode: (value: EditorFrameSettings['layoutMode']) => void;
  setBackgroundMode: (value: EditorFrameSettings['backgroundMode']) => void;
  applyGradientPreset: (preset: {
    id: string;
    label: string;
    from: string;
    to: string;
    angle: number;
  }) => void;
  previewFramePatch: (patch: Partial<EditorFrameSettings>) => void;
  applyFramePatch: (patch: Partial<EditorFrameSettings>) => void;
  onPickBackgroundImage: () => void;
  onClearBackgroundImage: () => void;
  onApplyFrame: () => void;
}
