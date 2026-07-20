import { validateCssString } from '../../../../../features/highlighter/css-sanitizer/css';
import { DEFAULT_BORDER_PRESET } from '../../../../../composition/persistence/highlighter';
import { colorToRgba, resolveBorderShadowVisual } from '../../../../../features/highlighter/style';
import type { BorderPreset } from '../../../../../features/highlighter/contracts';
import type { BorderPresetDraftSetters } from '../useBorderPresetEditorState/types';

export function pickBorderPresetDraftSetters(setters: BorderPresetDraftSetters) {
  return setters;
}

export function applyBorderPresetDraftState(
  nextPreset: BorderPreset,
  setters: BorderPresetDraftSetters
) {
  setters.setName(nextPreset.name);
  setters.setWidth(nextPreset.width);
  setters.setColor(nextPreset.color);
  setters.setStyle(nextPreset.style);
  setters.setRadius(nextPreset.radius);
  setters.setPadding({ ...nextPreset.padding });
  setters.setShadow(nextPreset.shadow);
  setters.setOpacity(nextPreset.opacity);
  setters.setStrokeOpacity(nextPreset.strokeOpacity);
  setters.setFillColor(nextPreset.fillColor);
  setters.setFillOpacity(nextPreset.fillOpacity);
  setters.setInheritCustomCss(nextPreset.inheritCustomCss);
  setters.setCustomCss(nextPreset.customCss);
}

export function resetBorderPresetDraftState(setters: BorderPresetDraftSetters) {
  setters.setName('');
  setters.setWidth(DEFAULT_BORDER_PRESET.width);
  setters.setColor(DEFAULT_BORDER_PRESET.color);
  setters.setStyle(DEFAULT_BORDER_PRESET.style);
  setters.setRadius(DEFAULT_BORDER_PRESET.radius);
  setters.setPadding({ ...DEFAULT_BORDER_PRESET.padding });
  setters.setShadow(DEFAULT_BORDER_PRESET.shadow);
  setters.setOpacity(DEFAULT_BORDER_PRESET.opacity);
  setters.setStrokeOpacity(DEFAULT_BORDER_PRESET.strokeOpacity);
  setters.setFillColor(DEFAULT_BORDER_PRESET.fillColor);
  setters.setFillOpacity(DEFAULT_BORDER_PRESET.fillOpacity);
  setters.setInheritCustomCss(DEFAULT_BORDER_PRESET.inheritCustomCss);
  setters.setCustomCss('');
}

export function buildBorderPresetPreviewStyle({
  color,
  customCss,
  fillColor,
  fillOpacity,
  inheritCustomCss,
  radius,
  shadow,
  strokeOpacity,
  style,
  width,
}: {
  color: string;
  customCss: string;
  fillColor: string;
  fillOpacity: number;
  inheritCustomCss: boolean;
  radius: number;
  shadow: number;
  strokeOpacity: number;
  style: 'solid' | 'dashed' | 'dotted';
  width: number;
}) {
  const customCssStyles = inheritCustomCss ? validateCssString(customCss).styles : {};
  const shadowVisual = resolveBorderShadowVisual(shadow, color);

  return {
    width: '80px',
    height: '80px',
    borderWidth: `${width}px`,
    borderStyle: style,
    borderColor: colorToRgba(color, strokeOpacity),
    borderRadius: `${radius}px`,
    backgroundColor: colorToRgba(fillColor, fillOpacity),
    opacity: 1,
    boxShadow: shadowVisual.settingsPreviewBoxShadow,
    ...customCssStyles,
  } satisfies React.CSSProperties;
}
