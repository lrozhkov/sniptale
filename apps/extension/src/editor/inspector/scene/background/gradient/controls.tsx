import React from 'react';
import type { EditorFrameSettings } from '../../../../../features/editor/document/types';
import {
  createEditorFrameGradientPatch,
  normalizeEditorFrameGradientColorStops,
  normalizeEditorFrameGradientStops,
} from '../../../../../features/editor/document/frame-gradient';
import { translate } from '../../../../../platform/i18n';
import { ProductGradientPresetGrid } from '../../../../../ui/gradient-preset-grid';
import { NumericRow } from '../../../../chrome/ui';
import { EditorGradientControls } from '../../../gradient';

export const GradientPresetGrid: React.FC<{
  applyGradientPreset: (preset: {
    id: string;
    label: string;
    from: string;
    to: string;
    angle: number;
  }) => void;
  frameDraft: EditorFrameSettings;
  gradientPresets: Array<{ id: string; label: string; from: string; to: string; angle: number }>;
}> = ({ applyGradientPreset, frameDraft, gradientPresets }) => {
  const frameStops = normalizeEditorFrameGradientStops(frameDraft);

  return (
    <ProductGradientPresetGrid
      presets={gradientPresets}
      onSelect={applyGradientPreset}
      isActive={(preset) =>
        frameStops.length === 2 &&
        frameStops[0] === preset.from &&
        frameStops[1] === preset.to &&
        frameDraft.backgroundGradientAngle === preset.angle
      }
    />
  );
};

export const GradientColorControls: React.FC<{
  applyFramePatch: (patch: Partial<EditorFrameSettings>) => void;
  frameBackgroundPalette: readonly string[];
  frameDraft: EditorFrameSettings;
  previewFramePatch: (patch: Partial<EditorFrameSettings>) => void;
  recentColors: string[];
}> = ({ applyFramePatch, frameBackgroundPalette, frameDraft, previewFramePatch, recentColors }) => {
  return (
    <EditorGradientControls
      angle={frameDraft.backgroundGradientAngle}
      stops={normalizeEditorFrameGradientColorStops(frameDraft)}
      palette={frameBackgroundPalette}
      recentColors={recentColors}
      onStopsChange={(stops) => applyFramePatch(createEditorFrameGradientPatch(frameDraft, stops))}
      onPreviewStopsChange={(stops) =>
        previewFramePatch(createEditorFrameGradientPatch(frameDraft, stops))
      }
      onAngleChange={(backgroundGradientAngle) => applyFramePatch({ backgroundGradientAngle })}
    />
  );
};

export const GradientAngleControls: React.FC<{
  applyFramePatch: (patch: Partial<EditorFrameSettings>) => void;
  frameDraft: EditorFrameSettings;
  toNumber: (value: string, fallback?: number) => number;
}> = ({ applyFramePatch, frameDraft }) => (
  <div className="space-y-2">
    <NumericRow
      label={translate('editor.scene.gradientAngleLabel')}
      min={0}
      max={360}
      step={5}
      precision={0}
      unit="deg"
      value={frameDraft.backgroundGradientAngle}
      onPreviewValue={(backgroundGradientAngle) =>
        applyFramePatch({
          backgroundGradientAngle,
        })
      }
      onCommitValue={(backgroundGradientAngle) =>
        applyFramePatch({
          backgroundGradientAngle,
        })
      }
      scrub={{ min: 0, max: 360, step: 5 }}
    />
  </div>
);
