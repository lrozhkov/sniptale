import type { BlurSettings, BorderPreset, FocusSettings, HighlighterSettings } from '../contracts';
import { DEFAULT_COLOR_ACCENT } from '@sniptale/ui/default-colors/constants';
import { translate } from '../../../platform/i18n';

/**
 * Дефолтный пресет рамки (системный, нельзя удалить)
 */
export const DEFAULT_BORDER_PRESET: BorderPreset = {
  id: 'system-default',
  name: translate('shared.defaults.defaultBorderPresetName'),
  isSystemDefault: true,
  enabled: true,
  order: 0,
  width: 3,
  color: DEFAULT_COLOR_ACCENT,
  style: 'solid',
  radius: 0,
  padding: { top: 3, left: 3, right: 3, bottom: 3 },
  shadow: 0,
  opacity: 100,
  strokeOpacity: 100,
  fillColor: '#00000000',
  fillOpacity: 0,
  inheritCustomCss: false,
  customCss: '',
};

/**
 * Дефолтные настройки blur
 */
export const DEFAULT_BLUR_SETTINGS: BlurSettings = {
  amount: 10,
  blurType: 'gaussian',
  borderPresetId: null,
  radius: 0,
  shadow: 0,
  showBorder: false,
  strokeColor: '#475569',
  strokeOpacity: 1,
  strokeStyle: 'solid',
  strokeWidth: 0,
};

/**
 * Дефолтные настройки focus
 */
export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  opacity: 0.5,
  showBorder: false,
};

/**
 * Дефолтные настройки режима выделения
 */
export const DEFAULT_HIGHLIGHTER_SETTINGS: HighlighterSettings = {
  borderPresets: [DEFAULT_BORDER_PRESET],
  defaultBorderPresetId: DEFAULT_BORDER_PRESET.id,
  defaultEffectMode: 'border',
  defaultBlurSettings: DEFAULT_BLUR_SETTINGS,
  defaultFocusSettings: DEFAULT_FOCUS_SETTINGS,
};

function cloneDefaultBorderPreset(): BorderPreset {
  return {
    ...DEFAULT_BORDER_PRESET,
    padding: { ...DEFAULT_BORDER_PRESET.padding },
  };
}

export function createDefaultHighlighterSettings(): HighlighterSettings {
  return {
    borderPresets: [cloneDefaultBorderPreset()],
    defaultBorderPresetId: DEFAULT_BORDER_PRESET.id,
    defaultEffectMode: DEFAULT_HIGHLIGHTER_SETTINGS.defaultEffectMode,
    defaultBlurSettings: { ...DEFAULT_BLUR_SETTINGS },
    defaultFocusSettings: { ...DEFAULT_FOCUS_SETTINGS },
  };
}
