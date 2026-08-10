import type React from 'react';
import type {
  EditorPreset,
  EditorPresetFamily,
  EditorPresetSettingsMap,
  EditorSceneBackgroundSettings,
} from '../document/presets';
import { createEditorFrameGradientCss } from '../document/frame-gradient';
import type { BorderPreset } from '../../highlighter/contracts';
import { serializePaintToCss } from '@sniptale/foundation/paint';

function wrapPreview(content: React.ReactNode) {
  return (
    <span className="flex h-5 w-10 items-center justify-center overflow-hidden rounded-[6px]">
      {content}
    </span>
  );
}

export function renderEditorPresetPreview<TKey extends EditorPresetFamily>(
  family: TKey,
  preset: EditorPreset<EditorPresetSettingsMap[TKey]>
) {
  if (family === 'step') {
    const settings = preset.settings as EditorPresetSettingsMap['step'];
    return wrapPreview(
      <span
        className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
        style={{ backgroundColor: settings.color }}
      >
        {settings.type === 'number' ? settings.value || '1' : settings.value || 'A'}
      </span>
    );
  }

  const settings = preset.settings as EditorSceneBackgroundSettings;
  const background =
    settings.backgroundMode === 'gradient'
      ? createEditorFrameGradientCss(settings)
      : settings.backgroundColor;
  return wrapPreview(
    <span className="block h-4 w-8 rounded-[5px] border border-white/20" style={{ background }} />
  );
}

export function renderBorderPresetPreview(preset: BorderPreset) {
  return wrapPreview(
    <span
      className="block h-4 w-8 rounded-[5px] border"
      style={{
        background: serializePaintToCss(preset.fillPaint),
        borderColor: preset.color,
        borderWidth: Math.max(1, Math.min(3, Math.round(preset.width / 2))),
      }}
    />
  );
}
