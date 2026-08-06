import { validateCssString } from '../../../features/highlighter/css-sanitizer/css';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import {
  colorToRgba,
  projectFrameDecorationCssStyles,
  resolveBorderShadowVisual,
} from '../../../features/highlighter/style';
import type { BorderPreset } from '../../../features/highlighter/contracts';
import { getBorderPresetDisplayName } from '../../../features/highlighter/presets/display-name';
import type { AppLocale } from '../../../platform/i18n';
import type { BorderPresetDraftSetters } from '../useBorderPresetEditorState/types';
import { cloneBorderPresetEffects } from '@sniptale/runtime-contracts/highlighter/border-preset';

export function applyBorderPresetDraftState(
  nextPreset: BorderPreset,
  setters: BorderPresetDraftSetters,
  locale?: AppLocale
) {
  setters.setName(getBorderPresetDisplayName(nextPreset, locale));
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
  setters.setEffects(cloneBorderPresetEffects(nextPreset.effects));
  setters.setInheritCustomCss(Boolean(nextPreset.customCss.trim()));
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
  setters.setEffects(cloneBorderPresetEffects(DEFAULT_BORDER_PRESET.effects));
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
  const customCssStyles = inheritCustomCss
    ? projectFrameDecorationCssStyles(validateCssString(customCss).styles)
    : {};
  const shadowVisual = resolveBorderShadowVisual(shadow, color);

  return {
    backgroundColor: colorToRgba(fillColor, fillOpacity),
    boxShadow: shadowVisual.settingsPreviewBoxShadow,
    opacity: 1,
    ...customCssStyles,
    width: '80px',
    height: '80px',
    borderWidth: `${width}px`,
    borderStyle: style,
    borderColor: colorToRgba(color, strokeOpacity),
    borderRadius: `${radius}px`,
  } satisfies React.CSSProperties;
}
