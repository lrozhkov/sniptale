import type {
  AutoBlurCategory,
  AutoBlurSettings,
} from '../../../../features/highlighter/contracts/auto-blur';
import {
  AUTO_BLUR_CATEGORIES,
  AUTO_BLUR_CATEGORY_ORDER,
} from '../../../../features/highlighter/contracts/auto-blur';
import type { BlurSettings } from '../../../../features/highlighter/contracts';
import { browserStorage } from '../../../../composition/persistence/infrastructure/browser-storage';
import { createLogger } from '@sniptale/platform/observability/logger';
import { DEFAULT_BLUR_SETTINGS } from '../../../../features/highlighter/style/defaults';
import {
  isBoolean,
  isNumber,
  isRecord,
  isString,
} from '../../../../composition/persistence/infrastructure/guards/primitives';
import { createStorageWriteQueue } from '../../../../composition/persistence/infrastructure/write-queue';

export const AUTO_BLUR_SETTINGS_KEY = 'sniptale_auto_blur_settings';

const logger = createLogger({ namespace: 'SharedAutoBlurStorage' });
const categoryValues = new Set<AutoBlurCategory>(Object.values(AUTO_BLUR_CATEGORIES));
const blurTypes = new Set<BlurSettings['blurType']>([
  'gaussian',
  'distortion',
  'pixelate',
  'solid',
]);

let cachedAutoBlurSettings: AutoBlurSettings | null = null;
const enqueueAutoBlurWrite = createStorageWriteQueue();

export const DEFAULT_AUTO_BLUR_SETTINGS: AutoBlurSettings = {
  autoApplyEnabled: false,
  selectedCategories: [...AUTO_BLUR_CATEGORY_ORDER],
  blurSettings: { ...DEFAULT_BLUR_SETTINGS },
};

function cloneAutoBlurSettings(settings: AutoBlurSettings): AutoBlurSettings {
  return {
    autoApplyEnabled: settings.autoApplyEnabled,
    selectedCategories: [...settings.selectedCategories],
    blurSettings: { ...settings.blurSettings },
  };
}

function normalizeCategoryValue(value: unknown): AutoBlurCategory | null {
  if (!isString(value)) {
    return null;
  }

  if (value === 'inn' || value === 'snils' || value === 'passport') {
    return AUTO_BLUR_CATEGORIES.documentNumber;
  }

  return categoryValues.has(value as AutoBlurCategory) ? (value as AutoBlurCategory) : null;
}

function normalizeCategories(value: unknown): AutoBlurCategory[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const selected = new Set(
    value.map(normalizeCategoryValue).filter((category) => category !== null)
  );
  return AUTO_BLUR_CATEGORY_ORDER.filter((category) => selected.has(category));
}

function normalizeBlurSettings(value: unknown): Partial<BlurSettings> | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    ...normalizeCoreBlurSettings(value),
    ...normalizeBlurBorderSettings(value),
    ...normalizeBlurShadowSettings(value),
  };
}

function normalizeCoreBlurSettings(value: Record<string, unknown>): Partial<BlurSettings> {
  const nextSettings: Partial<BlurSettings> = {};
  if (value['amount'] === undefined || isNumber(value['amount'])) {
    if (value['amount'] !== undefined) nextSettings.amount = value['amount'];
  }
  if (value['blurType'] === undefined || isKnownBlurType(value['blurType'])) {
    if (value['blurType'] !== undefined) nextSettings.blurType = value['blurType'];
  }
  if (value['showBorder'] === undefined || isBoolean(value['showBorder'])) {
    if (value['showBorder'] !== undefined) nextSettings.showBorder = value['showBorder'];
  }
  return nextSettings;
}

function normalizeBlurBorderSettings(value: Record<string, unknown>): Partial<BlurSettings> {
  return {
    ...normalizeBorderPresetId(value['borderPresetId']),
    ...normalizeOptionalStringSetting('strokeColor', value['strokeColor']),
    ...normalizeOptionalNumberSetting('strokeWidth', value['strokeWidth']),
    ...normalizeStrokeStyle(value['strokeStyle']),
  };
}

function normalizeBlurShadowSettings(value: Record<string, unknown>): Partial<BlurSettings> {
  return {
    ...normalizeOptionalNumberSetting('radius', value['radius']),
    ...normalizeOptionalNumberSetting('shadow', value['shadow']),
    ...normalizeOptionalNumberSetting('strokeOpacity', value['strokeOpacity']),
  };
}

function isKnownBlurType(value: unknown): value is BlurSettings['blurType'] {
  return isString(value) && blurTypes.has(value as BlurSettings['blurType']);
}

function normalizeBorderPresetId(value: unknown): Partial<BlurSettings> {
  if (value === undefined) return {};
  if (value === null) return { borderPresetId: null };
  return isString(value) ? { borderPresetId: value } : {};
}

function normalizeOptionalStringSetting(key: 'strokeColor', value: unknown): Partial<BlurSettings> {
  return value !== undefined && isString(value) ? { [key]: value } : {};
}

function normalizeOptionalNumberSetting(
  key: 'radius' | 'shadow' | 'strokeOpacity' | 'strokeWidth',
  value: unknown
): Partial<BlurSettings> {
  return value !== undefined && isNumber(value) ? { [key]: value } : {};
}

function normalizeStrokeStyle(value: unknown): Partial<BlurSettings> {
  if (value === undefined || !isKnownStrokeStyle(value)) {
    return {};
  }
  return { strokeStyle: value };
}

function isKnownStrokeStyle(value: unknown): value is BlurSettings['strokeStyle'] {
  return (
    value === 'solid' ||
    value === 'dashed' ||
    value === 'dotted' ||
    value === 'dash' ||
    value === 'dot' ||
    value === 'dash-dot' ||
    value === 'long-dash'
  );
}

function normalizeStoredAutoBlurSettings(value: unknown): AutoBlurSettings {
  if (!isRecord(value)) {
    return cloneAutoBlurSettings(DEFAULT_AUTO_BLUR_SETTINGS);
  }

  const selectedCategories =
    normalizeCategories(value['selectedCategories']) ??
    DEFAULT_AUTO_BLUR_SETTINGS.selectedCategories;
  const blurSettings = normalizeBlurSettings(value['blurSettings']);
  const autoApplyEnabled = isBoolean(value['autoApplyEnabled'])
    ? value['autoApplyEnabled']
    : DEFAULT_AUTO_BLUR_SETTINGS.autoApplyEnabled;

  return {
    autoApplyEnabled,
    selectedCategories,
    blurSettings: {
      ...DEFAULT_AUTO_BLUR_SETTINGS.blurSettings,
      ...(blurSettings ?? {}),
    },
  };
}

async function writeAutoBlurSettings(settings: AutoBlurSettings): Promise<void> {
  const persistedSettings = cloneAutoBlurSettings(settings);
  await browserStorage.sync.set({ [AUTO_BLUR_SETTINGS_KEY]: persistedSettings });
  cachedAutoBlurSettings = persistedSettings;
  logger.debug('Saved auto-blur settings');
}

export async function loadAutoBlurSettings(): Promise<AutoBlurSettings> {
  const result = await browserStorage.sync.get([AUTO_BLUR_SETTINGS_KEY]);
  const settings = normalizeStoredAutoBlurSettings(result[AUTO_BLUR_SETTINGS_KEY]);
  cachedAutoBlurSettings = cloneAutoBlurSettings(settings);
  return settings;
}

export function getLoadedAutoBlurSettingsSnapshot(): AutoBlurSettings | null {
  return cachedAutoBlurSettings ? cloneAutoBlurSettings(cachedAutoBlurSettings) : null;
}

export async function saveAutoBlurSettings(settings: AutoBlurSettings): Promise<void> {
  await enqueueAutoBlurWrite(() => writeAutoBlurSettings(settings));
}
