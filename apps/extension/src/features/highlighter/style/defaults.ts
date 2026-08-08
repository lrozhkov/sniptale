import type { BlurSettings, BorderPreset, FocusSettings, HighlighterSettings } from '../contracts';
import {
  createSystemBorderPresetCatalog,
  SYSTEM_BORDER_PRESET_CATALOG_REVISION,
} from '../presets/catalog';

/**
 * Дефолтный пресет рамки (системный, нельзя удалить)
 */
export const DEFAULT_BORDER_PRESET: BorderPreset = createSystemBorderPresetCatalog()[0]!;

/**
 * Дефолтные настройки blur
 */
export const DEFAULT_BLUR_SETTINGS: BlurSettings = {
  amount: 10,
  blurType: 'gaussian',
  borderPresetId: null,
  radius: 0,
  shadow: 0,
  showBorder: true,
  strokeColor: '#475569',
  strokeStyle: 'solid',
  strokeWidth: 0,
};

/**
 * Дефолтные настройки focus
 */
export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  blurAmount: 0,
  opacity: 0.5,
  showBorder: true,
};

/**
 * Дефолтные настройки режима выделения
 */
export const DEFAULT_HIGHLIGHTER_SETTINGS: HighlighterSettings = {
  borderPresets: createSystemBorderPresetCatalog(),
  defaultBorderPresetId: DEFAULT_BORDER_PRESET.id,
  defaultEffectMode: 'border',
  defaultBlurSettings: DEFAULT_BLUR_SETTINGS,
  defaultFocusSettings: DEFAULT_FOCUS_SETTINGS,
  systemPresetCatalogRevision: SYSTEM_BORDER_PRESET_CATALOG_REVISION,
  catalogCustomized: false,
};

export function createDefaultHighlighterSettings(): HighlighterSettings {
  return {
    borderPresets: createSystemBorderPresetCatalog(),
    defaultBorderPresetId: DEFAULT_BORDER_PRESET.id,
    defaultEffectMode: DEFAULT_HIGHLIGHTER_SETTINGS.defaultEffectMode,
    defaultBlurSettings: { ...DEFAULT_BLUR_SETTINGS },
    defaultFocusSettings: { ...DEFAULT_FOCUS_SETTINGS },
    systemPresetCatalogRevision: SYSTEM_BORDER_PRESET_CATALOG_REVISION,
    catalogCustomized: false,
  };
}
