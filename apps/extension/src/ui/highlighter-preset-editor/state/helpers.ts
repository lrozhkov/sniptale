import { validateCssString } from '../../../features/highlighter/css-sanitizer/css';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import {
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
  setters.setFillColor(nextPreset.fillColor);
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
  setters.setFillColor(DEFAULT_BORDER_PRESET.fillColor);
  setters.setEffects(cloneBorderPresetEffects(DEFAULT_BORDER_PRESET.effects));
  setters.setInheritCustomCss(DEFAULT_BORDER_PRESET.inheritCustomCss);
  setters.setCustomCss('');
}

export function buildBorderPresetPreviewStyle({
  color,
  customCss,
  fillColor,
  inheritCustomCss,
  radius,
  shadow,
  style,
  width,
}: {
  color: string;
  customCss: string;
  fillColor: string;
  inheritCustomCss: boolean;
  radius: number;
  shadow: number;
  style: 'solid' | 'dashed' | 'dotted';
  width: number;
}) {
  const customCssStyles = inheritCustomCss
    ? projectFrameDecorationCssStyles(validateCssString(customCss).styles)
    : {};
  const shadowVisual = resolveBorderShadowVisual(shadow, color);

  return {
    backgroundColor: fillColor,
    boxShadow: shadowVisual.settingsPreviewBoxShadow,
    opacity: 1,
    ...customCssStyles,
    width: '80px',
    height: '80px',
    borderWidth: `${width}px`,
    borderStyle: style,
    borderColor: color,
    borderRadius: `${radius}px`,
  } satisfies React.CSSProperties;
}
