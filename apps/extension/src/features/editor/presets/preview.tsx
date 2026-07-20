import type React from 'react';
import type {
  EditorPreset,
  EditorPresetFamily,
  EditorPresetSettingsMap,
  EditorSceneBackgroundSettings,
} from '../document/presets';
import { createEditorFrameGradientCss } from '../document/frame-gradient';
import type { BorderPreset } from '../../highlighter/contracts';

function getAlphaColor(hexColor: string, opacity: number): string {
  const normalizedOpacity = Math.max(0, Math.min(1, opacity));
  const clamped = Math.round(normalizedOpacity * 255)
    .toString(16)
    .padStart(2, '0');

  return `${hexColor}${clamped}`;
}

function wrapPreview(content: React.ReactNode) {
  return (
    <span className="flex h-5 w-10 items-center justify-center overflow-hidden rounded-[6px]">
      {content}
    </span>
  );
}

function renderBrushPreview(
  settings: EditorPresetSettingsMap['pencil'] | EditorPresetSettingsMap['highlighter']
) {
  return wrapPreview(
    <span
      className="block h-[3px] rounded-full"
      style={{
        backgroundColor: getAlphaColor(settings.color, settings.opacity),
        width: `${Math.min(100, Math.max(28, settings.width * 6))}%`,
      }}
    />
  );
}

function renderShapePreview(settings: EditorPresetSettingsMap['ellipse']) {
  return wrapPreview(
    <span
      className="block h-4 w-7 rounded-[5px] border"
      style={{
        backgroundColor: getAlphaColor(settings.fillColor, settings.fillOpacity),
        borderColor: getAlphaColor(settings.strokeColor, settings.strokeOpacity),
        borderWidth: Math.max(1, Math.min(3, Math.round(settings.strokeWidth / 2))),
      }}
    />
  );
}

function renderArrowPreview(settings: EditorPresetSettingsMap['arrow']) {
  return wrapPreview(
    <svg viewBox="0 0 44 20" className="h-5 w-10" aria-hidden="true">
      <path
        d="M6 14 L30 6"
        fill="none"
        stroke={getAlphaColor(settings.color, settings.opacity)}
        strokeLinecap="round"
        strokeWidth={Math.max(2, Math.min(4, settings.width / 2))}
      />
      <path
        d="M30 6 L24 6 M30 6 L27 12"
        fill="none"
        stroke={getAlphaColor(settings.color, settings.opacity)}
        strokeLinecap="round"
        strokeWidth={2}
      />
    </svg>
  );
}

function renderLinePreview(settings: EditorPresetSettingsMap['line']) {
  return wrapPreview(
    <svg viewBox="0 0 44 20" className="h-5 w-10" aria-hidden="true">
      <path
        d="M7 13 L37 7"
        fill="none"
        stroke={getAlphaColor(settings.color, settings.opacity)}
        strokeLinecap="round"
        strokeWidth={Math.max(2, Math.min(4, settings.width / 2))}
      />
    </svg>
  );
}

function resolveBlurPreviewStyle(settings: EditorPresetSettingsMap['blur']) {
  const sharedStyle = {
    backgroundColor: 'rgb(15 23 42 / 0.9)',
    border: '1px solid rgb(255 255 255 / 0.16)',
  } as const;

  switch (settings.blurType) {
    case 'distortion':
      return {
        ...sharedStyle,
        backgroundImage:
          'repeating-linear-gradient(135deg, rgb(255 255 255 / 0.18) 0 3px, transparent 3px 6px)',
      };
    case 'pixelate':
      return {
        ...sharedStyle,
        backgroundImage:
          'linear-gradient(90deg, rgb(255 255 255 / 0.2) 50%, transparent 50%), ' +
          'linear-gradient(rgb(255 255 255 / 0.2) 50%, transparent 50%)',
        backgroundSize: '4px 4px',
      };
    case 'solid': {
      const opacity = Math.min(1, Math.max(0.08, settings.amount / 25));
      return {
        backgroundColor: `rgb(15 23 42 / ${opacity.toFixed(3)})`,
        border: '1px solid rgb(255 255 255 / 0.16)',
      };
    }
    case 'gaussian':
      return {
        ...sharedStyle,
        filter: 'blur(0.6px)',
      };
  }
}

type BrushPreviewSettings =
  | EditorPresetSettingsMap['pencil']
  | EditorPresetSettingsMap['highlighter'];

function renderBlurPreview(settings: EditorPresetSettingsMap['blur']) {
  return wrapPreview(
    <span className="block h-4 w-7 rounded-[5px]" style={resolveBlurPreviewStyle(settings)} />
  );
}

function renderTextPreview(settings: EditorPresetSettingsMap['text']) {
  return wrapPreview(
    <span
      className="flex h-4 min-w-7 items-center justify-center rounded-[5px] px-1 text-[10px] font-semibold"
      style={{
        backgroundColor: getAlphaColor(settings.backgroundColor, settings.backgroundOpacity),
        color: settings.textColor,
      }}
    >
      T
    </span>
  );
}

function renderStepPreview(settings: EditorPresetSettingsMap['step']) {
  return wrapPreview(
    <span
      className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
      style={{ backgroundColor: settings.color }}
    >
      {settings.type === 'number' ? settings.value || '1' : settings.value || 'A'}
    </span>
  );
}

function renderScenePreview(settings: EditorSceneBackgroundSettings) {
  const background =
    settings.backgroundMode === 'gradient'
      ? createEditorFrameGradientCss(settings)
      : settings.backgroundColor;

  return wrapPreview(
    <span className="block h-4 w-8 rounded-[5px] border border-white/20" style={{ background }} />
  );
}

export function renderEditorPresetPreview<TKey extends EditorPresetFamily>(
  family: TKey,
  preset: EditorPreset<EditorPresetSettingsMap[TKey]>
) {
  switch (family) {
    case 'pencil':
    case 'highlighter':
      return renderBrushPreview(preset.settings as BrushPreviewSettings);
    case 'ellipse':
      return renderShapePreview(preset.settings as EditorPresetSettingsMap['ellipse']);
    case 'blur':
      return renderBlurPreview(preset.settings as EditorPresetSettingsMap['blur']);
    case 'arrow':
      return renderArrowPreview(preset.settings as EditorPresetSettingsMap['arrow']);
    case 'line':
      return renderLinePreview(preset.settings as EditorPresetSettingsMap['line']);
    case 'text':
      return renderTextPreview(preset.settings as EditorPresetSettingsMap['text']);
    case 'step':
      return renderStepPreview(preset.settings as EditorPresetSettingsMap['step']);
    case 'sceneBackground':
      return renderScenePreview(preset.settings as EditorSceneBackgroundSettings);
  }
}

export function renderBorderPresetPreview(preset: BorderPreset) {
  return wrapPreview(
    <span
      className="block h-4 w-8 rounded-[5px] border"
      style={{
        backgroundColor: getAlphaColor(preset.fillColor, preset.fillOpacity / 100),
        borderColor: getAlphaColor(preset.color, preset.strokeOpacity / 100),
        borderWidth: Math.max(1, Math.min(3, Math.round(preset.width / 2))),
      }}
    />
  );
}
